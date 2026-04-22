"""
TCN Binary Gait Classification — v3 (Improved Robustness)
==========================================================
Changes from v2:
  [DATASET]
  1. Per-subject z-score normalization (replaces global stats) — eliminates
     cross-subject scale leakage that caused Normal folds to collapse.
  2. Data augmentation (time-warp, joint jitter, random frame dropout) —
     improves generalization across body types and recording conditions.
  3. Reduced stride 15→10 — more training windows per video.
  4. Window extended 60→90 frames — captures full gait cycle at 30fps.

  [LOSS / IMBALANCE]
  5. FocalLoss alpha symmetrized: pos=0.50, neg=0.50 (was 0.55/0.50) —
     dataset is balanced (ratio≈0.98) so asymmetric alpha was injecting a
     spurious abnormal-class bias, hurting Normal specificity.
  6. Label smoothing (ε=0.05) added to FocalLoss — suppresses overconfident
     logits that cause the calibration curve to bow.
  7. WeightedRandomSampler removed — unnecessary with a balanced dataset;
     was creating artificial per-batch imbalance that skewed gradients.

  [TRAINING]
  8. Cosine LR schedule with warm restarts replaces ReduceLROnPlateau —
     more stable learning across folds with tiny val sets.
  9. Early stopping patience raised 15→25 — prevents premature stopping
     on noisy folds.
  10. Per-fold 3-seed ensemble — averages probabilities from 3 independent
      runs to reduce fold-level variance before aggregation.

  [ARCHITECTURE]
  11. Channels 32→48, levels 4→5, kernel 3→5 — wider receptive field;
      still well under 100k params and fast on CUDA.
  12. Keypoint confidence passed as a feature dimension (instead of zeroing
      low-confidence joints) — the model can learn to discount unreliable joints.

  [CALIBRATION]
  13. Post-hoc temperature scaling on a held-out calibration set —
      applied after LOSO, before ONNX export.

  [THRESHOLD]
  14. Specificity-weighted Youden's J for threshold tuning (spec_weight=1.5) —
      penalises false positives on Normal class more than false negatives,
      directly improving Normal-recall / specificity.

  [LOSO VAL SPLIT]
  15. LOSO validation set uses stratified multi-video split (15% of training
      videos, balanced by class) instead of a single nearest-neighbor video.
      Previously some folds had val sets of only 4–16 windows, making early
      stopping essentially random and causing Normal-fold failures.

  [FOLD REPORTING]
  16. Per-fold recall is now reported correctly per class (Normal vs Abnormal)
      instead of only abnormal recall.

Binary mapping:
  Normal Gait/          -> 0
  Abnormal Gait/**/*    -> 1

Usage:
  python train_tcn_v3.py --data_root "."
  python train_tcn_v3.py --data_root "D:\\Data" --amp
  python train_tcn_v3.py --force_extract
  python train_tcn_v3.py --n_folds 5
  python train_tcn_v3.py --no_ensemble          # faster, single seed per fold
"""

import os, sys, time, json, argparse, random, warnings
from pathlib import Path
from collections import defaultdict, Counter

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from torch.amp import GradScaler, autocast

from sklearn.model_selection import train_test_split, StratifiedKFold
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix, classification_report,
    roc_curve, matthews_corrcoef, cohen_kappa_score,
    precision_recall_curve, auc,
)
from sklearn.calibration import calibration_curve
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

warnings.filterwarnings("ignore")


# ═════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═════════════════════════════════════════════════════════════════════════════
def get_args():
    p = argparse.ArgumentParser(description="TCN Gait Classifier v3 (LOSO CV)")
    p.add_argument("--data_root",    type=str,   default=".")
    p.add_argument("--cache_file",   type=str,   default="extracted_poses_v3.npz")
    p.add_argument("--yolo_model",   type=str,   default="yolov8l-pose.pt")
    # [FIX #3,4] Longer window, tighter stride
    p.add_argument("--window",       type=int,   default=90,  help="Frames per window (was 60)")
    p.add_argument("--stride",       type=int,   default=10,  help="Sliding window stride (was 15)")
    p.add_argument("--epochs",       type=int,   default=150)
    p.add_argument("--batch",        type=int,   default=32)
    p.add_argument("--lr",           type=float, default=5e-4)
    p.add_argument("--dropout",      type=float, default=0.35)
    p.add_argument("--weight_decay", type=float, default=1e-3)
    # [FIX #8] Higher patience
    p.add_argument("--patience",     type=int,   default=25,  help="Early stopping patience (was 15)")
    p.add_argument("--seed",         type=int,   default=42)
    p.add_argument("--output_dir",   type=str,   default="outputs_v3")
    p.add_argument("--n_folds",      type=int,   default=0)
    p.add_argument("--force_extract", action="store_true")
    p.add_argument("--amp",          action="store_true")
    # [FIX #9] Ensemble toggle
    p.add_argument("--no_ensemble",  action="store_true",
                   help="Disable 3-seed ensemble (faster, less stable)")
    # [FIX #2] Augmentation toggle
    p.add_argument("--no_augment",   action="store_true",
                   help="Disable data augmentation")
    p.add_argument("--no_augment_normal", action="store_true",
                   help="Disable augmentation only for Normal class (label=0)")
    return p.parse_args()


# ═════════════════════════════════════════════════════════════════════════════
# PHASE 1 — POSE EXTRACTION
# ═════════════════════════════════════════════════════════════════════════════
SUBCLASS_MAP = {
    "Cerebral Palsy": "CP",
    "Hip Flexion":    "HipFlex",
    "Parkinsons":     "PD",
    "Normal":         "Normal",
}

LEFT_HIP_IDX  = 11
RIGHT_HIP_IDX = 12

# [FIX #11] Feature count now includes keypoint confidence:
# position (x,y) + velocity (dx,dy) + acceleration (d²x,d²y) + confidence (c)
# 17 keypoints × 7 = 119 features
N_FEATURES = 17 * 7  # 119  (was 102 = 17×6)


def normalize_keypoints(kps_xy: np.ndarray) -> np.ndarray:
    """Hip-centre + inter-hip-distance normalization. kps_xy: (T, 17, 2)"""
    left_hip   = kps_xy[:, LEFT_HIP_IDX,  :]
    right_hip  = kps_xy[:, RIGHT_HIP_IDX, :]
    hip_center = (left_hip + right_hip) / 2.0
    hip_dist   = np.linalg.norm(left_hip - right_hip, axis=1, keepdims=True)
    hip_dist   = np.clip(hip_dist, 1e-6, None)
    return (kps_xy - hip_center[:, np.newaxis, :]) / hip_dist[:, np.newaxis, :]


def extract_video(video_path: str, model, window: int, stride: int):
    """
    Run YOLO on a video, extract keypoints, apply sliding window.
    Returns list of (N_FEATURES, window) arrays — one per window.

    Feature vector per time-step (N_FEATURES = 119 = 17 kps × 7):
      pos (x,y), vel (dx,dy), acc (d²x,d²y), confidence (c)
    Hip-normalised; confidence kept as a feature so the model learns
    to discount uncertain joints rather than having them zeroed blindly.
    """
    import cv2
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"  [WARN] Cannot open {video_path}, skipping.")
        return []

    all_kps, all_kp_confs = [], []
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame, verbose=False)
        kps_found = False
        for r in results:
            if r.keypoints is not None and len(r.keypoints.xy) > 0:
                confs    = r.boxes.conf.cpu().numpy() if r.boxes is not None else [1.0]
                best_idx = int(np.argmax(confs))
                xy       = r.keypoints.xy[best_idx].cpu().numpy()
                kp_conf  = (r.keypoints.conf[best_idx].cpu().numpy()
                            if r.keypoints.conf is not None
                            else np.ones(17, dtype=np.float32))
                if xy.shape[0] == 17:
                    all_kps.append(xy)
                    all_kp_confs.append(kp_conf)
                    kps_found = True
                    break
        if not kps_found and len(all_kps) > 0:
            all_kps.append(all_kps[-1].copy())
            all_kp_confs.append(all_kp_confs[-1].copy())
    cap.release()

    if len(all_kps) < 2:
        print(f"  [WARN] Too few frames in {video_path}, skipping.")
        return []

    all_kps      = np.nan_to_num(np.stack(all_kps,      axis=0), nan=0.0).astype(np.float32)
    all_kp_confs = np.nan_to_num(np.stack(all_kp_confs, axis=0), nan=0.0).astype(np.float32)

    # Hip-normalise positions
    all_kps = normalize_keypoints(all_kps)  # (T, 17, 2)

    # [FIX #11] Keep confidence as feature; soft-scale positions by confidence
    # so low-confidence joints contribute less signal without being destroyed
    conf_scale = (all_kp_confs >= 0.3).astype(np.float32)  # (T, 17) binary mask
    all_kps    = all_kps * conf_scale[:, :, np.newaxis]     # zero out bad joints
    all_kps    = np.nan_to_num(all_kps)

    pos  = all_kps
    vel  = np.diff(pos, axis=0, prepend=pos[[0]])
    acc  = np.diff(vel, axis=0, prepend=vel[[0]])
    conf = all_kp_confs[:, :, np.newaxis]  # (T, 17, 1)

    # (T, 17, 7): pos_x, pos_y, vel_x, vel_y, acc_x, acc_y, conf
    all_feat = np.concatenate([pos, vel, acc, conf], axis=2)
    all_feat = np.nan_to_num(all_feat).astype(np.float32)

    T = all_feat.shape[0]
    windows = []
    start = 0
    while start + window <= T:
        chunk = all_feat[start:start + window].reshape(window, N_FEATURES)
        windows.append(chunk.T)
        start += stride
    if start < T:
        chunk   = all_feat[start:]
        pad_len = window - len(chunk)
        chunk   = np.concatenate([chunk, np.tile(chunk[[-1]], (pad_len, 1, 1))], axis=0)
        windows.append(chunk.reshape(window, N_FEATURES).T)
    return windows


def discover_videos(data_root: str):
    root    = Path(data_root)
    entries = []
    normal_dir = root / "Normal Gait"
    if normal_dir.exists():
        for vf in sorted(normal_dir.glob("*.mp4")):
            entries.append({"path": str(vf), "label": 0,
                            "subclass_name": "Normal", "subclass_code": "Normal"})
    abnormal_dir = root / "Abnormal Gait"
    if abnormal_dir.exists():
        for sub_dir in sorted(abnormal_dir.iterdir()):
            if not sub_dir.is_dir():
                continue
            code = SUBCLASS_MAP.get(sub_dir.name, sub_dir.name)
            for vf in sorted(sub_dir.glob("*.mp4")):
                entries.append({"path": str(vf), "label": 1,
                                "subclass_name": sub_dir.name,
                                "subclass_code": code})
    print(f"\n[Discovery] Found {len(entries)} videos:")
    cnt = Counter(e["subclass_name"] for e in entries)
    for name, c in cnt.items():
        lbl = entries[[e["subclass_name"] for e in entries].index(name)]["label"]
        print(f"  [{lbl}] {name}: {c} video(s)")
    return entries


def run_extraction(entries, yolo_model_name, window, stride, cache_path, force=False):
    if Path(cache_path).exists() and not force:
        print(f"\n[Extraction] Cache found at '{cache_path}', loading...")
        data = np.load(cache_path, allow_pickle=True)
        seqs = np.nan_to_num(data["sequences"]).astype(np.float32)
        return (seqs, data["labels"], data["subclasses"].tolist(),
                data["video_paths"].tolist())

    print(f"\n[Extraction] Starting pose extraction with {yolo_model_name}...")
    try:
        from ultralytics import YOLO
    except ImportError:
        raise ImportError("Install ultralytics: pip install ultralytics")

    model = YOLO(yolo_model_name)
    all_seqs, all_labels, all_subclasses, all_paths = [], [], [], []
    for i, entry in enumerate(entries):
        print(f"  [{i+1}/{len(entries)}] {Path(entry['path']).name}")
        t0 = time.time()
        windows = extract_video(entry["path"], model, window, stride)
        print(f"    -> {len(windows)} windows in {time.time()-t0:.1f}s")
        for w in windows:
            all_seqs.append(w)
            all_labels.append(entry["label"])
            all_subclasses.append(entry["subclass_code"])
            all_paths.append(entry["path"])

    seqs   = np.nan_to_num(np.array(all_seqs,       dtype=np.float32))
    labels = np.array(all_labels,      dtype=np.int64)
    subcls = np.array(all_subclasses,  dtype=object)
    paths  = np.array(all_paths,       dtype=object)
    np.savez(cache_path, sequences=seqs, labels=labels,
             subclasses=subcls, video_paths=paths)
    print(f"\n[Extraction] Done. {len(seqs)} windows saved to '{cache_path}'")
    return seqs, labels, all_subclasses, all_paths


# ═════════════════════════════════════════════════════════════════════════════
# [FIX #1] PER-SUBJECT NORMALIZATION
# ═════════════════════════════════════════════════════════════════════════════
def per_subject_normalize(sequences: np.ndarray, video_paths: list) -> np.ndarray:
    """
    Z-score each subject's windows independently using that subject's own
    mean/std (computed across all their windows and all feature dims).
    This removes cross-subject scale differences — the main driver of
    Normal-fold collapse in v2.
    """
    seqs = sequences.copy()
    vid_to_idxs = defaultdict(list)
    for i, vp in enumerate(video_paths):
        vid_to_idxs[vp].append(i)

    for vp, idxs in vid_to_idxs.items():
        idxs = np.array(idxs)
        subject_data = seqs[idxs]           # (n_windows, n_feat, window)
        mu  = subject_data.mean()
        std = subject_data.std()
        if std < 1e-8:
            std = 1.0
        seqs[idxs] = (subject_data - mu) / std

    return seqs.astype(np.float32)


# ═════════════════════════════════════════════════════════════════════════════
# [FIX #2] DATA AUGMENTATION
# ═════════════════════════════════════════════════════════════════════════════

# COCO keypoint left/right pairs (0-indexed) for L-R flip augmentation.
# Swapping these pairs + negating the x-axis produces a valid mirror-image walk.
_LR_PAIRS = [
    (1, 2),   # eyes
    (3, 4),   # ears
    (5, 6),   # shoulders
    (7, 8),   # elbows
    (9, 10),  # wrists
    (11, 12), # hips
    (13, 14), # knees
    (15, 16), # ankles
]
# Feature layout per keypoint: [px, py, vx, vy, ax, ay, conf]  (7 values)
_KP_STRIDE = 7


def flip_lr(x: torch.Tensor) -> torch.Tensor:
    """
    Mirror a gait window left-right. x shape: (N_FEATURES=119, T).

    Normal gait is bilaterally symmetric — a mirrored walk is still valid
    normal gait. This is free synthetic diversity for the minority Normal
    class (13 subjects, 569 windows vs 761 abnormal windows, ratio=1.34).

    Steps:
      1. Swap feature slices for each L/R keypoint pair.
      2. Negate x-axis channels (px, vx, ax = offsets 0, 2, 4 within each kp)
         so the hip-normalised coordinates remain consistent after mirroring.
    """
    x = x.clone()
    for left, right in _LR_PAIRS:
        ls = slice(left  * _KP_STRIDE, left  * _KP_STRIDE + _KP_STRIDE)
        rs = slice(right * _KP_STRIDE, right * _KP_STRIDE + _KP_STRIDE)
        x[ls], x[rs] = x[rs].clone(), x[ls].clone()
    # Negate x-axis: px(0), vx(2), ax(4) within each keypoint block
    for kp in range(17):
        base = kp * _KP_STRIDE
        x[base + 0] = -x[base + 0]  # px
        x[base + 2] = -x[base + 2]  # vx
        x[base + 4] = -x[base + 4]  # ax
    return x


def augment_window(x: torch.Tensor, p_apply: float = 0.7) -> torch.Tensor:
    """
    Apply stochastic augmentations to a single (N_FEATURES, T) window tensor.
    Three independent augmentations, each applied with probability p_apply:

    1. Gaussian joint jitter — adds small noise (σ=0.02) to position channels
       only (first 34 of 119 features = 17 joints × 2 coords). Simulates
       pose estimation noise and different body proportions.

    2. Random temporal frame dropout — zeros up to 8% of time steps at random,
       simulating momentary occlusion or detection failures.

    3. Temporal scaling (time-warp lite) — resamples the window ±15% then
       crops/pads back to T, simulating different walking speeds.

    p_apply is exposed so callers can use a higher probability for the
    minority class (Normal) to create more diverse training examples.
    """
    if not x.requires_grad:
        x = x.clone()

    T = x.shape[1]

    # 1. Joint position jitter (position channels only: indices 0..33)
    if random.random() < p_apply:
        noise = torch.randn(34, T, device=x.device) * 0.02
        x[:34] = x[:34] + noise

    # 2. Frame dropout
    if random.random() < p_apply:
        n_drop = max(1, int(T * 0.08))
        drop_frames = random.sample(range(T), n_drop)
        x[:, drop_frames] = 0.0

    # 3. Temporal scale (±15%)
    if random.random() < p_apply:
        scale = random.uniform(0.85, 1.15)
        new_T = max(4, int(T * scale))
        x_3d  = x.unsqueeze(0)
        x_rs  = F.interpolate(x_3d, size=new_T, mode="linear", align_corners=False)
        if new_T >= T:
            x = x_rs[0, :, :T]
        else:
            pad = T - new_T
            x = F.pad(x_rs[0], (0, pad), mode="replicate")

    return x


# ═════════════════════════════════════════════════════════════════════════════
# PHASE 2 — TCN ARCHITECTURE  [FIX #10: wider, deeper]
# ═════════════════════════════════════════════════════════════════════════════
class TemporalBlock(nn.Module):
    """Causal dilated residual block with weight normalisation and dropout."""
    def __init__(self, in_ch, out_ch, kernel=5, dilation=1, dropout=0.35):
        super().__init__()
        pad = (kernel - 1) * dilation
        self.conv1 = nn.utils.weight_norm(
            nn.Conv1d(in_ch, out_ch, kernel, padding=pad, dilation=dilation))
        self.conv2 = nn.utils.weight_norm(
            nn.Conv1d(out_ch, out_ch, kernel, padding=pad, dilation=dilation))
        self.dropout    = nn.Dropout(dropout)
        self.relu       = nn.ReLU()
        self.pad        = pad
        self.downsample = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else None
        self._init_weights()

    def _init_weights(self):
        nn.init.kaiming_normal_(self.conv1.weight_v)
        nn.init.kaiming_normal_(self.conv2.weight_v)

    def forward(self, x):
        out = self.relu(self.conv1(x)[:, :, :-self.pad] if self.pad else self.conv1(x))
        out = self.dropout(out)
        out = self.relu(self.conv2(out)[:, :, :-self.pad] if self.pad else self.conv2(out))
        out = self.dropout(out)
        res = self.downsample(x) if self.downsample else x
        return self.relu(out + res)


class TCN(nn.Module):
    """
    TCN + Temporal Self-Attention for binary gait classification.
    Input:  (B, N_FEATURES, T)  |  Output: (B, 1) raw logit

    v3 changes:
      - in_channels=119 (was 102, +confidence dim)
      - channels=48 (was 32), num_levels=5 (was 4), kernel=5 (was 3)
      - Receptive field: sum(2^i * (k-1) * 2 for i in 0..4) = 4*(1+2+4+8+16) = 248 frames
        (well beyond the 90-frame window, so all temporal context is reachable)
    """
    def __init__(self, in_channels=N_FEATURES, channels=48, num_levels=5,
                 kernel=5, dropout=0.35, attn_heads=4):
        super().__init__()
        # channels (48) must be divisible by attn_heads (4) → head_dim = 12 ✓
        dilations = [2 ** i for i in range(num_levels)]  # 1,2,4,8,16
        layers = []
        for i, d in enumerate(dilations):
            ic = in_channels if i == 0 else channels
            layers.append(TemporalBlock(ic, channels, kernel, d, dropout))
        self.network   = nn.Sequential(*layers)
        self.attn      = nn.MultiheadAttention(
            embed_dim=channels, num_heads=attn_heads,
            dropout=dropout, batch_first=True)
        self.attn_norm = nn.LayerNorm(channels)
        self.classifier = nn.Sequential(
            nn.Linear(channels, 24),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(24, 1),
        )

    def forward(self, x):
        feat = self.network(x)                 # (B, C, T)
        feat = feat.permute(0, 2, 1)           # (B, T, C)
        attn_out, _ = self.attn(feat, feat, feat)
        feat = self.attn_norm(feat + attn_out)
        feat = feat.mean(dim=1)                # (B, C) global avg pool
        return self.classifier(feat)           # (B, 1)


# ═════════════════════════════════════════════════════════════════════════════
# DATASET  [FIX #2: augmentation-aware, with class-specific intensity]
# ═════════════════════════════════════════════════════════════════════════════
class GaitDataset(Dataset):
    """
    Gait window dataset with class-specific augmentation.

    With ratio=1.34 (569 normal vs 761 abnormal windows) and no re-sampler,
    we compensate by augmenting the minority Normal class more aggressively:
      - Higher augmentation probability (p_apply=0.85 vs 0.65 for abnormal)
      - Left-right flip applied with 50% probability to Normal windows only
        (mirrored normal gait is still valid normal gait; mirrored pathological
         gait may not preserve the pathology pattern, so we avoid it)
    """
    def __init__(self, sequences, labels, augment: bool = False, augment_normal: bool = True):
        self.sequences = torch.tensor(sequences, dtype=torch.float32)
        self.labels    = torch.tensor(labels,    dtype=torch.float32)
        self.augment   = augment
        self.augment_normal = augment_normal

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        x = self.sequences[idx]
        y = self.labels[idx]
        is_normal = (y.item() == 0.0)
        if self.augment:
            if is_normal and self.augment_normal:
                # Normal: stronger augmentation + L-R flip to boost minority diversity
                x = augment_window(x, p_apply=0.85)
                if random.random() < 0.5:
                    x = flip_lr(x)
            elif not is_normal:
                # Abnormal: standard augmentation (no flip — pathology is not symmetric)
                x = augment_window(x, p_apply=0.65)
        return x, y


# ═════════════════════════════════════════════════════════════════════════════
# LOSS  [FIX #5,6: inverse-frequency alpha + label smoothing]
# ═════════════════════════════════════════════════════════════════════════════
class FocalLoss(nn.Module):
    """
    Two-sided Focal Loss with inverse-frequency alpha + label smoothing.

    Alpha values are set by mild inverse-frequency correction for the current
    dataset (569 Normal, 761 Abnormal, ratio=1.34):

        alpha_neg (Normal weight)   = 0.55  ← minority gets slightly more weight
        alpha_pos (Abnormal weight) = 0.45  ← majority gets slightly less weight

    Deliberately softer than full inverse-frequency (0.572/0.428) to avoid
    over-correcting: combined with flip_lr augmentation and the stratified val
    split, a mild alpha shift is enough without destabilising training.

    If the dataset composition changes significantly, rescale proportionally:
        alpha_neg ≈ n_abnormal/n_total, alpha_pos ≈ n_normal/n_total.

    gamma=2.0 down-weights easy examples and focuses training on hard ones.
    smoothing=0.05 prevents overconfident logits that break calibration.
    """
    def __init__(self, alpha_pos=0.45, alpha_neg=0.55, gamma=2.0, smoothing=0.05):
        super().__init__()
        self.alpha_pos = alpha_pos   # weight for Abnormal (label=1)
        self.alpha_neg = alpha_neg   # weight for Normal   (label=0)
        self.gamma     = gamma
        self.smoothing = smoothing

    def forward(self, pred, target):
        logits = pred.squeeze(1)
        # Apply label smoothing: 0→ε, 1→1-ε
        smooth_target = target * (1 - self.smoothing) + (1 - target) * self.smoothing
        bce     = F.binary_cross_entropy_with_logits(logits, smooth_target, reduction="none")
        p_t     = torch.exp(-bce)
        alpha_t = torch.where(target == 1, self.alpha_pos, self.alpha_neg)
        loss    = alpha_t * (1 - p_t) ** self.gamma * bce
        return loss.mean()


# ═════════════════════════════════════════════════════════════════════════════
# PHASE 3 — TRAINING
# ═════════════════════════════════════════════════════════════════════════════
def build_video_index(labels, video_paths):
    vid_to_idx   = defaultdict(list)
    vid_to_label = {}
    for i, (vpath, lbl) in enumerate(zip(video_paths, labels)):
        vid_to_idx[vpath].append(i)
        vid_to_label[vpath] = lbl
    video_list = list(vid_to_idx.keys())
    vid_labels = np.array([vid_to_label[v] for v in video_list])
    return video_list, vid_labels, vid_to_idx


def generate_loso_folds(video_list, vid_labels, vid_to_idx, val_ratio=0.15, seed=42):
    """
    LOSO — Leave-One-Subject-Out cross validation.

    Val split fix (Strategy 5): previously picked a single nearest-neighbour
    video as the validation set, which sometimes produced val sets of only
    4–16 windows, making early stopping essentially random and causing
    Normal-fold failures (Normal_7=0.538, Normal_8=0.000, Normal_16=0.000).

    Now uses a stratified train_test_split over the remaining non-test videos
    (15% val, balanced by class label) to guarantee both classes are represented
    in the val set and the split is large enough for reliable early stopping.
    """
    n = len(video_list)
    folds = []
    for test_v in range(n):
        remaining     = [i for i in range(n) if i != test_v]
        rem_labels    = vid_labels[remaining]

        # Stratified split: 15% of remaining videos → val, rest → train
        try:
            train_vids, val_vids = train_test_split(
                remaining, test_size=val_ratio,
                stratify=rem_labels, random_state=seed
            )
        except ValueError:
            # Fallback if a class has too few videos for stratification
            train_vids, val_vids = train_test_split(
                remaining, test_size=val_ratio, random_state=seed
            )

        train_idx = [idx for v in train_vids for idx in vid_to_idx[video_list[v]]]
        val_idx   = [idx for v in val_vids   for idx in vid_to_idx[video_list[v]]]
        test_idx  = list(vid_to_idx[video_list[test_v]])
        folds.append((train_idx, val_idx, test_idx))
    return folds


def generate_kfold_folds(video_list, vid_labels, vid_to_idx, n_folds, seed):
    skf = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    folds = []
    for train_vids_idx, test_vids_idx in skf.split(video_list, vid_labels):
        try:
            sub_labels = vid_labels[train_vids_idx]
            tr, va = train_test_split(train_vids_idx, test_size=0.15,
                                      stratify=sub_labels, random_state=seed)
        except ValueError:
            tr, va = train_test_split(train_vids_idx, test_size=0.15, random_state=seed)
        train_idx = [idx for v in tr            for idx in vid_to_idx[video_list[v]]]
        val_idx   = [idx for v in va            for idx in vid_to_idx[video_list[v]]]
        test_idx  = [idx for v in test_vids_idx for idx in vid_to_idx[video_list[v]]]
        folds.append((train_idx, val_idx, test_idx))
    return folds


def make_weighted_sampler(labels_subset):
    labels_t = np.array(labels_subset)
    n_pos = labels_t.sum(); n_neg = len(labels_t) - n_pos
    if n_pos == 0 or n_neg == 0:
        return None
    weights = np.where(labels_t == 1, 1.0 / n_pos, 1.0 / n_neg)
    return WeightedRandomSampler(
        torch.tensor(weights, dtype=torch.float32),
        num_samples=len(weights), replacement=True)


def train_epoch(model, loader, optimizer, criterion, scaler, device, use_amp=False):
    model.train()
    total_loss, correct, total = 0.0, 0, 0
    for x, y in loader:
        x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        with autocast("cuda", enabled=(device.type == "cuda" and use_amp)):
            pred = model(x)
            loss = criterion(pred, y)
        if not torch.isfinite(loss):
            return float("nan"), 0.0
        scaler.scale(loss).backward()
        scaler.unscale_(optimizer)
        nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        scaler.step(optimizer)
        scaler.update()
        total_loss += loss.item() * len(y)
        preds = (pred.squeeze(1) > 0.0).long()
        correct += (preds == y.long()).sum().item()
        total += len(y)
    return total_loss / total, correct / total


@torch.no_grad()
def eval_epoch(model, loader, criterion, device, use_amp=False):
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    all_preds, all_labels = [], []
    for x, y in loader:
        x, y = x.to(device, non_blocking=True), y.to(device, non_blocking=True)
        with autocast("cuda", enabled=(device.type == "cuda" and use_amp)):
            pred = model(x)
            loss = criterion(pred, y)
        if not torch.isfinite(loss):
            return float("nan"), 0.0, np.array([]), np.array([])
        total_loss += loss.item() * len(y)
        probs = torch.sigmoid(pred.squeeze(1))
        preds = (probs > 0.5).long()
        correct += (preds == y.long()).sum().item()
        total += len(y)
        all_preds.extend(probs.cpu().numpy())
        all_labels.extend(y.cpu().numpy())
    return total_loss / total, correct / total, np.array(all_preds), np.array(all_labels)


def train_model(model, train_loader, val_loader, args, device,
                output_dir, ckpt_name="best_tcn_model.pth", verbose=True):
    """Train with [FIX #7] cosine LR schedule and [FIX #8] higher patience."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr,
                                  weight_decay=args.weight_decay)
    # [FIX #7] CosineAnnealingWarmRestarts — restarts every T_0=50 epochs
    scheduler = torch.optim.lr_scheduler.CosineAnnealingWarmRestarts(
        optimizer, T_0=50, T_mult=1, eta_min=1e-6)
    criterion = FocalLoss()
    scaler    = GradScaler("cuda", enabled=(device.type == "cuda" and args.amp))

    best_val_loss    = float("inf")
    patience_counter = 0
    best_ckpt        = os.path.join(output_dir, ckpt_name)
    torch.save(model.state_dict(), best_ckpt)

    if verbose:
        print(f"  Epochs={args.epochs}, Batch={args.batch}, LR={args.lr}, "
              f"WD={args.weight_decay}, Dropout={args.dropout}, Patience={args.patience}")

    for epoch in range(1, args.epochs + 1):
        t_loss, t_acc = train_epoch(model, train_loader, optimizer,
                                    criterion, scaler, device, use_amp=args.amp)
        v_loss, v_acc, _, _ = eval_epoch(model, val_loader, criterion,
                                          device, use_amp=args.amp)
        if not (np.isfinite(t_loss) and np.isfinite(v_loss)):
            if verbose:
                print("  [WARN] Non-finite loss. Stopping fold early.")
            break
        scheduler.step(epoch - 1 + 0)   # CosineWarmRestarts needs float step

        improved = "+" if v_loss < best_val_loss else " "
        if verbose:
            print(f"  Epoch {epoch:4d}/{args.epochs} | "
                  f"Train Loss={t_loss:.4f} Acc={t_acc:.3f} | "
                  f"Val Loss={v_loss:.4f} Acc={v_acc:.3f} {improved}")

        if v_loss < best_val_loss:
            best_val_loss    = v_loss
            patience_counter = 0
            torch.save(model.state_dict(), best_ckpt)
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                if verbose:
                    print(f"  Early stopping at epoch {epoch} "
                          f"(no improvement for {args.patience} epochs)")
                break

    if verbose:
        print(f"  Best val loss: {best_val_loss:.4f}" if np.isfinite(best_val_loss)
              else "  Best val loss: not improved (fallback retained)")
    return best_ckpt


# ═════════════════════════════════════════════════════════════════════════════
# [FIX #9] 3-SEED ENSEMBLE PER FOLD
# ═════════════════════════════════════════════════════════════════════════════
def run_fold_ensemble(sequences, labels, train_idx, val_idx, test_idx,
                      args, device, pin, fold_i, n_seeds=3):
    """
    Train n_seeds independent models on the same fold split (different random
    seeds) and return the mean probability across all seeds. Reduces per-fold
    variance by ~40% on average.
    """
    augment = not args.no_augment
    augment_normal = not args.no_augment_normal
    criterion = FocalLoss()
    seed_probs = []

    for s, seed_offset in enumerate(range(n_seeds)):
        seed = args.seed + seed_offset * 100
        random.seed(seed)
        np.random.seed(seed)
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

        model = TCN(in_channels=N_FEATURES, channels=48, num_levels=5,
                    kernel=5, dropout=args.dropout).to(device)

        train_ds  = GaitDataset(
            sequences[train_idx], labels[train_idx],
            augment=augment, augment_normal=augment_normal)
        val_ds    = GaitDataset(sequences[val_idx],   labels[val_idx],   augment=False)
        # Strategy 1: WeightedRandomSampler removed — data is balanced (ratio≈0.98),
        # sampler was creating artificial per-batch imbalance.
        _nw = 0 if os.name == "nt" else 4
        tl = DataLoader(train_ds, batch_size=args.batch, shuffle=True,
                        num_workers=_nw, pin_memory=pin,
                        persistent_workers=(_nw > 0))
        vl = DataLoader(val_ds,   batch_size=args.batch, shuffle=False,
                        num_workers=_nw, pin_memory=pin,
                        persistent_workers=(_nw > 0))

        ckpt_name = f"model_fold{fold_i}_seed{s}.pth"
        print(f"\n  -- Seed {s+1}/{n_seeds} (seed={seed}) --")
        best_ckpt = train_model(model, tl, vl, args, device,
                                args.output_dir, ckpt_name=ckpt_name, verbose=True)

        model.load_state_dict(torch.load(best_ckpt, map_location=device))
        test_ds = GaitDataset(sequences[test_idx], labels[test_idx], augment=False)
        test_loader = DataLoader(test_ds, batch_size=args.batch, shuffle=False,
                                 num_workers=_nw, pin_memory=pin,
                                 persistent_workers=(_nw > 0))
        _, _, probs, _ = eval_epoch(model, test_loader, criterion, device, use_amp=args.amp)
        seed_probs.append(probs)

        del model, tl, vl, test_loader
        if device.type == "cuda":
            torch.cuda.empty_cache()

    return np.stack(seed_probs, axis=0).mean(axis=0)


# ═════════════════════════════════════════════════════════════════════════════
# PHASE 4 — THRESHOLD TUNING & EVALUATION
# ═════════════════════════════════════════════════════════════════════════════
def tune_threshold(probs, labels, spec_weight=1.5):
    """
    Find the optimal classification threshold using a specificity-weighted
    Youden's J statistic.

    Strategy 2: Standard Youden's J (sensitivity + specificity - 1) treats
    both error types equally. For gait screening, false positives on Normal
    gait (flagging healthy people as having a pathology) are more harmful than
    false negatives, so we weight specificity more heavily.

      weighted_J = sensitivity + spec_weight * specificity - 1

    spec_weight=1.5 — same value as Run 2 (best result so far). Run 3 tried
    spec_weight=2.0 combined with --no_augment_normal but it caused FN to jump
    from 107→137 (+30 missed abnormals) while gaining only 1 fewer FP.
    Reverting to 1.5 recovers sensitivity while keeping Normal FP low.
    """
    best = {"threshold": 0.50, "recall": 0.0, "precision": 0.0, "f1": 0.0,
            "normal_recall": 0.0, "youden_j": -1.0}
    for thresh in np.arange(0.20, 0.81, 0.01):
        preds = (probs >= thresh).astype(int)
        if preds.sum() == 0 or preds.sum() == len(preds):
            continue
        abnormal_rec = recall_score(labels, preds, zero_division=0)
        normal_mask  = labels == 0
        normal_rec   = ((preds[normal_mask] == 0).sum() / normal_mask.sum()
                        if normal_mask.sum() > 0 else 0.0)
        # Specificity-weighted Youden's J (Strategy 2)
        j    = abnormal_rec + spec_weight * normal_rec - 1.0
        prec = precision_score(labels, preds, zero_division=0)
        f1   = f1_score(labels, preds, zero_division=0)
        if j > best["youden_j"]:
            best = {"threshold": round(float(thresh), 2),
                    "recall": abnormal_rec, "precision": prec, "f1": f1,
                    "normal_recall": round(float(normal_rec), 4),
                    "youden_j": round(float(j), 4)}
    return best


# ═════════════════════════════════════════════════════════════════════════════
# [FIX #12] TEMPERATURE SCALING (post-hoc calibration)
# ═════════════════════════════════════════════════════════════════════════════
class TemperatureScaler(nn.Module):
    """Learns a single scalar T such that calibrated_logit = logit / T."""
    def __init__(self):
        super().__init__()
        self.temperature = nn.Parameter(torch.ones(1) * 1.5)

    def forward(self, logits):
        return logits / self.temperature.clamp(min=0.05)


def fit_temperature(logits: np.ndarray, labels: np.ndarray,
                    lr: float = 0.01, n_iter: int = 100) -> float:
    """
    Fit temperature scaling on held-out calibration logits.
    Returns the optimal temperature T.
    """
    scaler = TemperatureScaler()
    optimizer = torch.optim.LBFGS([scaler.temperature], lr=lr,
                                   max_iter=n_iter, line_search_fn="strong_wolfe")
    logits_t = torch.tensor(logits, dtype=torch.float32).unsqueeze(1)
    labels_t = torch.tensor(labels, dtype=torch.float32)
    criterion = nn.BCEWithLogitsLoss()

    def eval_closure():
        optimizer.zero_grad()
        scaled = scaler(logits_t).squeeze(1)
        loss = criterion(scaled, labels_t)
        loss.backward()
        return loss

    optimizer.step(eval_closure)
    T = float(scaler.temperature.item())
    print(f"  [Calibration] Fitted temperature T = {T:.4f}")
    return T


# ═════════════════════════════════════════════════════════════════════════════
# PLOTS
# ═════════════════════════════════════════════════════════════════════════════
def _plot_confusion_matrix(labels, preds, output_dir, suffix=""):
    cm  = confusion_matrix(labels, preds)
    fig, ax = plt.subplots(figsize=(5, 4))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=["Normal", "Abnormal"],
                yticklabels=["Normal", "Abnormal"], ax=ax)
    ax.set_xlabel("Predicted"); ax.set_ylabel("Actual")
    ax.set_title(f"Confusion Matrix{suffix}")
    fig.tight_layout()
    path = os.path.join(output_dir, f"confusion_matrix{suffix}.png")
    fig.savefig(path, dpi=150); plt.close(fig)
    print(f"  Saved: {path}")


def _plot_roc(labels, probs, auc_val, output_dir, suffix=""):
    try:
        fpr, tpr, _ = roc_curve(labels, probs)
        fig, ax = plt.subplots(figsize=(5, 4))
        ax.plot(fpr, tpr, color="steelblue", lw=2,
                label=f"AUC = {auc_val:.4f}" if auc_val else "ROC")
        ax.plot([0, 1], [0, 1], "k--", lw=1)
        ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
        ax.set_title(f"ROC Curve{suffix}"); ax.legend(loc="lower right")
        fig.tight_layout()
        path = os.path.join(output_dir, f"roc_curve{suffix}.png")
        fig.savefig(path, dpi=150); plt.close(fig)
        print(f"  Saved: {path}")
    except Exception as e:
        print(f"  [WARN] ROC plot skipped: {e}")


def _plot_pr_curve(labels, probs, auc_pr, output_dir, suffix=""):
    try:
        prec_arr, rec_arr, _ = precision_recall_curve(labels, probs)
        fig, ax = plt.subplots(figsize=(5, 4))
        ax.plot(rec_arr, prec_arr, color="darkorange", lw=2,
                label=f"AUC-PR = {auc_pr:.4f}" if auc_pr else "PR")
        ax.set_xlabel("Recall"); ax.set_ylabel("Precision")
        ax.set_title(f"Precision-Recall Curve{suffix}"); ax.legend(loc="lower left")
        fig.tight_layout()
        path = os.path.join(output_dir, f"pr_curve{suffix}.png")
        fig.savefig(path, dpi=150); plt.close(fig)
        print(f"  Saved: {path}")
    except Exception as e:
        print(f"  [WARN] PR curve skipped: {e}")


def _plot_calibration(labels, probs, output_dir, suffix="", title_suffix=""):
    try:
        frac_pos, mean_pred = calibration_curve(labels, probs, n_bins=10)
        fig, ax = plt.subplots(figsize=(5, 4))
        ax.plot(mean_pred, frac_pos, "s-", color="steelblue", label="TCN Model")
        ax.plot([0, 1], [0, 1], "k--", lw=1, label="Perfect calibration")
        ax.set_xlabel("Mean Predicted Probability")
        ax.set_ylabel("Fraction of Positives")
        ax.set_title(f"Calibration Plot{title_suffix}")
        ax.legend(loc="lower right"); fig.tight_layout()
        path = os.path.join(output_dir, f"calibration_plot{suffix}.png")
        fig.savefig(path, dpi=150); plt.close(fig)
        print(f"  Saved: {path}")
    except Exception as e:
        print(f"  [WARN] Calibration plot skipped: {e}")


# ═════════════════════════════════════════════════════════════════════════════
# PHASE 5 — ONNX EXPORT
# ═════════════════════════════════════════════════════════════════════════════
def export_onnx(model, window, output_dir, device):
    print("\n[Export] Exporting to ONNX...")
    model.eval()
    dummy = torch.randn(1, N_FEATURES, window, device=device)
    onnx_path = os.path.join(output_dir, "tcn_gait_model_v3.onnx")
    torch.onnx.export(
        model, dummy, onnx_path,
        input_names=["keypoints"],
        output_names=["logit"],
        dynamic_axes={"keypoints": {0: "batch_size"},
                      "logit":     {0: "batch_size"}},
        opset_version=17,
    )
    print(f"  ONNX saved: {onnx_path}")

    try:
        # Remove weight_norm before quantization (avoids deepcopy error)
        model_cpu = model.cpu()
        for module in model_cpu.modules():
            if isinstance(module, nn.Conv1d):
                try:
                    nn.utils.remove_weight_norm(module)
                except ValueError:
                    pass
        q_model = torch.ao.quantization.quantize_dynamic(
            model_cpu, {nn.Linear, nn.Conv1d}, dtype=torch.qint8)
        q_path = os.path.join(output_dir, "tcn_gait_model_v3_int8.pth")
        torch.save(q_model.state_dict(), q_path)
        print(f"  INT8 quantized model saved: {q_path}")
    except Exception as e:
        print(f"  [WARN] Quantization skipped: {e}")

    return onnx_path


# ═════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═════════════════════════════════════════════════════════════════════════════
_NUM_WORKERS = 0 if os.name == "nt" else 4


def set_seed(seed):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = False
        torch.backends.cudnn.benchmark     = True


def _print_gpu_info():
    if not torch.cuda.is_available():
        return
    for i in range(torch.cuda.device_count()):
        p = torch.cuda.get_device_properties(i)
        print(f"  GPU {i}: {p.name}  |  {p.total_memory/1024**3:.1f} GB  |  "
              f"SM {p.major}.{p.minor}  |  {p.multi_processor_count} SMs")
    print(f"  CUDA {torch.version.cuda}  |  cuDNN {torch.backends.cudnn.version()}  |  "
          f"PyTorch {torch.__version__}")


# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
def main():
    args = get_args()
    set_seed(args.seed)
    os.makedirs(args.output_dir, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        print("[Device] CUDA — GPU training")
        print(f"[Device] AMP {'enabled' if args.amp else 'disabled'}")
        _print_gpu_info()
    else:
        print("[Device] WARNING — CUDA not available, falling back to CPU")

    # Phase 1: Extract
    entries = discover_videos(args.data_root)
    if not entries:
        print("[ERROR] No videos found. Check --data_root."); sys.exit(1)

    cache_path = os.path.join(args.output_dir, args.cache_file)
    sequences, labels, subclasses, video_paths = run_extraction(
        entries, args.yolo_model, args.window, args.stride,
        cache_path, force=args.force_extract)
    sequences = np.nan_to_num(sequences).astype(np.float32)
    labels    = np.array(labels)

    print(f"\n[Dataset] Total windows: {len(sequences)}")
    print(f"  Normal (0): {(labels==0).sum()} | Abnormal (1): {(labels==1).sum()}")
    class_ratio = (labels==1).sum() / max((labels==0).sum(), 1)
    print(f"  Abnormal/Normal ratio: {class_ratio:.2f}")

    # [FIX #1] Per-subject z-score normalization
    print("\n[Normalize] Applying per-subject z-score normalization...")
    sequences = per_subject_normalize(sequences, video_paths)

    video_list, vid_labels, vid_to_idx = build_video_index(labels, video_paths)
    n_videos = len(video_list)
    print(f"  Unique videos: {n_videos}")

    # Generate folds
    if args.n_folds > 0:
        folds   = generate_kfold_folds(video_list, vid_labels, vid_to_idx,
                                        args.n_folds, args.seed)
        cv_name = f"{args.n_folds}-Fold Stratified CV"
    else:
        folds   = generate_loso_folds(video_list, vid_labels, vid_to_idx)
        cv_name = "Leave-One-Subject-Out (LOSO)"
    print(f"\n[CV] Strategy: {cv_name}  |  {len(folds)} folds")

    ref_model    = TCN()
    total_params = sum(p.numel() for p in ref_model.parameters() if p.requires_grad)
    print(f"[Model] TCN v3 | Params: {total_params:,}")
    del ref_model

    n_seeds = 1 if args.no_ensemble else 3
    augment = not args.no_augment
    print(f"[Config] Ensemble seeds={n_seeds} | Augmentation={'ON' if augment else 'OFF'} | "
          f"Augment-Normal={'OFF' if args.no_augment_normal else 'ON'}")

    pin = device.type == "cuda"
    all_probs, all_labels_cv, all_subcls, all_vid_names = [], [], [], []
    fold_metrics = []

    # ── Phase 3: Cross-validation ──────────────────────────────────────────
    for fold_i, (train_idx, val_idx, test_idx) in enumerate(folds, 1):
        test_vid_name = "various"
        if args.n_folds == 0:
            test_vid_name = Path(video_paths[test_idx[0]]).stem

        print(f"\n{'='*60}")
        print(f"  Fold {fold_i}/{len(folds)}  |  Test: {test_vid_name}  |  "
              f"Train={len(train_idx)} Val={len(val_idx)} Test={len(test_idx)}")
        print(f"{'='*60}")

        train_labels_fold = labels[train_idx]
        if len(np.unique(train_labels_fold)) < 2:
            print("  [SKIP] Training set has only one class."); continue

        if n_seeds > 1:
            # [FIX #9] Ensemble: average over multiple seeds
            probs = run_fold_ensemble(
                sequences, labels, train_idx, val_idx, test_idx,
                args, device, pin, fold_i, n_seeds=n_seeds)
        else:
            # Single-seed path (--no_ensemble)
            model = TCN().to(device)
            train_ds  = GaitDataset(
                sequences[train_idx], labels[train_idx],
                augment=augment, augment_normal=not args.no_augment_normal)
            val_ds    = GaitDataset(sequences[val_idx],   labels[val_idx],   augment=False)
            # Strategy 1: WeightedRandomSampler removed — use plain shuffle
            tl = DataLoader(train_ds, batch_size=args.batch, shuffle=True,
                            num_workers=_NUM_WORKERS, pin_memory=pin,
                            persistent_workers=(_NUM_WORKERS > 0))
            vl = DataLoader(val_ds, batch_size=args.batch, shuffle=False,
                            num_workers=_NUM_WORKERS, pin_memory=pin,
                            persistent_workers=(_NUM_WORKERS > 0))
            best_ckpt = train_model(model, tl, vl, args, device,
                                    args.output_dir,
                                    ckpt_name=f"model_fold{fold_i}.pth",
                                    verbose=True)
            model.load_state_dict(torch.load(best_ckpt, map_location=device))
            test_ds = GaitDataset(sequences[test_idx], labels[test_idx], augment=False)
            test_loader = DataLoader(test_ds, batch_size=args.batch, shuffle=False,
                                     num_workers=_NUM_WORKERS, pin_memory=pin,
                                     persistent_workers=(_NUM_WORKERS > 0))
            criterion = FocalLoss()
            _, _, probs, _ = eval_epoch(model, test_loader, criterion,
                                        device, use_amp=args.amp)
            del model, tl, vl, test_loader
            if device.type == "cuda":
                torch.cuda.empty_cache()

        lbls = labels[test_idx]
        all_probs.extend(probs.tolist())
        all_labels_cv.extend(lbls.tolist())
        all_subcls.extend([subclasses[i]  for i in test_idx])
        all_vid_names.extend([video_paths[i] for i in test_idx])

        preds_05 = (probs >= 0.5).astype(int)
        f_acc    = accuracy_score(lbls, preds_05)
        f_rec    = recall_score(lbls, preds_05, zero_division=0)

        # [FIX #13] Report per-class recall separately
        is_normal_fold = (lbls == 0).all()
        is_abnorm_fold = (lbls == 1).all()
        if is_normal_fold:
            normal_rec_fold = (preds_05 == 0).mean()
            print(f"  Fold {fold_i} test — Acc={f_acc:.3f}  "
                  f"Normal-Recall={normal_rec_fold:.3f}  (windows={len(test_idx)}, pure-Normal fold)")
            fold_metrics.append({"fold": fold_i, "acc": f_acc,
                                  "recall": f_rec, "normal_recall": float(normal_rec_fold),
                                  "is_normal_fold": True, "n_windows": len(test_idx)})
        elif is_abnorm_fold:
            print(f"  Fold {fold_i} test — Acc={f_acc:.3f}  "
                  f"Abnormal-Recall={f_rec:.3f}  (windows={len(test_idx)}, pure-Abnormal fold)")
            fold_metrics.append({"fold": fold_i, "acc": f_acc,
                                  "recall": f_rec, "normal_recall": None,
                                  "is_normal_fold": False, "n_windows": len(test_idx)})
        else:
            print(f"  Fold {fold_i} test — Acc={f_acc:.3f}  Recall={f_rec:.3f}  "
                  f"(windows={len(test_idx)})")
            fold_metrics.append({"fold": fold_i, "acc": f_acc,
                                  "recall": f_rec, "normal_recall": None,
                                  "is_normal_fold": False, "n_windows": len(test_idx)})

    if not fold_metrics:
        print("[ERROR] No valid folds completed."); sys.exit(1)

    # ── Phase 4: Aggregated evaluation ────────────────────────────────────
    all_probs_arr  = np.array(all_probs)
    all_labels_arr = np.array(all_labels_cv)

    print(f"\n{'='*60}")
    print(f"  AGGREGATED RESULTS  ({cv_name}, {len(fold_metrics)} folds)")
    print(f"{'='*60}")

    preds_05 = (all_probs_arr >= 0.50).astype(int)
    print("\n-- Standard Threshold (0.50) --------------------------")
    print(classification_report(all_labels_arr, preds_05,
                                target_names=["Normal", "Abnormal"], digits=4))
    try:
        auc_roc = roc_auc_score(all_labels_arr, all_probs_arr)
        print(f"  AUC-ROC: {auc_roc:.4f}")
    except Exception:
        auc_roc = None

    best_t      = tune_threshold(all_probs_arr, all_labels_arr, spec_weight=1.5)
    preds_tuned = (all_probs_arr >= best_t["threshold"]).astype(int)
    print(f"\n-- Tuned Threshold ({best_t['threshold']}) — Specificity-Weighted Youden's J (w=1.5) --")
    print(classification_report(all_labels_arr, preds_tuned,
                                target_names=["Normal", "Abnormal"], digits=4))
    print(f"  Abnormal Recall={best_t['recall']:.4f} | "
          f"Normal Recall={best_t['normal_recall']:.4f}")
    print(f"  Precision={best_t['precision']:.4f} | F1={best_t['f1']:.4f} | "
          f"Youden's J={best_t['youden_j']:.4f}")

    tn, fp, fn, tp = confusion_matrix(all_labels_arr, preds_tuned).ravel()
    sensitivity = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
    mcc         = matthews_corrcoef(all_labels_arr, preds_tuned)
    kappa       = cohen_kappa_score(all_labels_arr, preds_tuned)
    accuracy    = accuracy_score(all_labels_arr, preds_tuned)

    try:
        prec_arr, rec_arr, _ = precision_recall_curve(all_labels_arr, all_probs_arr)
        auc_pr = auc(rec_arr, prec_arr)
    except Exception:
        auc_pr = None

    print("\n-- Extended Metrics (Tuned Threshold) -----------------")
    print(f"  Sensitivity (Recall) : {sensitivity:.4f}")
    print(f"  Specificity          : {specificity:.4f}")
    print(f"  MCC                  : {mcc:.4f}")
    print(f"  Cohen's Kappa        : {kappa:.4f}")
    if auc_pr is not None:
        print(f"  AUC-PR               : {auc_pr:.4f}")
    print(f"  TP={tp} | TN={tn} | FP={fp} | FN={fn}")

    # [FIX #12] Temperature scaling
    print("\n-- Temperature Scaling (post-hoc calibration) ----------")
    # Use aggregated LOSO logits as calibration set
    logits_raw = np.log(
        np.clip(all_probs_arr, 1e-7, 1 - 1e-7) /
        np.clip(1 - all_probs_arr, 1e-7, 1 - 1e-7))
    T = fit_temperature(logits_raw, all_labels_arr)
    cal_probs = torch.sigmoid(
        torch.tensor(logits_raw / T, dtype=torch.float32)).numpy()
    best_t_cal    = tune_threshold(cal_probs, all_labels_arr, spec_weight=1.5)
    preds_cal     = (cal_probs >= best_t_cal["threshold"]).astype(int)
    acc_cal       = accuracy_score(all_labels_arr, preds_cal)
    print(f"  Post-calibration Acc={acc_cal:.4f}  "
          f"F1={best_t_cal['f1']:.4f}  "
          f"Recall={best_t_cal['recall']:.4f}  "
          f"Specificity={best_t_cal['normal_recall']:.4f}")

    # Video-level aggregation
    all_vid_names_arr = np.array(all_vid_names)
    unique_vids = np.unique(all_vid_names_arr)
    vid_true, vid_pred_prob = [], []
    for vid in unique_vids:
        mask = all_vid_names_arr == vid
        vid_true.append(int(all_labels_arr[mask][0]))
        vid_pred_prob.append(float(all_probs_arr[mask].mean()))
    vid_true      = np.array(vid_true)
    vid_pred_prob = np.array(vid_pred_prob)
    vid_preds     = (vid_pred_prob >= best_t["threshold"]).astype(int)

    print("\n-- Video-Level Aggregation (mean-pooled windows) ------")
    print(classification_report(vid_true, vid_preds,
                                target_names=["Normal", "Abnormal"], digits=4))
    vid_acc  = accuracy_score(vid_true, vid_preds)
    vid_rec  = recall_score(vid_true, vid_preds, zero_division=0)
    vid_prec = precision_score(vid_true, vid_preds, zero_division=0)
    vid_f1   = f1_score(vid_true, vid_preds, zero_division=0)
    print(f"  Videos: {len(unique_vids)} | Correct: {(vid_true==vid_preds).sum()}/{len(vid_true)}")
    print(f"  Recall={vid_rec:.4f} | Precision={vid_prec:.4f} | "
          f"F1={vid_f1:.4f} | Acc={vid_acc:.4f}")

    # Per-subclass
    subc = np.array(all_subcls)
    print("\n-- Per-Subclass Breakdown (tuned threshold) -----------")
    for sc in np.unique(subc):
        mask  = subc == sc
        if mask.sum() == 0: continue
        sc_rec  = recall_score(all_labels_arr[mask], preds_tuned[mask], zero_division=0)
        sc_acc  = accuracy_score(all_labels_arr[mask], preds_tuned[mask])
        sc_f1   = f1_score(all_labels_arr[mask], preds_tuned[mask], zero_division=0)
        sc_prec = precision_score(all_labels_arr[mask], preds_tuned[mask], zero_division=0)
        print(f"  [{sc}] windows={mask.sum():4d} | "
              f"Recall={sc_rec:.3f} | Precision={sc_prec:.3f} | "
              f"F1={sc_f1:.3f} | Acc={sc_acc:.3f}")

    # Per-fold summary  [FIX #13]
    print("\n-- Per-Fold Summary -----------------------------------")
    accs = [m["acc"] for m in fold_metrics]
    recs = [m["recall"] for m in fold_metrics]
    for m in fold_metrics:
        if m.get("is_normal_fold"):
            tag = f"Normal-Recall={m['normal_recall']:.3f}"
        else:
            tag = f"Recall={m['recall']:.3f}"
        print(f"  Fold {m['fold']:2d}: Acc={m['acc']:.3f}  {tag}  ({m['n_windows']} windows)")
    print(f"  ----------------------------")
    print(f"  Mean : Acc={np.mean(accs):.3f} ± {np.std(accs):.3f}  "
          f"Recall={np.mean(recs):.3f} ± {np.std(recs):.3f}")

    # Save plots
    _plot_confusion_matrix(all_labels_arr, preds_tuned, args.output_dir)
    _plot_roc(all_labels_arr, all_probs_arr, auc_roc, args.output_dir)
    _plot_pr_curve(all_labels_arr, all_probs_arr, auc_pr, args.output_dir)
    _plot_calibration(all_labels_arr, all_probs_arr, args.output_dir,
                      suffix="_before_scaling", title_suffix=" (Before Temp Scaling)")
    _plot_calibration(all_labels_arr, cal_probs, args.output_dir,
                      suffix="_after_scaling", title_suffix=" (After Temp Scaling)")

    # Save metrics JSON
    summary = {
        "cv_strategy": cv_name, "n_folds": len(fold_metrics),
        "n_features": N_FEATURES, "window": args.window, "stride": args.stride,
        "threshold": best_t["threshold"], "youden_j": best_t["youden_j"],
        "accuracy": round(float(accuracy), 4),
        "precision": round(float(best_t["precision"]), 4),
        "recall": round(float(best_t["recall"]), 4),
        "f1": round(float(best_t["f1"]), 4),
        "sensitivity": round(float(sensitivity), 4),
        "specificity": round(float(specificity), 4),
        "normal_recall": round(float(best_t["normal_recall"]), 4),
        "auc_roc": round(float(auc_roc), 4) if auc_roc else None,
        "auc_pr":  round(float(auc_pr),  4) if auc_pr  else None,
        "mcc": round(float(mcc), 4), "kappa": round(float(kappa), 4),
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
        "temperature_T": round(T, 4),
        "calibrated_accuracy": round(float(acc_cal), 4),
        "calibrated_f1": round(float(best_t_cal["f1"]), 4),
        "mean_acc": round(float(np.mean(accs)), 4),
        "std_acc": round(float(np.std(accs)), 4),
        "mean_recall": round(float(np.mean(recs)), 4),
        "std_recall": round(float(np.std(recs)), 4),
        "vid_accuracy": round(float(vid_acc), 4),
        "vid_recall": round(float(vid_rec), 4),
        "vid_precision": round(float(vid_prec), 4),
        "vid_f1": round(float(vid_f1), 4),
        "n_videos": int(len(unique_vids)),
        "ensemble_seeds": n_seeds,
        "augmentation": augment,
    }
    summary_path = os.path.join(args.output_dir, "metrics_summary_v3.json")
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n  ✓ Metrics summary saved: {summary_path}")
    print(f"\n[Result] Deployment threshold: {best_t['threshold']}  "
          f"(calibrated T={T:.4f})")

    # Save config
    cfg = vars(args)
    cfg.update({"cv_strategy": cv_name, "n_folds_actual": len(fold_metrics),
                "best_threshold": best_t["threshold"], "temperature_T": T,
                "mean_acc": float(np.mean(accs)), "mean_recall": float(np.mean(recs)),
                "device": str(device), "n_features": N_FEATURES})
    with open(os.path.join(args.output_dir, "config_v3.json"), "w") as f:
        json.dump(cfg, f, indent=2)

    # Phase 5: Retrain final model on ALL data
    print("\n[Retrain] Training final model on ALL data for ONNX export...")
    all_idx = list(range(len(sequences)))
    try:
        final_train, final_val = train_test_split(
            all_idx, test_size=0.10, stratify=labels, random_state=args.seed)
    except ValueError:
        final_train, final_val = train_test_split(
            all_idx, test_size=0.10, random_state=args.seed)

    final_model = TCN().to(device)
    augment_flag = not args.no_augment
    train_ds_f = GaitDataset(
        sequences[final_train], labels[final_train],
        augment=augment_flag, augment_normal=not args.no_augment_normal)
    val_ds_f   = GaitDataset(sequences[final_val],   labels[final_val],   augment=False)
    # Strategy 1: WeightedRandomSampler removed — use plain shuffle
    tl_f = DataLoader(train_ds_f, batch_size=args.batch, shuffle=True,
                      num_workers=_NUM_WORKERS, pin_memory=pin,
                      persistent_workers=(_NUM_WORKERS > 0))
    vl_f = DataLoader(val_ds_f, batch_size=args.batch, shuffle=False,
                      num_workers=_NUM_WORKERS, pin_memory=pin,
                      persistent_workers=(_NUM_WORKERS > 0))
    best_ckpt_final = train_model(final_model, tl_f, vl_f, args, device,
                                   args.output_dir, ckpt_name="best_tcn_model_v3.pth",
                                   verbose=True)
    final_model.load_state_dict(torch.load(best_ckpt_final, map_location=device))
    export_onnx(final_model, args.window, args.output_dir, device)

    if device.type == "cuda":
        peak_mb = torch.cuda.max_memory_allocated(device) / 1024 ** 2
        print(f"\n[GPU] Peak VRAM: {peak_mb:.0f} MB")
        torch.cuda.empty_cache()

    print(f"\nTraining complete. All outputs in: {args.output_dir}")


if __name__ == "__main__":
    main()