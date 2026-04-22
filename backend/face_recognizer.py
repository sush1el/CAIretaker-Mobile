"""
face_recognizer.py  —  MobileFaceNet / InsightFace face recognition for CAIretaker

Provides FaceRecognizer: a lightweight wrapper around insightface that:
  1. Detects faces inside a person's bounding box crop.
  2. Extracts a 512-d ArcFace (MobileFaceNet) embedding.
  3. Matches against named profiles stored in FaceProfileDB.

Install dependencies:
    pip install insightface onnxruntime

Models auto-downloaded to ~/.insightface/ on first run (~400 MB total).
Subsequent runs are instant (cached to disk).

Usage:
    recognizer = FaceRecognizer()

    # Identification (returns label like "Maria" or None)
    label, is_known, similarity = recognizer.identify(box_xyxy, frame)

    # Enrolment (save a new named profile from the current crop)
    success = recognizer.enroll("Maria", box_xyxy, frame)

    # Reload DB cache (after external profile edits)
    recognizer.reload_profiles()
"""

import os
import sys
import numpy as np

# ---- InsightFace import (optional — graceful degradation) ----
try:
    import insightface
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    print("[FaceRecognizer] insightface not installed — face recognition disabled")
    print("                 Install with: pip install insightface onnxruntime")

# ---- local database import ----
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import FaceProfileDB


# ---------------------------------------------------------------------------
# Helper: face crop from person bounding box
# ---------------------------------------------------------------------------

def _crop_face_region(frame, box_xyxy, keypoints=None, face_fraction: float = 0.35):
    """
    Crop the upper face_fraction of a person bounding box.

    Because YOLO gives us a full-body box, the face is typically in the
    top ~30-40 %.  We return this crop (resized to at least 112×112 so
    InsightFace can work with it).

    Args:
        frame:         BGR numpy array — full camera frame
        box_xyxy:      (x1, y1, x2, y2) in pixels
        keypoints:     Optional YOLO keypoints for this person (num_kps, 3)
        face_fraction: fallback fraction if keypoints not provided

    Returns:
        crop_bgr: numpy array or None if crop too small
    """
    h_frame, w_frame = frame.shape[:2]

    x1 = max(0, int(box_xyxy[0]))
    y1 = max(0, int(box_xyxy[1]))
    x2 = min(w_frame, int(box_xyxy[2]))
    y2 = min(h_frame, int(box_xyxy[3]))

    box_h = y2 - y1
    box_w = x2 - x1

    if box_h < 20 or box_w < 10:
        return None

    # Use keypoints if available (0: nose, 1: left eye, 2: right eye, 3: left ear, 4: right ear)
    if keypoints is not None and len(keypoints) >= 5:
        # Check if nose (0) or eyes (1, 2) are visible (conf > 0.3)
        face_kps = [kp for kp in keypoints[0:5] if kp[2] > 0.3]
        if face_kps:
            # Center of the face based on visible face keypoints
            avg_y = sum(kp[1] for kp in face_kps) / len(face_kps)
            
            # Use the box width to determine a reasonable crop height (faces are roughly square/slightly tall)
            # We take a square crop centered around the face keypoints
            crop_size = max(60, int(box_w * 1.2))  # Ensure minimum size
            
            cy = int(avg_y)
            cy_start = max(y1, cy - crop_size // 2)
            cy_end = min(y2, cy + crop_size // 2)
            
            # If the crop is reasonably sized, use it
            if cy_end - cy_start >= 20:
                crop = frame[cy_start:cy_end, x1:x2]
                if crop.size > 0:
                    return crop

    # Fallback: Take upper face_fraction of height; full width
    face_y2 = y1 + max(20, int(box_h * face_fraction))
    face_y2 = min(face_y2, y2)

    crop = frame[y1:face_y2, x1:x2]

    if crop.size == 0:
        return None

    return crop


# ---------------------------------------------------------------------------
# FaceRecognizer
# ---------------------------------------------------------------------------

class FaceRecognizer:
    """
    Stateless face recognition wrapper.

    - Uses InsightFace buffalo_s model (lightweight, CPU-friendly).
    - Embeddings are compared against FaceProfileDB via cosine similarity.
    - Recognition runs at a configurable interval per track_id (see
      FACE_RECOGNITION_INTERVAL in Config) to limit CPU usage.

    Thread-safety: all public methods are thread-safe as long as a single
    FaceRecognizer is instantiated once and shared across threads.
    """

    # ArcFace embedding normalisation is L2; cosine similarity on L2-normalised
    # vectors is equivalent to dot product and ranges [-1, 1].  Values ≥ 0.40
    # consistently indicate the same person.
    DEFAULT_THRESHOLD = 0.40

    # insightface det_size: smaller = faster but less accurate on tiny faces.
    # (160, 160) is a good tradeoff for fixed-camera eldercare.
    DET_SIZE_DEFAULT = (160, 160)
    DET_SIZE_PI      = (128, 128)   # Lower resolution for Pi CPU budget

    def __init__(
        self,
        threshold: float = DEFAULT_THRESHOLD,
        db_path: str = None,
        det_size: tuple = None,
        is_pi: bool = False,
    ):
        self.threshold  = threshold
        self.enabled    = False
        self._app       = None

        # Face profile database
        self.face_db = FaceProfileDB(db_path=db_path, threshold=threshold)

        if not INSIGHTFACE_AVAILABLE:
            print("[FaceRecognizer] Disabled (insightface not installed)")
            return

        # Pick detection resolution
        if det_size is None:
            det_size = self.DET_SIZE_PI if is_pi else self.DET_SIZE_DEFAULT

        try:
            print(f"[FaceRecognizer] Initialising InsightFace (det_size={det_size})…")
            self._app = FaceAnalysis(
                name="buffalo_s",                       # lightweight MobileFaceNet bundle
                allowed_modules=["detection", "recognition"],
                providers=["CPUExecutionProvider"],     # CPU only (Hailo = YOLO, not faces)
            )
            self._app.prepare(ctx_id=0, det_size=det_size)
            self.enabled = True
            print("[FaceRecognizer] InsightFace ready ✓")
            print(f"  Threshold:  {threshold:.2f} (cosine similarity)")
            print(f"  Profiles:   {len(self.face_db._cache)} loaded from DB")
        except Exception as exc:
            print(f"[FaceRecognizer] Failed to initialise InsightFace: {exc}")
            print("                 Face recognition disabled (detection unaffected)")

    # ------------------------------------------------------------------ #
    # Embedding extraction                                                 #
    # ------------------------------------------------------------------ #

    def extract_embedding(self, face_crop_bgr) -> np.ndarray | None:
        """
        Run InsightFace detection + ArcFace embedding on a face crop.

        Returns a normalised 512-d float32 array, or None if no face found.
        """
        if not self.enabled or face_crop_bgr is None:
            return None

        # Ensure minimum size InsightFace can process
        import cv2
        h, w = face_crop_bgr.shape[:2]
        if h < 20 or w < 20:
            return None

        # Resize up if too small, preserving aspect ratio
        if h < 80 or w < 60:
            scale = max(80 / h, 60 / w)
            face_crop_bgr = cv2.resize(
                face_crop_bgr,
                (int(w * scale), int(h * scale)),
                interpolation=cv2.INTER_LINEAR,
            )

        try:
            faces = self._app.get(face_crop_bgr)
        except Exception as exc:
            print(f"[FaceRecognizer] InsightFace error: {exc}")
            return None

        if not faces:
            return None

        # Use the largest detected face (by bounding box area)
        largest = max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
        )

        emb = largest.normed_embedding  # shape (512,), L2-normalised
        if emb is None:
            return None

        return emb.astype(np.float32)

    # ------------------------------------------------------------------ #
    # Identification                                                        #
    # ------------------------------------------------------------------ #

    def identify(self, box_xyxy, frame, keypoints=None) -> tuple:
        """
        Attempt to identify the person inside box_xyxy.

        Args:
            box_xyxy:  (x1, y1, x2, y2) person bounding box in pixels
            frame:     full BGR camera frame
            keypoints: optional YOLO keypoints

        Returns:
            (label, is_known, similarity)
            - label:      name string if known, else None
            - is_known:   True if similarity >= threshold
            - similarity: best cosine similarity found (0.0 if no embedding)
        """
        if not self.enabled:
            return None, False, 0.0

        crop = _crop_face_region(frame, box_xyxy, keypoints)
        if crop is None:
            return None, False, 0.0

        emb = self.extract_embedding(crop)
        if emb is None:
            return None, False, 0.0

        name, sim = self.face_db.find_match(emb)
        is_known   = name is not None
        
        # Debug logging to help understand why recognition might be failing
        if name:
            print(f"[FaceRecognizer] Match: {name} (sim: {sim:.3f})")
        else:
            print(f"[FaceRecognizer] No match (best sim: {sim:.3f})")
            
        return name, is_known, float(sim)

    # ------------------------------------------------------------------ #
    # Enrolment                                                            #
    # ------------------------------------------------------------------ #

    def enroll(self, name: str, box_xyxy, frame) -> bool:
        """
        Enroll the face inside box_xyxy under the given name.

        If a profile with that name already exists, its embedding is updated
        (useful for improving accuracy with additional examples).

        Returns True on success.
        """
        if not self.enabled:
            print(f"[FaceRecognizer] Cannot enrol '{name}' — InsightFace disabled")
            return False

        crop = _crop_face_region(frame, box_xyxy)
        if crop is None:
            print(f"[FaceRecognizer] Enrol '{name}' failed — crop too small")
            return False

        emb = self.extract_embedding(crop)
        if emb is None:
            print(f"[FaceRecognizer] Enrol '{name}' failed — no face detected in crop")
            return False

        profile_id = self.face_db.add_or_update_profile(name, emb)
        return profile_id > 0

    def enroll_from_embedding(self, name: str, embedding: np.ndarray) -> bool:
        """Enrol using a pre-extracted embedding (e.g. from API upload)."""
        profile_id = self.face_db.add_or_update_profile(name, embedding)
        return profile_id > 0

    def delete_profile(self, name: str) -> bool:
        """Remove a named profile from DB and memory cache."""
        return self.face_db.delete_profile(name)

    def reload_profiles(self):
        """Reload all embeddings from DB (call after external profile edits)."""
        self.face_db.reload()

    def get_all_profiles(self) -> list:
        """Return list of {id, name, created_at, updated_at} dicts."""
        return self.face_db.get_all_profiles()
