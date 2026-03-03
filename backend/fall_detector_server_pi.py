"""
Flask Backend for CAIretaker - Enhanced Fall Detection with Multi-Person Tracking
Exact same detection logic as inference code + person tracking with IDs and database logging

*** POWERED BY HAILO AI HAT+ (26 TOPS) ***
YOLO pose estimation runs on the Hailo-8 NPU for maximum performance.
CNN fall classifier remains on CPU (lightweight).

SETUP INSTRUCTIONS (run on Raspberry Pi):
1. Install Hailo drivers:
   sudo apt update && sudo apt install hailo-all
2. Reboot:
   sudo reboot
3. Verify Hailo device:
   hailortcli fw-control identify
4. Download the pose estimation model:
   mkdir -p backend/models
   wget -O backend/models/yolov8s_pose.hef 
     https://hailo-model-zoo.s3.eu-west-2.amazonaws.com/ModelZoo/Compiled/v2.14.0/hailo8/yolov8s_pose.hef
5. Install Python dependencies:
   pip install flask flask-cors opencv-python numpy torch scipy requests picamera2

FIXES IMPLEMENTED:
1. Reset-on-Recovery: Monitoring timer resets completely when person recovers
2. Three-Tier Confidence System (HIGH/AT_RISK/REJECTED)
3. Bending Detection Override (leg angle analysis)
4. Multi-Camera Switching Support
"""

from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import numpy as np
import torch
import torch.nn as nn
import time
from collections import deque, defaultdict
import warnings
import os
import requests
from picamera2 import Picamera2
try:
    from libcamera import controls
except ImportError:
    controls = None

# Hailo AI HAT+ imports
from hailo_platform import (
    VDevice, HEF, ConfigureParams,
    InputVStreamParams, OutputVStreamParams,
    InferVStreams, FormatType, HailoStreamInterface
)

# For IOU-based tracker (replaces ultralytics' built-in BoT-SORT)
from scipy.optimize import linear_sum_assignment

# ONNX Runtime for TCN gait model inference
try:
    import onnxruntime as ort
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False
    print("[WARN] onnxruntime not installed — gait analysis disabled")
    print("       Install with: pip install onnxruntime")

warnings.filterwarnings('ignore')

try:
    import psutil as _psutil
    PSUTIL_AVAILABLE = True
    _psutil.cpu_percent(interval=None)   # Prime the baseline — first call always returns 0.0
except ImportError:
    PSUTIL_AVAILABLE = False
    print("[WARN] psutil not installed — CPU/Memory metrics will be 0")
    print("       Install with: pip install psutil")

app = Flask(__name__)
CORS(app)

# ---- Background CPU + Voltage sampler (1-second interval for accurate readings) ----
# cpu_percent(interval=None) in a tight frame loop gives noisy single-frame readings.
# This thread samples every second using blocking interval=1.0 and stores the result.
_cpu_sampler_value = 0.0
_voltage_sampler_value = 0.0   # Volts (float), 0.0 if unavailable
_temp_sampler_value = 0.0      # Celsius (float), 0.0 if unavailable

def _read_voltage_v():
    """Read Pi input/core voltage via vcgencmd. Returns float volts or 0.0."""
    try:
        import subprocess
        try:
            pmic = subprocess.check_output(['vcgencmd', 'pmic_read_adc'],
                                           stderr=subprocess.STDOUT).decode()
            line = next((l for l in pmic.split('\n') if 'EXT5V_V' in l), None)
            if line:
                return float(line.split('=')[-1].replace('V', '').strip())
        except Exception:
            pass
        out = subprocess.check_output(['vcgencmd', 'measure_volts'],
                                      stderr=subprocess.STDOUT).decode()
        return float(out.replace('volt=', '').replace('V', '').strip())
    except Exception:
        return 0.0

def _read_temp_c():
    """Read Pi CPU temperature via vcgencmd. Returns float Celsius or 0.0."""
    try:
        import subprocess
        out = subprocess.check_output(['vcgencmd', 'measure_temp'],
                                      stderr=subprocess.STDOUT).decode()
        return float(out.replace('temp=', '').replace("'C", '').strip())
    except Exception:
        return 0.0

def _run_cpu_sampler():
    global _cpu_sampler_value, _voltage_sampler_value, _temp_sampler_value
    _tick = 0
    while True:
        try:
            if PSUTIL_AVAILABLE:
                _cpu_sampler_value = _psutil.cpu_percent(interval=1.0)
            else:
                import time as _t; _t.sleep(1)
            _tick += 1
            if _tick % 2 == 0:
                _voltage_sampler_value = _read_voltage_v()
                _temp_sampler_value = _read_temp_c()
        except Exception:
            pass

_cpu_sampler_thread = None  # started after threading is imported later

# ============== EXPO PUSH NOTIFICATIONS ==============
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
push_tokens = set()  # Store registered push tokens

# ============== DATA GATHERING SESSION ==============
# All metrics are reset each time Start is pressed.
data_gathering = {
    'active': False,
    'start_time': None,
    'end_time': None,
    # Alert delivery
    'alert_events': [],
    # Frame-level performance
    'inference_times_ms': [],
    'fps_samples': [],
    'cpu_samples': [],
    'memory_samples_mb': [],
    'voltage_samples': [],        # list of float (Volts)
    'temp_samples': [],           # list of float (Celsius)
    # Performance snapshot per detected-person-count
    'perf_by_person_count': {},
    '_perf_count_accum': {},
}

def send_expo_push_notification(title, body):
    """Send push notification to all registered devices via Expo Push API.
    
    During data gathering, ALWAYS measures the HTTP round-trip time to
    Expo's push server (even when no real tokens are registered — uses a
    test token for timing so the Pi → Expo network latency is real).
    """
    dispatch_time = time.time()
    delivery_ms = None

    # Decide which tokens to send to.
    # If real tokens exist, use them.  Otherwise use a test token
    # purely to measure the HTTP round-trip to Expo's servers.
    tokens_to_send = list(push_tokens) if push_tokens else []
    timing_only = len(tokens_to_send) == 0   # True = no real delivery

    if timing_only:
        # Use a dummy token.  Expo will respond with DeviceNotRegistered
        # but the HTTP round-trip time is a valid network latency measurement.
        tokens_to_send = ["ExponentPushToken[__timing_probe__]"]
        print("No push tokens registered — sending timing probe to measure delivery latency")

    for token in tokens_to_send:
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": {"type": "fall_alert"},
            "priority": "high",
            "channelId": "fall_alerts",
        }

        try:
            _t0 = time.time()
            response = requests.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }
            )
            _delivery_ms = round((time.time() - _t0) * 1000, 1)
            if delivery_ms is None:
                delivery_ms = _delivery_ms
            if timing_only:
                print(f"Timing probe response: {response.status_code} ({_delivery_ms:.0f} ms)")
            else:
                print(f"Push notification sent: {response.status_code} ({_delivery_ms:.0f} ms)")
        except Exception as e:
            print(f"Push notification error: {e}")

    # Record to data gathering session
    if data_gathering['active']:
        data_gathering['alert_events'].append({
            'timestamp': dispatch_time,
            'title': title,
            'delivery_ms': delivery_ms,
            'timing_only': timing_only,   # True = measured via probe, not a real delivery
        })

# Configuration
class Config:
    # ============== IMPORTANT: UPDATE THESE PATHS FOR YOUR SETUP ==============
    # CNN_MODEL_PATH: Path to your trained fall detection model (cnn_model_fall.pth)
    # YOLO_MODEL: Path to YOLO pose estimation model (HEF for Hailo AI HAT+)
    
    # Default setup expects:
    #   - cnn_model_fall.pth in backend/ folder
    #   - yolov8s_pose.hef in backend/models/ folder (download instructions in docstring above)
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CNN_MODEL_PATH = os.path.join(BASE_DIR, "cnn_model_fall.pth")
    YOLO_MODEL = os.path.join(BASE_DIR, "models", "yolov8s_pose.hef")
    # ===========================================================================
    
    CONFIDENCE_THRESHOLD = 0.65
    SMOOTHING_WINDOW = 7
    
    # TEMPORAL FALL DETECTION SETTINGS
    FALL_CONFIRMATION_TIME = 0.5  # Seconds person must stay fallen before alert
    FALL_CONFIRMATION_FRAMES = 3  # Minimum consecutive frames in fallen state
    
    # PERFORMANCE SETTINGS
    YOLO_IMGSZ = 640              # YOLO inference resolution (must match HEF model input)
    YOLO_CONF_THRESHOLD = 0.5     # YOLO detection confidence threshold
    YOLO_NMS_IOU_THRESHOLD = 0.45 # NMS IOU threshold for overlapping detections
    DEBUG_LOGGING = False          # Set True for verbose per-frame logging, False for production
    LOG_INTERVAL = 30              # Print status summary every N frames (when DEBUG_LOGGING is False)

    # STREAM QUALITY PRESETS
    # Choose profile with environment variable: STREAM_PROFILE=pi5 or STREAM_PROFILE=pi5
    STREAM_PROFILE = os.getenv("STREAM_PROFILE", "pi5").lower()
    _STREAM_PRESETS = {
        "pi5": {
            "CAMERA_SIZE": (1280, 720),
            "STREAM_SIZE": (1280, 720),
            "FPS": 24,
            "JPEG_QUALITY": 85,
        },
        "pi5": {
            "CAMERA_SIZE": (1920, 1080),
            "STREAM_SIZE": (1280, 720),
            "FPS": 30,
            "JPEG_QUALITY": 88,
        },
    }
    _PROFILE = _STREAM_PRESETS.get(STREAM_PROFILE, _STREAM_PRESETS["pi5"])
    CAMERA_SIZE = _PROFILE["CAMERA_SIZE"]
    STREAM_SIZE = _PROFILE["STREAM_SIZE"]
    CAMERA_FPS = _PROFILE["FPS"]
    JPEG_QUALITY = _PROFILE["JPEG_QUALITY"]
    APPLY_SHARPEN = os.getenv("STREAM_SHARPEN", "1") == "1"
    
    # HAILO AI HAT+ SETTINGS
    HAILO_INPUT_SIZE = (640, 640)  # Model input dimensions (H, W) - must match HEF
    
    # IOU TRACKER SETTINGS (replaces ultralytics BoT-SORT)
    TRACKER_IOU_THRESHOLD = 0.3   # Min IOU to match detection to existing track
    TRACKER_MAX_AGE = 30           # Frames before unmatched track is deleted
    
    # TCN GAIT ANALYSIS SETTINGS
    TCN_MODEL_PATH = os.path.join(BASE_DIR, "models", "tcn_gait_model.onnx")
    TCN_WINDOW = 60               # Frames per analysis window (must match training)
    TCN_STRIDE = 15               # Frames between analysis attempts
    TCN_THRESHOLD = 0.50          # Classification threshold (0 = normal, 1 = abnormal)
    TCN_ALERT_COOLDOWN = 30       # Seconds between repeat gait alerts per person
    TCN_IN_CHANNELS = 34          # 17 keypoints * 2 (x, y) — matches training
    TCN_LEFT_HIP_IDX = 11         # COCO keypoint index for left hip
    TCN_RIGHT_HIP_IDX = 12        # COCO keypoint index for right hip
    TCN_MOTION_THRESHOLD = 15.0   # Min net hip displacement (px) over window to count as "walking"
    TCN_AVG_FRAME_THRESHOLD = 2.5  # Min avg per-frame hip delta (px) for sustained movement
    TCN_STILLNESS_STD_THRESHOLD = 3.0   # Max mean keypoint std-dev (px) to be "stationary"
    TCN_LIMB_MOTION_STD_THRESHOLD = 2.0 # Min limb oscillation std to confirm walking
    TCN_MIN_MOTION_WINDOWS = 5   # Consecutive motion-passing windows required before TCN runs
    
    CLASS_NAMES = {0: "Standing", 1: "Sitting", 2: "Fallen"}
    CLASS_COLORS = {
        0: (0, 255, 0),      # Standing - Green
        1: (255, 255, 0),    # Sitting - Yellow (cyan in BGR)
        2: (0, 0, 255),      # Fallen (High Confidence) - Red
        'at_risk': (0, 165, 255),  # At Risk (Low Confidence) - Orange
        'abnormal_gait': (0, 255, 255)  # Abnormal Gait - Yellow
    }
    
    # Three-tier confidence thresholds
    HIGH_CONFIDENCE_THRESHOLD = 0.65 # Confirmed fallen - triggers monitoring/alert (≥75%)
    LOW_CONFIDENCE_THRESHOLD = 0.50 # At risk - visual warning only (60-74%)
    # Below 0.60 = treated as normal (not fallen)
    NUM_KEYPOINTS = 17
    NUM_COORDS = 3
    NUM_SPATIAL_FEATURES = 7
    
    # Camera to Room Name Mapping
    # Add more entries as you add more cameras
    CAMERA_ROOMS = {
        0: "Room 1",
        1: "Room 2",
        2: "Room 3",
        3: "Room 4",
        4: "Room 5",
    }
    
    @staticmethod
    def get_room_name(camera_index):
        """Get room name based on camera index"""
        return Config.CAMERA_ROOMS.get(camera_index, f"Camera {camera_index}")


# ============================================================================
# MODEL ARCHITECTURE - Matches your cnn_model_fall.pth
# ============================================================================

class Simple1DCNN(nn.Module):
    """Simple 1D CNN for pose classification - matches cnn_model_fall.pth architecture"""
    def __init__(self, num_classes=3, dropout_rate=0.4):
        super(Simple1DCNN, self).__init__()
        
        # Convolutional layers
        self.conv1 = nn.Conv1d(in_channels=3, out_channels=64, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm1d(64)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool1d(kernel_size=2)
        self.dropout1 = nn.Dropout(0.2)
        
        self.conv2 = nn.Conv1d(in_channels=64, out_channels=128, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm1d(128)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool1d(kernel_size=2)
        self.dropout2 = nn.Dropout(0.2)
        
        self.conv3 = nn.Conv1d(in_channels=128, out_channels=256, kernel_size=3, padding=1)
        self.bn3 = nn.BatchNorm1d(256)
        self.relu3 = nn.ReLU()
        self.dropout3 = nn.Dropout(0.3)
        
        self.global_pool = nn.AdaptiveAvgPool1d(1)
        
        # Fully connected layers
        self.fc1 = nn.Linear(256, 128)
        self.bn_fc1 = nn.BatchNorm1d(128)
        self.relu_fc1 = nn.ReLU()
        self.dropout_fc1 = nn.Dropout(dropout_rate)
        
        self.fc2 = nn.Linear(128, 64)
        self.bn_fc2 = nn.BatchNorm1d(64)
        self.relu_fc2 = nn.ReLU()
        self.dropout_fc2 = nn.Dropout(dropout_rate)
        
        self.fc3 = nn.Linear(64, num_classes)
    
    def forward(self, keypoints):
        # CNN branch
        x = keypoints.permute(0, 2, 1)  # (batch, 3, 17) for 17 keypoints with x,y,conf
        
        x = self.dropout1(self.pool1(self.relu1(self.bn1(self.conv1(x)))))
        x = self.dropout2(self.pool2(self.relu2(self.bn2(self.conv2(x)))))
        x = self.dropout3(self.relu3(self.bn3(self.conv3(x))))
        
        x = self.global_pool(x).squeeze(-1)  # (batch, 256)
        
        # Fully connected layers
        x = self.dropout_fc1(self.relu_fc1(self.bn_fc1(self.fc1(x))))
        x = self.dropout_fc2(self.relu_fc2(self.bn_fc2(self.fc2(x))))
        x = self.fc3(x)
        
        return x


# ============================================================================
# SPATIAL FEATURE EXTRACTION (same as inference)
# ============================================================================

def calculate_body_angle(keypoints):
    """Calculate angle of body from vertical axis"""
    left_shoulder = keypoints[5]
    right_shoulder = keypoints[6]
    left_hip = keypoints[11]
    right_hip = keypoints[12]
    
    if (left_shoulder[2] < 0.3 or right_shoulder[2] < 0.3 or 
        left_hip[2] < 0.3 or right_hip[2] < 0.3):
        return None
    
    shoulder_center = np.array([
        (left_shoulder[0] + right_shoulder[0]) / 2,
        (left_shoulder[1] + right_shoulder[1]) / 2
    ])
    hip_center = np.array([
        (left_hip[0] + right_hip[0]) / 2,
        (left_hip[1] + right_hip[1]) / 2
    ])
    
    body_vector = hip_center - shoulder_center
    vertical_vector = np.array([0, 1])
    
    if np.linalg.norm(body_vector) < 1e-6:
        return None
    
    cos_angle = np.dot(body_vector, vertical_vector) / (np.linalg.norm(body_vector) * np.linalg.norm(vertical_vector))
    cos_angle = np.clip(cos_angle, -1.0, 1.0)
    angle = np.degrees(np.arccos(cos_angle))
    
    return angle


def check_hip_position(keypoints, image_shape):
    """Check if hips are at ground level"""
    h, w = image_shape[:2]
    left_hip = keypoints[11]
    right_hip = keypoints[12]
    
    hip_y_values = []
    if left_hip[2] > 0.3:
        hip_y_values.append(left_hip[1])
    if right_hip[2] > 0.3:
        hip_y_values.append(right_hip[1])
    
    if not hip_y_values:
        return None
    
    return np.mean(hip_y_values) / h


def check_knee_position(keypoints, image_shape):
    """Check knee positions"""
    h, w = image_shape[:2]
    left_knee = keypoints[13]
    right_knee = keypoints[14]
    left_hip = keypoints[11]
    right_hip = keypoints[12]
    
    visible_knees = []
    visible_hips = []
    
    if left_knee[2] > 0.3:
        visible_knees.append(left_knee)
    if right_knee[2] > 0.3:
        visible_knees.append(right_knee)
    if left_hip[2] > 0.3:
        visible_hips.append(left_hip)
    if right_hip[2] > 0.3:
        visible_hips.append(right_hip)
    
    if not visible_knees or not visible_hips:
        return None, None
    
    avg_knee_y = np.mean([k[1] for k in visible_knees])
    avg_hip_y = np.mean([h[1] for h in visible_hips])
    
    knee_hip_distance = (avg_knee_y - avg_hip_y) / h
    relative_knee_y = avg_knee_y / h
    
    return knee_hip_distance, relative_knee_y


def calculate_center_of_mass(keypoints):
    """Calculate approximate center of mass Y-coordinate"""
    torso_indices = [5, 6, 11, 12]
    
    visible_torso = []
    for idx in torso_indices:
        if keypoints[idx, 2] > 0.3:
            visible_torso.append(keypoints[idx, 1])
    
    if len(visible_torso) < 2:
        return None
    
    return np.mean(visible_torso)


def calculate_body_dimensions(keypoints):
    """Calculate body width and height ratios - MUST MATCH TRAINING CODE"""
    visible_kps = keypoints[keypoints[:, 2] > 0.3]
    
    if len(visible_kps) < 5:
        return None, None
    
    x_coords = visible_kps[:, 0]
    y_coords = visible_kps[:, 1]
    
    width = np.max(x_coords) - np.min(x_coords)
    height = np.max(y_coords) - np.min(y_coords)
    
    if height < 1:
        return None, None
    
    aspect_ratio = width / height
    relative_height = height
    
    return aspect_ratio, relative_height




def extract_spatial_features(keypoints, image_shape):
    """Extract 7 spatial features for the MLP branch - MUST MATCH TRAINING CODE EXACTLY"""
    # Handle both (h, w) and (h, w, c) formats
    if len(image_shape) == 3:
        h, w, _ = image_shape
    else:
        h, w = image_shape[:2]
    
    spatial_features = []
    
    # 1. Body angle (default: 45.0 - NOT 0.0!)
    angle = calculate_body_angle(keypoints)
    spatial_features.append(angle if angle is not None else 45.0)
    
    # 2. Hip height (default: 0.5)
    hip_height = check_hip_position(keypoints, image_shape)
    spatial_features.append(hip_height if hip_height is not None else 0.5)
    
    # 3. Aspect ratio (default: 0.5)
    aspect_ratio, body_height = calculate_body_dimensions(keypoints)
    spatial_features.append(aspect_ratio if aspect_ratio is not None else 0.5)
    
    # 4. Body height / h (default: 0.5)
    spatial_features.append(body_height / h if body_height else 0.5)
    
    # 5. Knee-hip distance (default: 0.0)
    knee_hip_dist, knee_height = check_knee_position(keypoints, image_shape)
    spatial_features.append(knee_hip_dist if knee_hip_dist is not None else 0.0)
    
    # 6. Knee height (default: 0.5)
    spatial_features.append(knee_height if knee_height is not None else 0.5)
    
    # 7. Center of mass / h (default: 0.5)
    com_y = calculate_center_of_mass(keypoints)
    spatial_features.append(com_y / h if com_y else 0.5)
    
    return np.array(spatial_features, dtype=np.float32)


# ============================================================================
# SOLUTION 2: BENDING DETECTION FUNCTIONS
# ============================================================================

def calculate_leg_angles(keypoints):
    """
    Calculate average angle of legs from vertical
    
    Returns:
        float: Average leg angle in degrees (0° = vertical, 90° = horizontal)
        None if legs not visible
    
    Usage:
        - Bending: legs vertical (< 30°)
        - Fallen: legs horizontal (> 60°)
    """
    left_hip = keypoints[11]
    right_hip = keypoints[12]
    left_ankle = keypoints[15]
    right_ankle = keypoints[16]
    
    leg_angles = []
    
    # Calculate left leg angle
    if (left_hip[2] > 0.3 and left_ankle[2] > 0.3):
        # Vector from hip to ankle (full leg)
        leg_vec = np.array([
            left_ankle[0] - left_hip[0],
            left_ankle[1] - left_hip[1]
        ])
        
        # Vertical vector (pointing down)
        vertical = np.array([0, 1])
        
        # Calculate angle from vertical
        if np.linalg.norm(leg_vec) > 1e-6:
            cos_angle = np.dot(leg_vec, vertical) / (
                np.linalg.norm(leg_vec) * np.linalg.norm(vertical)
            )
            cos_angle = np.clip(cos_angle, -1.0, 1.0)
            angle = np.degrees(np.arccos(cos_angle))
            leg_angles.append(angle)
    
    # Calculate right leg angle
    if (right_hip[2] > 0.3 and right_ankle[2] > 0.3):
        leg_vec = np.array([
            right_ankle[0] - right_hip[0],
            right_ankle[1] - right_hip[1]
        ])
        
        vertical = np.array([0, 1])
        
        if np.linalg.norm(leg_vec) > 1e-6:
            cos_angle = np.dot(leg_vec, vertical) / (
                np.linalg.norm(leg_vec) * np.linalg.norm(vertical)
            )
            cos_angle = np.clip(cos_angle, -1.0, 1.0)
            angle = np.degrees(np.arccos(cos_angle))
            leg_angles.append(angle)
    
    # Return average if at least one leg visible
    if len(leg_angles) > 0:
        return np.mean(leg_angles)
    return None


def calculate_torso_leg_difference(keypoints):
    """
    Calculate difference between torso angle and leg angle
    
    Returns:
        float: Angle difference in degrees
        None if cannot calculate
    
    Usage:
        - Bending: Large difference (> 40°) - torso bent, legs straight
        - Fallen: Small difference (< 20°) - both horizontal
    """
    torso_angle = calculate_body_angle(keypoints)
    leg_angle = calculate_leg_angles(keypoints)
    
    if torso_angle is not None and leg_angle is not None:
        angle_diff = abs(torso_angle - leg_angle)
        return angle_diff
    
    return None


def is_bending_posture(keypoints, image_shape):
    """
    Comprehensive check to determine if person is bending vs fallen
    
    Args:
        keypoints: (17, 3) array of keypoints
        image_shape: tuple (height, width) or (height, width, channels)
    
    Returns:
        tuple: (is_bending, confidence, reasons)
            - is_bending: True if detected as bending
            - confidence: float 0-1, confidence in the assessment
            - reasons: list of strings explaining the decision
    
    Scoring System:
        +4 points: Very strong indicator of bending
        +3 points: Strong indicator of bending
        +2 points: Moderate indicator of bending
        +1 point: Weak indicator of bending
        -2 points: Indicator of falling
        -3 points: Strong indicator of falling
        
        Total >= 4: Classified as bending
    """
    reasons = []
    bending_score = 0
    
    # Get image dimensions
    h, w = image_shape[:2] if len(image_shape) >= 2 else (1080, 1920)
    
    # 1. CHECK LEG ANGLES (CRITICAL FOR EXTREME BENDING)
    leg_angle = calculate_leg_angles(keypoints)
    if leg_angle is not None:
        if leg_angle < 35:  # Legs are relatively vertical
            bending_score += 4  # Most important indicator
            reasons.append(f"Legs vertical ({leg_angle:.0f}°)")
        elif leg_angle > 60:  # Legs are horizontal (fallen)
            bending_score -= 3
            reasons.append(f"Legs horizontal ({leg_angle:.0f}°)")
        else:  # Legs at moderate angle (35-60°)
            bending_score += 2
            reasons.append(f"Legs moderate ({leg_angle:.0f}°)")
    
    # 2. CHECK TORSO-LEG ANGLE DIFFERENCE
    angle_diff = calculate_torso_leg_difference(keypoints)
    if angle_diff is not None:
        if angle_diff > 35:  # Large difference = torso bent, legs straight
            bending_score += 3
            reasons.append(f"Torso bent, legs straight (Δ{angle_diff:.0f}°)")
        elif angle_diff < 20:  # Small difference = both horizontal
            bending_score -= 2
            reasons.append(f"Fully horizontal (Δ{angle_diff:.0f}°)")
        else:
            bending_score += 1
            reasons.append(f"Moderate bend (Δ{angle_diff:.0f}°)")
    
    # 3. CHECK ANKLE POSITIONS (CRITICAL - FEET ON GROUND = BENDING)
    left_ankle = keypoints[15]
    right_ankle = keypoints[16]
    
    ankle_y_positions = []
    if left_ankle[2] > 0.3:
        ankle_y_positions.append(left_ankle[1] / h)
    if right_ankle[2] > 0.3:
        ankle_y_positions.append(right_ankle[1] / h)
    
    if len(ankle_y_positions) > 0:
        avg_ankle_y = np.mean(ankle_y_positions)
        if avg_ankle_y > 0.80:  # Ankles near bottom (standing/bending)
            bending_score += 3  # Feet on ground is very strong indicator
            reasons.append(f"Feet on ground ({avg_ankle_y:.2f})")
    
    # 4. CHECK HIP ELEVATION (More lenient for deep bending)
    hip_height = check_hip_position(keypoints, image_shape)
    if hip_height is not None:
        if hip_height < 0.5:  # Hips elevated
            bending_score += 2
            reasons.append(f"Hips elevated ({hip_height:.2f})")
        elif hip_height > 0.75:  # Hips very low
            bending_score -= 3
            reasons.append(f"Hips on ground ({hip_height:.2f})")
        else:  # Hips at moderate height (0.5-0.75)
            bending_score += 1
            reasons.append(f"Hips moderate ({hip_height:.2f})")
    
    # 5. CHECK KNEE POSITIONS
    knee_hip_dist, knee_height = check_knee_position(keypoints, image_shape)
    if knee_hip_dist is not None:
        if knee_hip_dist > 0.15:  # Knees bent
            bending_score += 1
            reasons.append("Knees bent")
    
    # 6. ADDITIONAL CHECK: If legs vertical AND feet on ground, DEFINITELY bending
    if leg_angle is not None and len(ankle_y_positions) > 0:
        avg_ankle_y = np.mean(ankle_y_positions)
        if leg_angle < 40 and avg_ankle_y > 0.80:
            # This combination is definitive proof of bending, not falling
            bending_score += 2  # Bonus points for this strong combination
            reasons.append("STRONG: Vertical legs + grounded feet")
    
    # CALCULATE FINAL DECISION
    is_bending = bending_score >= 4
    
    # Calculate confidence (0-1 scale)
    confidence = min(abs(bending_score) / 14.0, 1.0)
    
    return is_bending, confidence, reasons


# ============================================================================
# SQLITE-BACKED DATABASE FOR FALL INCIDENTS (persistent across restarts)
# ============================================================================

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import FallIncidentDB


# ============================================================================
# HAILO AI HAT+ POSE ESTIMATOR
# ============================================================================

class HailoPoseEstimator:
    """Wrapper for YOLO pose estimation inference on the Hailo-8 NPU.
    
    Handles:
    - Loading the HEF model onto the Hailo device
    - Letterbox preprocessing to the model's expected input size
    - Running inference via HailoRT InferVStreams
    - Decoding YOLO output tensors into bounding boxes + 17 keypoints
    - Non-Maximum Suppression (NMS)
    """
    
    NUM_KEYPOINTS = 17
    
    def __init__(self, hef_path):
        print(f"Initializing Hailo AI HAT+ NPU...")
        
        if not os.path.exists(hef_path):
            raise FileNotFoundError(
                f"HEF model not found at: {hef_path}\n"
                f"Download it with:\n"
                f"  wget -O {hef_path} "
                f"https://hailo-model-zoo.s3.eu-west-2.amazonaws.com/ModelZoo/Compiled/v2.14.0/hailo8/yolov8s_pose.hef"
            )
        
        # Create virtual device and load HEF
        self.vdevice = VDevice()
        self.hef = HEF(hef_path)
        
        # Configure the network group
        self.configure_params = ConfigureParams.create_from_hef(
            hef=self.hef, interface=HailoStreamInterface.PCIe
        )
        self.network_group = self.vdevice.configure(self.hef, self.configure_params)[0]
        self.network_group_params = self.network_group.create_params()
        
        # Get input/output stream info
        input_vstreams_info = self.hef.get_input_vstream_infos()
        output_vstreams_info = self.hef.get_output_vstream_infos()
        
        self.input_vstream_info = input_vstreams_info[0]
        self.output_vstreams_info = output_vstreams_info
        
        # Get model input shape from the HEF
        self.input_shape = self.input_vstream_info.shape  # e.g., (640, 640, 3)
        self.input_height = self.input_shape[0]
        self.input_width = self.input_shape[1]
        
        # Configure stream parameters
        self.input_vstream_params = InputVStreamParams.make(
            self.network_group, format_type=FormatType.UINT8
        )
        self.output_vstream_params = OutputVStreamParams.make(
            self.network_group, format_type=FormatType.FLOAT32
        )
        
        # Activate network group once and keep it active
        # (activating/deactivating per-frame adds ~50ms overhead)
        self._network_group_ctx = self.network_group.activate(self.network_group_params)
        self._network_group_ctx.__enter__()
        
        print(f"  Hailo device initialized successfully")
        print(f"  HEF model loaded: {os.path.basename(hef_path)}")
        print(f"  Model input size: {self.input_width}x{self.input_height}")
        print(f"  Network group activated (persistent)")
        print(f"  Output layers: {len(output_vstreams_info)}")
        for info in output_vstreams_info:
            print(f"    - {info.name}: {info.shape}")
    
    def preprocess(self, frame):
        """Letterbox-resize frame to model input size, preserving aspect ratio.
        
        Returns:
            preprocessed: uint8 numpy array shaped (input_height, input_width, 3)
            meta: dict with scale/padding info for coordinate mapping back to original
        """
        orig_h, orig_w = frame.shape[:2]
        target_h, target_w = self.input_height, self.input_width
        
        # Calculate scale factor (fit inside target, maintain aspect ratio)
        scale = min(target_w / orig_w, target_h / orig_h)
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)
        
        # Resize
        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        
        # Pad to target size (center padding with gray)
        pad_top = (target_h - new_h) // 2
        pad_bottom = target_h - new_h - pad_top
        pad_left = (target_w - new_w) // 2
        pad_right = target_w - new_w - pad_left
        
        padded = cv2.copyMakeBorder(
            resized, pad_top, pad_bottom, pad_left, pad_right,
            cv2.BORDER_CONSTANT, value=(114, 114, 114)
        )
        
        meta = {
            'orig_h': orig_h, 'orig_w': orig_w,
            'scale': scale,
            'pad_top': pad_top, 'pad_left': pad_left,
            'new_h': new_h, 'new_w': new_w,
        }
        
        return padded.astype(np.uint8), meta
    
    def infer(self, preprocessed_frame):
        """Run inference on the Hailo NPU.
        
        Args:
            preprocessed_frame: uint8 array of shape (H, W, 3)
        
        Returns:
            dict mapping output layer name -> numpy array
        """
        # Add batch dimension
        input_data = np.expand_dims(preprocessed_frame, axis=0)
        
        input_dict = {self.input_vstream_info.name: input_data}
        
        # Network group is already activated in __init__
        with InferVStreams(
            self.network_group,
            self.input_vstream_params,
            self.output_vstream_params
        ) as pipeline:
            results = pipeline.infer(input_dict)
        
        return results
    
    @staticmethod
    def _sigmoid(x):
        return 1.0 / (1.0 + np.exp(-np.clip(x, -50, 50)))
    
    @staticmethod
    def _dfl_decode(raw, reg_max=16):
        """Decode DFL (Distribution Focal Loss) bounding box predictions.
        
        Args:
            raw: (N, 64) where 64 = 4 * reg_max
            reg_max: number of bins per coordinate (default 16)
        
        Returns:
            (N, 4) decoded offsets: left, top, right, bottom distances from anchor
        """
        batch = raw.reshape(-1, 4, reg_max)
        # Softmax per coordinate
        batch_exp = np.exp(batch - batch.max(axis=-1, keepdims=True))
        probs = batch_exp / batch_exp.sum(axis=-1, keepdims=True)
        # Weighted sum (expected value)
        weights = np.arange(reg_max).reshape(1, 1, reg_max).astype(np.float32)
        return (probs * weights).sum(axis=-1)  # (N, 4)
    
    def _decode_yolov8_pose_output(self, raw_outputs, meta, conf_threshold=0.5):
        """Decode YOLOv8-pose outputs from Hailo HEF using DFL decoding.
        
        Hailo outputs 9 layers (3 scales x 3 types):
          - DFL bounding box regression (C=64 = 4 x 16 bins)
          - Object confidence (C=1, already sigmoid)
          - Keypoints (C=51 = 17 x 3, raw offsets + logit conf)
        
        Args:
            raw_outputs: dict of output tensors from Hailo inference
            meta: preprocessing metadata for coordinate mapping
            conf_threshold: minimum detection confidence
        
        Returns:
            list of dicts with 'box', 'confidence', 'keypoints' keys
        """
        input_size = self.input_height  # 640
        
        # Group outputs by spatial dimensions (H, W) to identify scales
        scale_groups = {}
        for name, output in raw_outputs.items():
            arr = output.squeeze(0)  # Remove batch dim: (H, W, C)
            h, w, c = arr.shape
            key = (h, w)
            if key not in scale_groups:
                scale_groups[key] = {}
            
            # Classify by channel count
            if c == 64:
                scale_groups[key]['bbox'] = arr
            elif c == 1:
                scale_groups[key]['conf'] = arr
            elif c == 51:
                scale_groups[key]['kps'] = arr
        
        all_boxes = []
        all_confs = []
        all_kps = []
        
        for (grid_h, grid_w), group in sorted(scale_groups.items(), key=lambda x: x[0][0]):
            if 'bbox' not in group or 'conf' not in group or 'kps' not in group:
                continue
            
            stride = input_size / grid_h
            n = grid_h * grid_w
            
            bbox_flat = group['bbox'].reshape(n, 64)
            conf_flat = group['conf'].reshape(n)
            kps_flat = group['kps'].reshape(n, 51)
            
            # Grid: anchor at center of each cell
            yv, xv = np.meshgrid(np.arange(grid_h), np.arange(grid_w), indexing='ij')
            grid = np.stack([xv.ravel(), yv.ravel()], axis=-1).astype(np.float32)
            anchor = grid + 0.5
            
            # Decode DFL bounding boxes
            offsets = self._dfl_decode(bbox_flat)  # (N, 4): left, top, right, bottom
            x1 = (anchor[:, 0] - offsets[:, 0]) * stride
            y1 = (anchor[:, 1] - offsets[:, 1]) * stride
            x2 = (anchor[:, 0] + offsets[:, 2]) * stride
            y2 = (anchor[:, 1] + offsets[:, 3]) * stride
            boxes = np.stack([x1, y1, x2, y2], axis=-1)
            
            # Decode keypoints
            kps = kps_flat.reshape(n, 17, 3).copy()
            kps[:, :, 0] = (kps[:, :, 0] * 2.0 + (anchor[:, 0:1] - 0.5)) * stride
            kps[:, :, 1] = (kps[:, :, 1] * 2.0 + (anchor[:, 1:2] - 0.5)) * stride
            kps[:, :, 2] = self._sigmoid(kps[:, :, 2])
            
            all_boxes.append(boxes)
            all_confs.append(conf_flat)
            all_kps.append(kps)
        
        if not all_boxes:
            return []
        
        all_boxes = np.concatenate(all_boxes, axis=0)
        all_confs = np.concatenate(all_confs, axis=0)
        all_kps = np.concatenate(all_kps, axis=0)
        
        # Filter by confidence
        mask = all_confs > conf_threshold
        boxes = all_boxes[mask]
        confs = all_confs[mask]
        kps = all_kps[mask]
        
        if len(boxes) == 0:
            return []
        
        # Apply NMS
        keep = self._nms(boxes, confs, Config.YOLO_NMS_IOU_THRESHOLD)
        
        # Map coordinates back to original frame
        scale = meta['scale']
        pad_left = meta['pad_left']
        pad_top = meta['pad_top']
        
        detections = []
        for idx in keep:
            box = boxes[idx].copy()
            keypoints = kps[idx].copy()
            conf = float(confs[idx])
            
            # Remove padding and scale back to original image coordinates
            box[0] = (box[0] - pad_left) / scale
            box[1] = (box[1] - pad_top) / scale
            box[2] = (box[2] - pad_left) / scale
            box[3] = (box[3] - pad_top) / scale
            
            # Clip to original image dimensions
            box[0] = max(0, min(box[0], meta['orig_w']))
            box[1] = max(0, min(box[1], meta['orig_h']))
            box[2] = max(0, min(box[2], meta['orig_w']))
            box[3] = max(0, min(box[3], meta['orig_h']))
            
            # Skip tiny boxes
            if (box[2] - box[0]) < 10 or (box[3] - box[1]) < 10:
                continue
            
            # Map keypoints back to original coordinates
            keypoints[:, 0] = (keypoints[:, 0] - pad_left) / scale
            keypoints[:, 1] = (keypoints[:, 1] - pad_top) / scale
            
            detections.append({
                'box': box,
                'confidence': conf,
                'keypoints': keypoints  # shape: (17, 3) with [x, y, conf]
            })
        
        return detections
    
    @staticmethod
    def _nms(boxes, scores, iou_threshold):
        """Non-Maximum Suppression.
        
        Args:
            boxes: (N, 4) array of [x1, y1, x2, y2]
            scores: (N,) array of confidence scores
            iou_threshold: IOU threshold for suppression
        
        Returns:
            list of indices to keep
        """
        if len(boxes) == 0:
            return []
        
        x1 = boxes[:, 0]
        y1 = boxes[:, 1]
        x2 = boxes[:, 2]
        y2 = boxes[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        
        order = scores.argsort()[::-1]
        keep = []
        
        while len(order) > 0:
            i = order[0]
            keep.append(i)
            
            if len(order) == 1:
                break
            
            # Compute IOU with remaining boxes
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            
            w = np.maximum(0.0, xx2 - xx1)
            h = np.maximum(0.0, yy2 - yy1)
            intersection = w * h
            
            iou = intersection / (areas[i] + areas[order[1:]] - intersection + 1e-6)
            
            # Keep boxes with IOU below threshold
            remaining = np.where(iou <= iou_threshold)[0]
            order = order[remaining + 1]
        
        return keep
    
    def detect(self, frame):
        """Full detection pipeline: preprocess -> infer -> postprocess.
        
        Args:
            frame: BGR numpy array from camera
        
        Returns:
            list of dicts with 'box' (xyxy), 'confidence', 'keypoints' (17,3) keys
        """
        preprocessed, meta = self.preprocess(frame)
        raw_outputs = self.infer(preprocessed)
        detections = self._decode_yolov8_pose_output(
            raw_outputs, meta, conf_threshold=Config.YOLO_CONF_THRESHOLD
        )
        return detections


# ============================================================================
# IOU-BASED MULTI-OBJECT TRACKER
# ============================================================================

class SimpleIOUTracker:
    """Lightweight IOU-based tracker replacing ultralytics BoT-SORT.
    
    Uses the Hungarian algorithm for optimal matching between
    existing tracks and new detections based on IOU overlap.
    Ideal for fixed-camera scenarios like fall detection.
    """
    
    def __init__(self, iou_threshold=0.3, max_age=30):
        self.iou_threshold = iou_threshold
        self.max_age = max_age        # Frames before a track is deleted
        self.tracks = {}              # track_id -> {'box': xyxy, 'age': int, 'hits': int}
        self.next_id = 1
    
    @staticmethod
    def _compute_iou_matrix(boxes_a, boxes_b):
        """Compute IOU matrix between two sets of boxes.
        
        Args:
            boxes_a: (N, 4) array of [x1, y1, x2, y2]
            boxes_b: (M, 4) array of [x1, y1, x2, y2]
        
        Returns:
            (N, M) IOU matrix
        """
        N = len(boxes_a)
        M = len(boxes_b)
        iou_matrix = np.zeros((N, M))
        
        for i in range(N):
            for j in range(M):
                xa1, ya1, xa2, ya2 = boxes_a[i]
                xb1, yb1, xb2, yb2 = boxes_b[j]
                
                xi1 = max(xa1, xb1)
                yi1 = max(ya1, yb1)
                xi2 = min(xa2, xb2)
                yi2 = min(ya2, yb2)
                
                inter_w = max(0, xi2 - xi1)
                inter_h = max(0, yi2 - yi1)
                intersection = inter_w * inter_h
                
                area_a = (xa2 - xa1) * (ya2 - ya1)
                area_b = (xb2 - xb1) * (yb2 - yb1)
                union = area_a + area_b - intersection
                
                iou_matrix[i, j] = intersection / (union + 1e-6)
        
        return iou_matrix
    
    def update(self, detections):
        """Update tracks with new detections.
        
        Args:
            detections: list of dicts with 'box' key (xyxy format)
        
        Returns:
            list of track_ids corresponding to each detection (same order)
        """
        if len(detections) == 0:
            # Age out all tracks
            to_delete = []
            for tid, track in self.tracks.items():
                track['age'] += 1
                if track['age'] > self.max_age:
                    to_delete.append(tid)
            for tid in to_delete:
                del self.tracks[tid]
            return []
        
        det_boxes = np.array([d['box'] for d in detections])
        track_ids = list(self.tracks.keys())
        
        if len(track_ids) == 0:
            # No existing tracks, create new ones for all detections
            assigned_ids = []
            for det in detections:
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {'box': det['box'].copy(), 'age': 0, 'hits': 1}
                assigned_ids.append(tid)
            return assigned_ids
        
        # Compute IOU matrix between existing tracks and new detections
        track_boxes = np.array([self.tracks[tid]['box'] for tid in track_ids])
        iou_matrix = self._compute_iou_matrix(track_boxes, det_boxes)
        
        # Use Hungarian algorithm for optimal assignment (minimize cost = 1 - IOU)
        cost_matrix = 1.0 - iou_matrix
        row_indices, col_indices = linear_sum_assignment(cost_matrix)
        
        # Determine matches
        matched_tracks = set()
        matched_dets = set()
        assigned_ids = [None] * len(detections)
        
        for row, col in zip(row_indices, col_indices):
            if iou_matrix[row, col] >= self.iou_threshold:
                tid = track_ids[row]
                self.tracks[tid]['box'] = det_boxes[col].copy()
                self.tracks[tid]['age'] = 0
                self.tracks[tid]['hits'] += 1
                assigned_ids[col] = tid
                matched_tracks.add(row)
                matched_dets.add(col)
        
        # Create new tracks for unmatched detections
        for col in range(len(detections)):
            if col not in matched_dets:
                tid = self.next_id
                self.next_id += 1
                self.tracks[tid] = {'box': det_boxes[col].copy(), 'age': 0, 'hits': 1}
                assigned_ids[col] = tid
        
        # Age unmatched tracks
        to_delete = []
        for row, tid in enumerate(track_ids):
            if row not in matched_tracks:
                self.tracks[tid]['age'] += 1
                if self.tracks[tid]['age'] > self.max_age:
                    to_delete.append(tid)
        for tid in to_delete:
            del self.tracks[tid]
        
        return assigned_ids


# Global database instance — uses the same cairetaker.db as the auth server
db = FallIncidentDB()


# ============================================================================
# TCN GAIT ANALYZER  (ONNX Runtime inference)
# ============================================================================

class GaitAnalyzer:
    """Real-time gait analysis using the TCN model exported by train_tcn_v2.py.
    
    For each tracked person, maintains a rolling buffer of keypoints.
    When the buffer reaches TCN_WINDOW frames, runs ONNX inference to
    classify gait as Normal (0) or Abnormal (1).
    
    Uses the EXACT same normalization as training:
    - Hip-centered: subtract hip midpoint from all keypoints
    - Scale-invariant: divide by inter-hip distance
    - Input shape: (1, 34, 60) = (batch, channels, time)
    """
    
    # Exponential Moving Average factor for keypoint smoothing.
    # Lower = more smoothing (less jitter), higher = more responsive.
    EMA_ALPHA = 0.25
    
    def __init__(self, onnx_path):
        self.enabled = False
        self.session = None
        self.input_name = None
        
        # Per-person state
        self.keypoint_buffers = {}     # track_id -> deque of (17, 2) arrays
        self.frame_counters = {}       # track_id -> frames since last analysis
        self.last_alert_time = {}      # track_id -> timestamp of last alert
        self.gait_results = {}         # track_id -> {'is_abnormal': bool, 'confidence': float}
        self.smoothed_keypoints = {}   # track_id -> last EMA-smoothed (17, 2) array
        self.motion_window_counts = {} # track_id -> consecutive windows where motion gate passed
        
        if not ONNX_AVAILABLE:
            print("[GaitAnalyzer] ONNX Runtime not available — gait analysis disabled")
            return
        
        if not os.path.exists(onnx_path):
            print(f"[GaitAnalyzer] Model not found at: {onnx_path}")
            print(f"               Gait analysis disabled (fall detection unaffected)")
            print(f"               Train with train_tcn_v2.py and copy tcn_gait_model.onnx to backend/models/")
            return
        
        try:
            # Use CPU execution provider (Pi doesn't have CUDA for ONNX)
            self.session = ort.InferenceSession(
                onnx_path,
                providers=['CPUExecutionProvider']
            )
            self.input_name = self.session.get_inputs()[0].name
            self.enabled = True
            
            # Log model info
            inp = self.session.get_inputs()[0]
            out = self.session.get_outputs()[0]
            print(f"[GaitAnalyzer] TCN model loaded successfully")
            print(f"  Input:  {inp.name} {inp.shape}")
            print(f"  Output: {out.name} {out.shape}")
        except Exception as e:
            print(f"[GaitAnalyzer] Failed to load model: {e}")
            print(f"               Gait analysis disabled (fall detection unaffected)")
    
    @staticmethod
    def _normalize_keypoints(kps_xy):
        """Hip-centered normalization — MUST match train_tcn_v2.py exactly.
        
        Args:
            kps_xy: numpy array of shape (T, 17, 2) — x, y coordinates only
        
        Returns:
            Normalized array of same shape with hip_center=origin, inter-hip=1.0
        """
        left_hip  = kps_xy[:, Config.TCN_LEFT_HIP_IDX,  :]
        right_hip = kps_xy[:, Config.TCN_RIGHT_HIP_IDX, :]
        hip_center = (left_hip + right_hip) / 2.0
        hip_dist   = np.linalg.norm(left_hip - right_hip, axis=1, keepdims=True)
        hip_dist   = np.clip(hip_dist, 1e-6, None)
        return (kps_xy - hip_center[:, np.newaxis, :]) / hip_dist[:, np.newaxis, :]
    
    def feed_keypoints(self, track_id, keypoints):
        """Feed a single frame's keypoints for a tracked person.
        
        Args:
            track_id: integer person tracking ID
            keypoints: (17, 3) numpy array [x, y, confidence]
        
        Returns:
            dict or None: {'is_abnormal': bool, 'confidence': float} when analysis runs
        """
        if not self.enabled:
            return None
        
        # Extract just x, y (drop confidence) — shape (17, 2)
        kps_xy = keypoints[:, :2].copy()
        
        # Initialize buffer for new person
        if track_id not in self.keypoint_buffers:
            self.keypoint_buffers[track_id] = deque(maxlen=Config.TCN_WINDOW)
            self.frame_counters[track_id] = 0
            self.smoothed_keypoints[track_id] = kps_xy.copy()
        
        # ---- EMA SMOOTHING: dampen YOLO pose jitter before buffering ----
        # Without this, sub-pixel jitter on a stationary person creates
        # noisy sequences the TCN interprets as micro-steps.
        prev = self.smoothed_keypoints[track_id]
        smoothed = self.EMA_ALPHA * kps_xy + (1.0 - self.EMA_ALPHA) * prev
        self.smoothed_keypoints[track_id] = smoothed
        
        self.keypoint_buffers[track_id].append(smoothed)
        self.frame_counters[track_id] += 1
        
        # Only run analysis when buffer is full and stride interval reached
        buf = self.keypoint_buffers[track_id]
        if len(buf) < Config.TCN_WINDOW:
            return self.gait_results.get(track_id)
        
        if self.frame_counters[track_id] < Config.TCN_STRIDE:
            return self.gait_results.get(track_id)
        
        # Reset stride counter
        self.frame_counters[track_id] = 0
        
        # Build window: (TCN_WINDOW, 17, 2)
        window = np.array(list(buf), dtype=np.float32)
        
        # ---- MOTION GATE: skip classification if person is standing still ----
        # Four layered checks to reject YOLO jitter-as-motion:
        #   1. Keypoint variance stillness: overall pose stability
        #   2. Net displacement (start→end): cancels random jitter
        #   3. Avg per-frame displacement: ensures sustained movement
        #   4. Limb oscillation: walking requires cyclic knee/ankle motion
        
        # -- Check 1: KEYPOINT VARIANCE STILLNESS --
        # If all keypoints barely move across the window, person is definitively still.
        # This catches slow drift that passes displacement checks.
        kp_std = np.std(window, axis=0)  # (17, 2) std per joint per axis
        mean_kp_std = float(np.mean(kp_std))  # single scalar
        
        if mean_kp_std < Config.TCN_STILLNESS_STD_THRESHOLD:
            self.motion_window_counts[track_id] = 0  # Reset sustained motion
            result = {'is_abnormal': False, 'confidence': 0.0}
            self.gait_results[track_id] = result
            if Config.DEBUG_LOGGING:
                print(f"[GaitAnalyzer] Person {track_id}: stationary "
                      f"(mean_kp_std={mean_kp_std:.2f}px < {Config.TCN_STILLNESS_STD_THRESHOLD}), skipping")
            return result
        
        hip_centers = (window[:, Config.TCN_LEFT_HIP_IDX, :] + 
                       window[:, Config.TCN_RIGHT_HIP_IDX, :]) / 2.0
        
        # -- Check 2: Net displacement --
        net_displacement = float(np.linalg.norm(hip_centers[-1] - hip_centers[0]))
        
        # -- Check 3: Average per-frame displacement --
        frame_deltas = np.linalg.norm(np.diff(hip_centers, axis=0), axis=1)
        avg_frame_displacement = float(np.mean(frame_deltas))
        
        # Either failing means stationary
        if (net_displacement < Config.TCN_MOTION_THRESHOLD
                or avg_frame_displacement < Config.TCN_AVG_FRAME_THRESHOLD):
            self.motion_window_counts[track_id] = 0  # Reset sustained motion
            result = {'is_abnormal': False, 'confidence': 0.0}
            self.gait_results[track_id] = result
            if Config.DEBUG_LOGGING:
                print(f"[GaitAnalyzer] Person {track_id}: stationary "
                      f"(net={net_displacement:.1f}px, avg_frame={avg_frame_displacement:.1f}px), skipping")
            return result
        
        # -- Check 4: LIMB OSCILLATION --
        # Walking produces cyclic motion in knees (13,14) and ankles (15,16).
        # If these joints are static, the person isn't stepping.
        limb_indices = [13, 14, 15, 16]  # L-knee, R-knee, L-ankle, R-ankle
        limb_positions = window[:, limb_indices, :]  # (T, 4, 2)
        limb_deltas = np.diff(limb_positions, axis=0)  # (T-1, 4, 2)
        limb_motion_std = float(np.mean(np.std(np.linalg.norm(limb_deltas, axis=2), axis=0)))
        
        if limb_motion_std < Config.TCN_LIMB_MOTION_STD_THRESHOLD:
            self.motion_window_counts[track_id] = 0  # Reset sustained motion
            result = {'is_abnormal': False, 'confidence': 0.0}
            self.gait_results[track_id] = result
            if Config.DEBUG_LOGGING:
                print(f"[GaitAnalyzer] Person {track_id}: stationary "
                      f"(limb_std={limb_motion_std:.2f}px < {Config.TCN_LIMB_MOTION_STD_THRESHOLD}), skipping")
            return result
        
        # -- Check 5: SUSTAINED MOTION --
        # Require motion to persist across multiple consecutive analysis windows.
        # A brief turn/gesture passes one window but won't sustain for 3+.
        self.motion_window_counts[track_id] = self.motion_window_counts.get(track_id, 0) + 1
        
        if self.motion_window_counts[track_id] < Config.TCN_MIN_MOTION_WINDOWS:
            if Config.DEBUG_LOGGING:
                print(f"[GaitAnalyzer] Person {track_id}: motion detected but not sustained "
                      f"({self.motion_window_counts[track_id]}/{Config.TCN_MIN_MOTION_WINDOWS} windows), waiting")
            return self.gait_results.get(track_id)
        
        # Normalize (hip-centered) — matches training exactly
        window_norm = self._normalize_keypoints(window)
        
        # Reshape to (TCN_WINDOW, 34) then transpose to (34, TCN_WINDOW) for TCN
        window_flat = window_norm.reshape(Config.TCN_WINDOW, Config.TCN_IN_CHANNELS)
        # Input shape for ONNX: (1, 34, 60)
        input_tensor = window_flat.T[np.newaxis, :, :].astype(np.float32)
        
        try:
            # Run ONNX inference
            outputs = self.session.run(None, {self.input_name: input_tensor})
            logit = float(outputs[0][0][0])
            
            # Apply sigmoid to get probability
            prob = 1.0 / (1.0 + np.exp(-np.clip(logit, -50, 50)))
            
            is_abnormal = prob >= Config.TCN_THRESHOLD
            
            result = {
                'is_abnormal': bool(is_abnormal),
                'confidence': float(prob)
            }
            self.gait_results[track_id] = result
            return result
            
        except Exception as e:
            if Config.DEBUG_LOGGING:
                print(f"[GaitAnalyzer] Inference error for person {track_id}: {e}")
            return self.gait_results.get(track_id)
    
    def should_alert(self, track_id):
        """Check if enough time has passed since the last alert for this person."""
        current_time = time.time()
        last_alert = self.last_alert_time.get(track_id, 0)
        return (current_time - last_alert) >= Config.TCN_ALERT_COOLDOWN
    
    def mark_alerted(self, track_id):
        """Record that an alert was just sent for this person."""
        self.last_alert_time[track_id] = time.time()
    
    def cleanup_person(self, track_id):
        """Remove all state for a person who left the frame."""
        self.keypoint_buffers.pop(track_id, None)
        self.frame_counters.pop(track_id, None)
        self.last_alert_time.pop(track_id, None)
        self.gait_results.pop(track_id, None)
        self.smoothed_keypoints.pop(track_id, None)
        self.motion_window_counts.pop(track_id, None)
    
    def get_result(self, track_id):
        """Get the latest gait result for a person (may be None)."""
        return self.gait_results.get(track_id)


# ============================================================================
# FALL DETECTOR CLASS
# ============================================================================

class FallDetector:
    def __init__(self):
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"Using device: {self.device} (CNN classifier only - YOLO runs on Hailo NPU)")
        
        # Load YOLO pose model on Hailo AI HAT+ NPU
        print("Loading YOLO pose model on Hailo AI HAT+ NPU...")
        self.pose_estimator = HailoPoseEstimator(Config.YOLO_MODEL)
        
        # Initialize IOU-based tracker (replaces ultralytics BoT-SORT)
        self.tracker = SimpleIOUTracker(
            iou_threshold=Config.TRACKER_IOU_THRESHOLD,
            max_age=Config.TRACKER_MAX_AGE
        )
        print("IOU tracker initialized")
        
        # Load Simple 1D-CNN classifier
        print("Loading Simple 1D-CNN classifier...")
        self.cnn_model = Simple1DCNN(
            num_classes=len(Config.CLASS_NAMES),
            dropout_rate=0.4
        ).to(self.device)
        
        checkpoint = torch.load(Config.CNN_MODEL_PATH, map_location=self.device)
        self.cnn_model.load_state_dict(checkpoint['model_state_dict'])
        self.cnn_model.eval()
        print(f"CNN model loaded (epoch: {checkpoint.get('epoch', 'N/A')}, val_acc: {checkpoint.get('val_acc', 0):.2f}%)")
        
        # Prediction smoothing per track ID
        self.prediction_buffers = defaultdict(lambda: deque(maxlen=Config.SMOOTHING_WINDOW))
        
        # Track fall states per person
        self.fall_states = {}
        
        # Temporal fall tracking
        self.fall_candidates = defaultdict(lambda: {
            'start_time': None,
            'frame_count': 0,
            'consecutive_fallen_frames': 0
        })
        
        # Track at-risk detections for analytics
        self.at_risk_log = []
        self.rejected_log = []
        
        # Frame counter for throttled logging
        self._frame_count = 0
        
        # ---- TCN Gait Analyzer ----
        self.gait_analyzer = GaitAnalyzer(Config.TCN_MODEL_PATH)
        self.gait_alert_count = 0  # live count of people with abnormal gait
        
    def extract_features(self, keypoints, image_shape):
        """Extract normalized keypoint features (same as inference)"""
        h, w = image_shape[:2]
        
        normalized = keypoints.copy()
        normalized[:, 0] = normalized[:, 0] / w
        normalized[:, 1] = normalized[:, 1] / h
        
        return normalized
    
    def detect(self, frame):
        """Detect pose and classify activity with tracking (same logic as inference but multi-person)"""
        self._frame_count += 1
        _should_log = Config.DEBUG_LOGGING or (self._frame_count % Config.LOG_INTERVAL == 0)
        
        # Run YOLO pose estimation on Hailo NPU
        hailo_detections = self.pose_estimator.detect(frame)
        
        # Assign track IDs using IOU tracker
        track_ids = self.tracker.update(hailo_detections)
        
        detections = []
        current_person_ids = set()
        
        if hailo_detections and len(hailo_detections) > 0:
            for idx, hailo_det in enumerate(hailo_detections):
                box = hailo_det['box']
                box_conf = hailo_det['confidence']
                keypoints = hailo_det['keypoints']  # (17, 3) array
                track_id = track_ids[idx] if idx < len(track_ids) else idx
                
                current_person_ids.add(track_id)
                
                # Initialize fall state for new person
                if track_id not in self.fall_states:
                    self.fall_states[track_id] = {
                        'is_fallen': False,
                        'incident_id': None
                    }
                
                # STRUCTURAL VALIDATION: Require both shoulders and both knees visible
                visible_count = np.sum(keypoints[:, 2] > 0.3)
                has_both_shoulders = (keypoints[5, 2] > 0.3 and keypoints[6, 2] > 0.3)
                has_both_knees = (keypoints[13, 2] > 0.3 and keypoints[14, 2] > 0.3)
                
                if has_both_shoulders and has_both_knees:
                    # Normalize keypoints
                    keypoints_normalized = self.extract_features(keypoints, frame.shape)
                    
                    # Prepare tensor
                    keypoints_tensor = torch.tensor(
                        keypoints_normalized.reshape(1, Config.NUM_KEYPOINTS, Config.NUM_COORDS),
                        dtype=torch.float32
                    ).to(self.device)
                    
                    # Forward pass (Simple1DCNN only takes keypoints)
                    with torch.no_grad():
                        outputs = self.cnn_model(keypoints_tensor)
                        probabilities = torch.softmax(outputs, dim=1)
                        confidence_val, predicted = torch.max(probabilities, 1)
                        
                        # Store RAW prediction BEFORE smoothing
                        raw_prediction = predicted.item()
                        raw_confidence = confidence_val.item()
                    
                    # Smooth predictions per track ID (for display purposes)
                    self.prediction_buffers[track_id].append(raw_prediction)
                    if len(self.prediction_buffers[track_id]) >= Config.SMOOTHING_WINDOW // 2:
                        smoothed_prediction = max(set(self.prediction_buffers[track_id]), 
                                       key=self.prediction_buffers[track_id].count)
                    else:
                        smoothed_prediction = raw_prediction
                    
                    # Use smoothed for display
                    prediction = smoothed_prediction
                    confidence = raw_confidence
                    
                    # THREE-TIER CONFIDENCE SYSTEM
                    fallen_confidence = probabilities[0][2].item()
                    
                    # Initialize variables
                    display_state = "normal"
                    confidence_tier = "N/A"
                    is_raw_fallen = False
                    
                    if raw_prediction == 2:  # Model predicts fallen class
                        if fallen_confidence >= Config.HIGH_CONFIDENCE_THRESHOLD:
                            is_raw_fallen = True
                            confidence_tier = "HIGH"
                            display_state = "normal"
                            
                        elif fallen_confidence >= Config.LOW_CONFIDENCE_THRESHOLD:
                            is_raw_fallen = False
                            confidence_tier = "AT_RISK"
                            display_state = "at_risk"
                            
                            if _should_log:
                                print(f"Person ID {track_id}: AT RISK (Medium confidence)")
                                print(f"   Fallen confidence: {fallen_confidence:.2%}")
                            
                            self.at_risk_log.append({
                                'timestamp': time.time(),
                                'person_id': track_id,
                                'confidence': fallen_confidence,
                                'reason': 'medium_confidence_fallen'
                            })
                            
                            # NOTE: At Risk database logging disabled until gait analysis is implemented
                            # db.log_at_risk_event() is available but not used yet
                            
                        else:
                            is_raw_fallen = False
                            confidence_tier = "REJECTED"
                            display_state = "normal"
                            
                            if _should_log:
                                print(f"Person ID {track_id}: Fallen REJECTED (low confidence)")
                                print(f"   Fallen confidence: {fallen_confidence:.2%}")
                            
                            self.rejected_log.append({
                                'timestamp': time.time(),
                                'person_id': track_id,
                                'confidence': fallen_confidence,
                                'reason': 'very_low_confidence'
                            })
                    else:
                        is_raw_fallen = False
                        confidence_tier = "N/A"
                        display_state = "normal"
                    
                    # Override smoothed prediction for rejected/at-risk falls
                    if raw_prediction == 2 and not is_raw_fallen:
                        if confidence_tier == "AT_RISK":
                            pass
                        else:
                            prediction = 0  # Override to Standing
                    
                    # Check for fall state changes
                    was_fallen = self.fall_states[track_id]['is_fallen']
                    
                    # BENDING DETECTION OVERRIDE
                    if is_raw_fallen:
                        is_bending, bend_conf, reasons = is_bending_posture(keypoints, frame.shape)
                        
                        if is_bending and bend_conf > 0.5:
                            if _should_log:
                                print(f"Person ID {track_id}: Detected BENDING (not fallen)")
                                print(f"  Confidence: {bend_conf:.2f}")
                                print(f"  Reasons: {', '.join(reasons)}")
                            
                            prediction = 0
                            confidence = bend_conf
                            is_raw_fallen = False
                            confidence_tier = "BENDING"
                            display_state = "normal"
                    
                    # GEOMETRIC FALL HEURISTIC (catches facing-camera falls)
                    # When someone lies facing the camera, the CNN sees a "standing"
                    # skeleton but the bounding box is wide+flat and keypoints are
                    # clustered near the ground.
                    if not is_raw_fallen and raw_prediction != 1:  # Not already fallen, not sitting
                        box_w = box[2] - box[0]
                        box_h = box[3] - box[1]
                        bbox_aspect = box_w / max(box_h, 1)
                        
                        # Keypoint vertical spread: low spread = lying flat
                        visible_kps = keypoints[keypoints[:, 2] > 0.3]
                        if len(visible_kps) >= 4:
                            y_spread = (np.max(visible_kps[:, 1]) - np.min(visible_kps[:, 1])) / max(frame.shape[0], 1)
                        else:
                            y_spread = 1.0  # Default to high spread (assume standing)
                        
                        # Wide bbox + low vertical spread + low position = likely fallen
                        hip_height = check_hip_position(keypoints, frame.shape)
                        if (bbox_aspect > 1.5 and y_spread < 0.25
                                and hip_height is not None and hip_height > 0.65):
                            is_raw_fallen = True
                            confidence_tier = "GEOMETRIC"
                            display_state = "normal"
                            prediction = 2
                            fallen_confidence = max(fallen_confidence, 0.75)
                            
                            if _should_log:
                                print(f"Person ID {track_id}: GEOMETRIC FALL DETECTED")
                                print(f"  BBox aspect: {bbox_aspect:.2f}, Y-spread: {y_spread:.2f}, Hip height: {hip_height:.2f}")
                    
                    # TEMPORAL FALL DETECTION
                    current_time = time.time()
                    candidate = self.fall_candidates[track_id]
                    
                    if is_raw_fallen:
                        if was_fallen:
                            if _should_log:
                                print(f"Person ID {track_id}: Maintaining FALLEN state")
                            
                        elif candidate['start_time'] is None:
                            candidate['start_time'] = current_time
                            candidate['frame_count'] = 1
                            candidate['consecutive_fallen_frames'] = 1
                            
                            if self.fall_states[track_id]['is_fallen']:
                                print(f"WARNING: is_fallen was True, forcing False for monitoring")
                            self.fall_states[track_id]['is_fallen'] = False
                            
                            print(f"\n{'='*60}")
                            print(f"MONITORING STARTED - Person ID {track_id}")
                            print(f"{'='*60}")
                            print(f"Fallen confidence: {fallen_confidence:.2%} (HIGH - >=70%)")
                            print(f"Confirmation requirements:")
                            print(f"  Time: {Config.FALL_CONFIRMATION_TIME}s")
                            print(f"  Frames: {Config.FALL_CONFIRMATION_FRAMES} consecutive")
                            print(f"Status: MONITORING IN PROGRESS...")
                            print(f"{'='*60}\n")
                        
                        else:
                            candidate['frame_count'] += 1
                            candidate['consecutive_fallen_frames'] += 1
                            elapsed_time = current_time - candidate['start_time']
                            
                            time_threshold_met = elapsed_time >= Config.FALL_CONFIRMATION_TIME
                            frames_threshold_met = candidate['consecutive_fallen_frames'] >= Config.FALL_CONFIRMATION_FRAMES
                            
                            if time_threshold_met and frames_threshold_met:
                                if not self.fall_states[track_id]['is_fallen']:
                                    room_name = Config.get_room_name(current_camera_index)
                                    print(f"\n{'='*70}")
                                    print(f"CONFIRMED FALL ALERT")
                                    print(f"{'='*70}")
                                    print(f"Person ID: {track_id}")
                                    print(f"Location: {room_name}")
                                    print(f"Fallen Confidence: {fallen_confidence:.2%}")
                                    print(f"Time Fallen: {elapsed_time:.2f}s")
                                    print(f"")
                                    
                                    incident_id = db.log_fall_incident(
                                        person_id=track_id,
                                        confidence=fallen_confidence,
                                        location=room_name
                                    )
                                    
                                    if incident_id is None:
                                        # Person already has an active fall in DB — skip duplicate
                                        print(f"Person ID {track_id}: Active fall already exists in DB, skipping")
                                    else:
                                        self.fall_states[track_id]['is_fallen'] = True
                                        self.fall_states[track_id]['incident_id'] = incident_id
                                        
                                        print(f"Incident logged (ID: {incident_id})")
                                        print(f"ALERT TRIGGERED - Caregivers must respond")
                                        print(f"{'='*70}\n")
                                        
                                        # Send push notification to registered devices
                                        send_expo_push_notification(
                                            "Fall Detected!",
                                            f"Person ID {track_id} has fallen at {room_name}. Confidence: {fallen_confidence:.0%}"
                                        )
                                else:
                                    if _should_log:
                                        print(f"Person ID {track_id}: Fall already confirmed")
                            else:
                                remaining_time = max(0, Config.FALL_CONFIRMATION_TIME - elapsed_time)
                                remaining_frames = max(0, Config.FALL_CONFIRMATION_FRAMES - candidate['consecutive_fallen_frames'])
                                
                                if _should_log:
                                    print(f"Person ID {track_id}: MONITORING IN PROGRESS")
                                    print(f"   Time: {elapsed_time:.2f}s / {Config.FALL_CONFIRMATION_TIME}s")
                                    print(f"   Frames: {candidate['consecutive_fallen_frames']} / {Config.FALL_CONFIRMATION_FRAMES}")
                    
                    else:
                        if candidate['start_time'] is not None:
                            elapsed = current_time - candidate['start_time']
                            
                            print(f"\n{'='*60}")
                            print(f"RECOVERY DETECTED - Person ID {track_id}")
                            print(f"{'='*60}")
                            print(f"Fallen duration: {elapsed:.2f}s")
                            print(f"Result: NO ALERT - Person recovered before confirmation")
                            print(f"Monitoring: RESET")
                            print(f"{'='*60}\n")
                            
                            candidate['start_time'] = None
                            candidate['frame_count'] = 0
                            candidate['consecutive_fallen_frames'] = 0
                        
                        if was_fallen:
                            print(f"\n{'='*70}")
                            print(f"RECOVERY CONFIRMED")
                            print(f"{'='*70}")
                            print(f"Person ID: {track_id}")
                            print(f"Status: Person has stood up and recovered")
                            
                            if self.fall_states[track_id]['incident_id'] is not None:
                                db.resolve_fall_for_person(track_id)
                                print(f"Incident {self.fall_states[track_id]['incident_id']} marked as RESOLVED")
                            
                            self.fall_states[track_id]['is_fallen'] = False
                            self.fall_states[track_id]['incident_id'] = None
                            
                            print(f"Person ID {track_id} returned to normal monitoring")
                            print(f"{'='*70}\n")
                    
                    status = "classified"
                    
                    # ---- GAIT ANALYSIS (TCN) ----
                    gait_result = self.gait_analyzer.feed_keypoints(track_id, keypoints)
                    if gait_result and gait_result['is_abnormal']:
                        if self.gait_analyzer.should_alert(track_id):
                            room_name = Config.get_room_name(current_camera_index)
                            gait_conf = gait_result['confidence']
                            
                            print(f"\n{'='*60}")
                            print(f"ABNORMAL GAIT DETECTED - Person ID {track_id}")
                            print(f"{'='*60}")
                            print(f"Location: {room_name}")
                            print(f"Confidence: {gait_conf:.2%}")
                            print(f"{'='*60}\n")
                            
                            # Log to database
                            db.log_at_risk_event(
                                person_id=track_id,
                                confidence=gait_conf,
                                location=room_name
                            )
                            
                            # Send push notification
                            send_expo_push_notification(
                                "Abnormal Gait Detected",
                                f"Person ID {track_id} at {room_name} — Confidence: {gait_conf:.0%}"
                            )
                            
                            self.gait_analyzer.mark_alerted(track_id)
                else:
                    prediction = None
                    confidence = 0.0
                    status = "insufficient_keypoints"
                    
                    if track_id in self.fall_candidates:
                        candidate = self.fall_candidates[track_id]
                        if candidate['start_time'] is not None:
                            if _should_log:
                                print(f"Person ID {track_id}: Keypoints lost during monitoring, resetting")
                            candidate['start_time'] = None
                            candidate['frame_count'] = 0
                            candidate['consecutive_fallen_frames'] = 0
                
                # Get latest gait result for this person (may be None)
                gait_result_for_det = self.gait_analyzer.get_result(track_id)
                
                detections.append({
                    'track_id': track_id,
                    'box': box,
                    'box_conf': float(box_conf),
                    'keypoints': keypoints,
                    'prediction': prediction,
                    'display_state': display_state if 'display_state' in locals() else "normal",
                    'confidence': float(confidence),
                    'confidence_tier': confidence_tier if 'confidence_tier' in locals() else "N/A",
                    'fallen_confidence': fallen_confidence if 'fallen_confidence' in locals() else 0.0,
                    'status': status,
                    'is_fallen': self.fall_states[track_id]['is_fallen'],
                    'incident_id': self.fall_states[track_id].get('incident_id'),
                    'visible_count': visible_count,
                    'gait_status': 'abnormal' if (gait_result_for_det and gait_result_for_det['is_abnormal']) else 'normal',
                    'gait_confidence': gait_result_for_det['confidence'] if gait_result_for_det else 0.0,
                })
        
        # Clean up tracking for people who left the frame
        disappeared_ids = set(self.fall_states.keys()) - current_person_ids
        for person_id in disappeared_ids:
            if self.fall_states[person_id]['is_fallen']:
                print(f"⚠ Person ID {person_id} with active fall left frame")
            del self.fall_states[person_id]
            if person_id in self.prediction_buffers:
                del self.prediction_buffers[person_id]
            if person_id in self.fall_candidates:
                del self.fall_candidates[person_id]
            self.gait_analyzer.cleanup_person(person_id)
        
        # Update live gait alert count
        self.gait_alert_count = sum(
            1 for d in detections
            if d.get('gait_status') == 'abnormal'
        )
        
        return detections
    
    def draw_results(self, frame, detections):
        """Draw bounding boxes, IDs, and classifications on frame"""
        current_time = time.time()
        
        # COCO-17 skeleton connections
        skeleton_connections = [
            (0, 1), (0, 2), (1, 3), (2, 4), (0, 5), (0, 6),
            (5, 6), (5, 11), (6, 12), (11, 12),
            (5, 7), (7, 9), (6, 8), (8, 10),
            (11, 13), (13, 15), (12, 14), (14, 16)
        ]
        
        for detection in detections:
            track_id = detection['track_id']
            box = detection['box']
            keypoints = detection['keypoints']
            prediction = detection['prediction']
            display_state = detection.get('display_state', 'normal')
            confidence = detection['confidence']
            confidence_tier = detection.get('confidence_tier', 'N/A')
            fallen_confidence = detection.get('fallen_confidence', 0.0)
            status = detection['status']
            is_fallen = detection['is_fallen']
            visible_count = detection['visible_count']
            
            x1, y1, x2, y2 = map(int, box)
            
            candidate = self.fall_candidates.get(track_id)
            is_monitoring = candidate is not None and candidate.get('start_time') is not None
            
            # Determine color and label
            if is_monitoring and not is_fallen:
                elapsed = current_time - candidate['start_time']
                remaining = Config.FALL_CONFIRMATION_TIME - elapsed
                color = (0, 165, 255)  # ORANGE for monitoring
                label = f"ID {track_id}: MONITORING ({remaining:.1f}s)"
                box_thickness = 3
            elif is_fallen:
                color = (0, 0, 255)  # RED for confirmed fall
                label = f"ID {track_id}: FALLEN (ALERT)"
                box_thickness = 4
            elif display_state == 'at_risk':
                color = Config.CLASS_COLORS['at_risk']  # ORANGE
                label = f"ID {track_id}: At Risk ({fallen_confidence:.0%})"
                box_thickness = 2
            elif prediction is not None:
                color = Config.CLASS_COLORS.get(prediction, (255, 255, 255))
                class_name = Config.CLASS_NAMES.get(prediction, "Unknown")
                label = f"ID {track_id}: {class_name} ({confidence:.0%})"
                box_thickness = 2
            else:
                color = (128, 128, 128)  # GRAY for tracking only
                label = f"ID {track_id}: Tracking ({visible_count} kpts)"
                box_thickness = 2
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, box_thickness)
            
            # Draw label
            label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
            cv2.rectangle(frame, (x1, y1 - label_size[1] - 10), (x1 + label_size[0], y1), color, -1)
            cv2.putText(frame, label, (x1, y1 - 5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            
            # Draw keypoints and skeleton
            if keypoints is not None and len(keypoints) == 17:
                # Draw skeleton lines first (so dots appear on top)
                for (a, b) in skeleton_connections:
                    if keypoints[a, 2] > 0.3 and keypoints[b, 2] > 0.3:
                        pt1 = (int(keypoints[a, 0]), int(keypoints[a, 1]))
                        pt2 = (int(keypoints[b, 0]), int(keypoints[b, 1]))
                        cv2.line(frame, pt1, pt2, color, 2)
                
                # Draw keypoint dots
                for ki in range(17):
                    kx, ky, kc = keypoints[ki]
                    if kc > 0.3:
                        cv2.circle(frame, (int(kx), int(ky)), 4, color, -1)
                        cv2.circle(frame, (int(kx), int(ky)), 5, (255, 255, 255), 1)
            
            # Draw gait status label (below bounding box)
            gait_status = detection.get('gait_status', 'normal')
            gait_conf = detection.get('gait_confidence', 0.0)
            if gait_status == 'abnormal':
                gait_color = Config.CLASS_COLORS['abnormal_gait']  # Yellow
                gait_label = f"Abnormal Gait ({gait_conf:.0%})"
                gait_label_size, _ = cv2.getTextSize(gait_label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
                gait_y = y2 + gait_label_size[1] + 8
                cv2.rectangle(frame, (x1, y2 + 2), (x1 + gait_label_size[0] + 4, gait_y + 2), gait_color, -1)
                cv2.putText(frame, gait_label, (x1 + 2, gait_y - 2),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
        
        return frame


# ============================================================================
# CAMERA & GLOBAL STATE
# ============================================================================

camera = None
camera_initialized = False
detector = None
current_camera_index = 0
current_status = {
    'people_detected': 0,
    'detections': [],
    'fps': 0
}

import threading
camera_lock = threading.Lock()
status_lock = threading.Lock()
data_gathering_lock = threading.Lock()

# Start the background CPU sampler now that threading is available
_cpu_sampler_thread = threading.Thread(target=_run_cpu_sampler, daemon=True)
_cpu_sampler_thread.start()


# ============================================================================
# SINGLE-PRODUCER / MULTI-CONSUMER FRAME BUFFER
# Captures, detects, encodes once — all viewers read the same JPEG bytes.
# ============================================================================

class FrameBuffer:
    """Thread-safe container for the latest MJPEG frame.

    Countermeasures built in:
    - Fallback frame: if no real frame has been produced yet, clients get
      a static "loading" placeholder instead of hanging.
    - Event-based wake: consumers block on threading.Event so they don't
      busy-wait, keeping CPU near zero when idle.
    - Sequence counter: lets consumers detect whether they already
      served the current frame (avoids sending duplicates).
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._event = threading.Event()          # signalled on every new frame
        self._frame_bytes: bytes = self._make_placeholder()
        self._seq: int = 0                       # monotonic frame counter

    @staticmethod
    def _make_placeholder() -> bytes:
        """Encode a static 'Loading…' placeholder JPEG."""
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(img, "Loading stream...", (140, 240),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
        _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return buf.tobytes()

    def update(self, jpeg_bytes: bytes):
        """Called by producer thread with new encoded frame."""
        with self._lock:
            self._frame_bytes = jpeg_bytes
            self._seq += 1
        self._event.set()       # wake all waiting consumers
        self._event.clear()     # reset for next cycle

    def wait_and_get(self, last_seq: int, timeout: float = 2.0):
        """Block until a new frame is available or timeout.
        Returns (jpeg_bytes, new_seq)."""
        # Fast path: a newer frame is already available
        with self._lock:
            if self._seq != last_seq:
                return self._frame_bytes, self._seq
        # Slow path: wait for producer signal
        self._event.wait(timeout=timeout)
        with self._lock:
            return self._frame_bytes, self._seq


frame_buffer = FrameBuffer()

# Producer state
_producer_thread: threading.Thread | None = None
_producer_stop = threading.Event()
_producer_lock = threading.Lock()     # guards start/stop lifecycle


def initialize_detector():
    """Initialize the fall detector (loads models)"""
    global detector
    try:
        detector = FallDetector()
        print("✓ Detector initialized successfully")
        return True
    except Exception as e:
        print(f"✗ Error initializing detector: {e}")
        import traceback
        traceback.print_exc()
        return False


def initialize_camera(camera_index=0):
    """Initialize Pi Camera V3 Wide via picamera2"""
    global camera, camera_initialized, current_camera_index
    
    with camera_lock:
        if camera is not None:
            try:
                camera.stop()
                camera.close()
            except:
                pass
        
        try:
            print(f"Initializing Pi Camera V3 Wide...")
            camera = Picamera2()

            camera_controls = {"FrameRate": Config.CAMERA_FPS}
            if controls is not None:
                camera_controls["AfMode"] = controls.AfModeEnum.Continuous
            
            config = camera.create_video_configuration(
                main={"size": Config.CAMERA_SIZE, "format": "RGB888"},
                controls=camera_controls
            )
            camera.configure(config)
            camera.start()
            
            # Give the camera time to warm up
            import time as _time
            _time.sleep(2)
            
            # Test capture
            test_frame = camera.capture_array()
            if test_frame is None:
                print("Failed to capture from Pi Camera")
                camera.stop()
                camera.close()
                camera = None
                camera_initialized = False
                return False
            
            current_camera_index = camera_index
            camera_initialized = True
            print(f"Pi Camera V3 Wide initialized ({test_frame.shape[1]}x{test_frame.shape[0]})")
            return True
            
        except Exception as e:
            print(f"Error initializing camera: {e}")
            import traceback
            traceback.print_exc()
            camera = None
            camera_initialized = False
            return False


# ---------------------------------------------------------------------------
# PRODUCER — runs in its own thread; captures, detects, encodes once.
# ---------------------------------------------------------------------------

def _frame_producer():
    """Single background thread that feeds FrameBuffer.

    Countermeasures:
    - Watchdog: auto-restarts camera after 10 consecutive capture failures.
    - Graceful stop: honours _producer_stop event so camera switch / shutdown
      can terminate the loop cleanly.
    - Error frame: on unrecoverable camera failure the buffer receives a
      static error image so clients don't hang forever.
    """
    global camera, camera_initialized

    if not camera_initialized:
        print("⚠ Producer: camera not initialised, attempting...")
        if not initialize_camera(current_camera_index):
            print("✗ Producer: camera init failed — pushing error frame")
            _push_error_frame("Camera Unavailable", "Please check camera connection")
            return

    print(f"✓ Producer started for camera {current_camera_index}")
    frame_count = 0
    fps_time = time.time()
    fps_value = 0
    consecutive_failures = 0

    while not _producer_stop.is_set():
        try:
            # --- capture ---
            with camera_lock:
                if camera is None:
                    print("Producer: camera lost, reconnecting...")
                    if not initialize_camera(current_camera_index):
                        time.sleep(1)
                        continue
                try:
                    frame = camera.capture_array()
                    success = frame is not None
                except Exception:
                    success = False
                    frame = None

            if not success or frame is None:
                consecutive_failures += 1
                if consecutive_failures % 5 == 0:
                    print(f"Producer: frame read failed ({consecutive_failures} in a row)")
                if consecutive_failures > 10:
                    print("Producer: too many failures — reinitialising camera")
                    camera_initialized = False
                    if not initialize_camera(current_camera_index):
                        _push_error_frame("Camera Lost", "Attempting to reconnect...")
                        time.sleep(2)
                    consecutive_failures = 0
                time.sleep(0.05)
                continue

            consecutive_failures = 0

            # --- detect ---
            if detector is not None:
                _t_detect_start = time.time()
                detections = detector.detect(frame)
                _inference_ms = (time.time() - _t_detect_start) * 1000
                frame = detector.draw_results(frame, detections)

                with status_lock:
                    current_status['people_detected'] = len(detections)
                    current_status['gait_alerts'] = detector.gait_alert_count
                    current_status['gait_enabled'] = detector.gait_analyzer.enabled
                    current_status['detections'] = [
                        {
                            'id': d['track_id'],
                            'status': 'At Risk' if d.get('display_state') == 'at_risk' else Config.CLASS_NAMES.get(d['prediction'], 'Tracking') if d['status'] == 'classified' else 'Tracking',
                            'confidence': d['confidence'],
                            'confidence_tier': d.get('confidence_tier', 'N/A'),
                            'is_fall': d.get('is_fallen', False),
                            'is_at_risk': d.get('display_state') == 'at_risk',
                            'incident_id': d.get('incident_id'),
                            'gait_status': d.get('gait_status', 'normal'),
                            'gait_confidence': d.get('gait_confidence', 0.0),
                        }
                        for d in detections
                    ]

                frame_count += 1
                if frame_count % 10 == 0:
                    now = time.time()
                    fps_value = 10 / max(now - fps_time, 0.001)
                    fps_time = now
                    current_status['fps'] = round(fps_value, 1)

                # ---- DATA GATHERING: sample metrics ----
                if data_gathering['active']:
                    _cpu = _cpu_sampler_value if PSUTIL_AVAILABLE else 0.0
                    _mem_mb = (_psutil.virtual_memory().used / (1024 * 1024)) if PSUTIL_AVAILABLE else 0.0
                    _volts = _voltage_sampler_value
                    _temp = _temp_sampler_value
                    with data_gathering_lock:
                        data_gathering['inference_times_ms'].append(_inference_ms)
                        data_gathering['fps_samples'].append(fps_value)
                        data_gathering['cpu_samples'].append(_cpu)
                        data_gathering['memory_samples_mb'].append(_mem_mb)
                        if _volts > 0:
                            data_gathering['voltage_samples'].append(_volts)
                        if _temp > 0:
                            data_gathering['temp_samples'].append(_temp)

                        # Per-person-count snapshot: accumulate 5 frames, then average
                        _n = len(detections)
                        accum = data_gathering['_perf_count_accum']
                        if _n not in data_gathering['perf_by_person_count']:
                            if _n not in accum:
                                accum[_n] = {'frames': 0, 'sum_fps': 0.0,
                                             'sum_inf': 0.0, 'sum_cpu': 0.0, 'sum_mem': 0.0}
                            a = accum[_n]
                            a['frames'] += 1
                            a['sum_fps'] += fps_value
                            a['sum_inf'] += _inference_ms
                            a['sum_cpu'] += _cpu
                            a['sum_mem'] += _mem_mb
                            if a['frames'] >= 5:
                                n = a['frames']
                                data_gathering['perf_by_person_count'][_n] = {
                                    'fps': round(a['sum_fps'] / n, 2),
                                    'inference_ms': round(a['sum_inf'] / n, 2),
                                    'cpu_percent': round(a['sum_cpu'] / n, 2),
                                    'memory_mb': round(a['sum_mem'] / n, 2),
                                }
                                del accum[_n]

                cv2.putText(frame, f"FPS: {fps_value:.1f} | Camera: {current_camera_index}",
                            (frame.shape[1] - 350, 40),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

            # --- resize / sharpen / encode (once for all viewers) ---
            stream_width, stream_height = Config.STREAM_SIZE
            if frame.shape[1] != stream_width or frame.shape[0] != stream_height:
                frame = cv2.resize(frame, (stream_width, stream_height), interpolation=cv2.INTER_AREA)

            if Config.APPLY_SHARPEN:
                blurred = cv2.GaussianBlur(frame, (0, 0), 1.0)
                frame = cv2.addWeighted(frame, 1.15, blurred, -0.15, 0)

            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, Config.JPEG_QUALITY])
            if not ret:
                continue

            frame_buffer.update(buffer.tobytes())

        except Exception as e:
            print(f"✗ Producer error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(0.1)

    print("Producer thread stopped.")


def _push_error_frame(title: str, subtitle: str):
    """Encode a static error image and push it into the shared buffer."""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(img, title, (120, 240),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
    cv2.putText(img, subtitle, (80, 300),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    _, buf = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 70])
    frame_buffer.update(buf.tobytes())


# ---------------------------------------------------------------------------
# PRODUCER LIFECYCLE — start / stop / restart with safety lock.
# ---------------------------------------------------------------------------

def start_producer():
    """Start the frame-producer thread (idempotent)."""
    global _producer_thread
    with _producer_lock:
        if _producer_thread is not None and _producer_thread.is_alive():
            return  # already running
        _producer_stop.clear()
        _producer_thread = threading.Thread(target=_frame_producer, daemon=True,
                                            name="frame-producer")
        _producer_thread.start()
        print("✓ Frame producer thread launched")


def stop_producer(timeout: float = 5.0):
    """Gracefully stop the producer thread."""
    global _producer_thread
    with _producer_lock:
        if _producer_thread is None or not _producer_thread.is_alive():
            return
        _producer_stop.set()
        _producer_thread.join(timeout=timeout)
        if _producer_thread.is_alive():
            print("⚠ Producer thread did not stop in time")
        _producer_thread = None
        print("Producer thread stopped cleanly")


def restart_producer():
    """Stop then start — used after camera switch."""
    stop_producer()
    start_producer()


# ---------------------------------------------------------------------------
# CONSUMER — lightweight generator; just relays pre-encoded frames.
# ---------------------------------------------------------------------------

def generate_frames():
    """Generator consumed by each MJPEG client connection.

    Countermeasures:
    - Timeout on wait (2 s): if producer stalls, client gets last known
      frame rather than hanging.
    - Auto-start: if producer is not running when the first viewer
      connects, it gets kicked off automatically.
    - Duplicate suppression: same frame is not re-sent if sequence
      has not advanced (saves bandwidth on slow producers).
    """
    # Ensure producer is alive (covers edge-case of late viewers)
    start_producer()

    last_seq = -1
    while True:
        jpeg_bytes, seq = frame_buffer.wait_and_get(last_seq, timeout=2.0)
        if seq == last_seq:
            # Timeout with no new frame — send last known to keep connection alive
            pass
        last_seq = seq
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/video_feed')
def video_feed():
    """Video streaming route"""
    print(f"📹 Video feed requested for camera {current_camera_index}")
    return Response(generate_frames(),
                   mimetype='multipart/x-mixed-replace; boundary=frame')


# Alias for mobile app compatibility
@app.route('/api/camera/stream')
def camera_stream():
    """Alias for video_feed"""
    return video_feed()


@app.route('/switch_camera', methods=['POST'])
def switch_camera():
    """Switch to a different camera"""
    global current_camera_index, camera_initialized
    
    try:
        data = request.get_json()
        new_camera_index = data.get('camera_index', 0)
        
        print(f"🔄 Switching from camera {current_camera_index} to camera {new_camera_index}")
        
        # Stop producer, switch camera, restart producer
        stop_producer()
        camera_initialized = False
        if initialize_camera(new_camera_index):
            restart_producer()
            return jsonify({
                'success': True,
                'message': f'Switched to camera {new_camera_index}',
                'camera_index': current_camera_index
            })
        else:
            return jsonify({
                'success': False,
                'message': f'Failed to switch to camera {new_camera_index}'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/available_cameras', methods=['GET'])
def get_available_cameras():
    """Get list of available camera indices"""
    available = [0]  # Pi Camera is always index 0
    
    return jsonify({
        'success': True,
        'cameras': available,
        'current_camera': current_camera_index
    })


@app.route('/status')
@app.route('/api/camera/status')
def get_status():
    """Get current detection status"""
    with status_lock:
        return jsonify({
            **current_status,
            'camera_running': camera_initialized,
            'model_loaded': detector is not None
        })


@app.route('/health')
def health():
    """Health check endpoint"""
    with camera_lock:
        cam_available = camera is not None
    
    gait_enabled = detector.gait_analyzer.enabled if detector else False
    
    return jsonify({
        'status': 'healthy',
        'detector_loaded': detector is not None,
        'camera_available': cam_available,
        'current_camera_index': current_camera_index,
        'model_type': 'HailoNPU(YOLOv8m-pose) + CPU(Simple1DCNN)' + (' + ONNX(TCN-Gait)' if gait_enabled else ''),
        'gait_analysis_enabled': gait_enabled,
    })


@app.route('/api/gait-events', methods=['GET'])
def get_gait_events():
    """Get gait alert events (at_risk type incidents)"""
    try:
        limit = int(request.args.get('limit', 100))
        
        # Reuse existing incident query, filter to at_risk type
        all_incidents = db.get_all_incidents(limit=limit)
        gait_events = [i for i in all_incidents if i.get('type') == 'at_risk']
        
        return jsonify({
            'success': True,
            'events': gait_events,
            'count': len(gait_events)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/active-falls')
def get_active_falls():
    """Get currently active falls - for mobile app"""
    active = db.get_active_falls()
    with status_lock:
        detections = current_status.get('detections', [])
    
    return jsonify({
        'success': True,
        'active_falls': active,
        'current_detections': detections
    })


@app.route('/incidents', methods=['GET'])
@app.route('/api/fall-events', methods=['GET'])
def get_incidents():
    """Get fall incidents with optional filters"""
    try:
        status_filter = request.args.get('status')
        limit = int(request.args.get('limit', 100))
        
        incidents = db.get_all_incidents(limit=limit, status=status_filter)
        
        return jsonify({
            'success': True,
            'incidents': incidents,
            'events': incidents,  # Alias for compatibility
            'count': len(incidents)
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/push-token', methods=['POST'])
def register_push_token():
    """Register an Expo Push Token for notifications"""
    data = request.get_json()
    token = data.get('token')
    
    if not token:
        return jsonify({'success': False, 'message': 'Token required'}), 400
    
    if not token.startswith('ExponentPushToken'):
        return jsonify({'success': False, 'message': 'Invalid Expo Push Token'}), 400
    
    push_tokens.add(token)
    print(f"Push token registered: {token[:30]}... (Total: {len(push_tokens)})")
    return jsonify({'success': True, 'message': 'Token registered', 'total_devices': len(push_tokens)})


@app.route('/api/push-token', methods=['DELETE'])
def unregister_push_token():
    """Unregister a push token"""
    data = request.get_json()
    token = data.get('token')
    
    if token in push_tokens:
        push_tokens.remove(token)
        return jsonify({'success': True, 'message': 'Token removed'})
    return jsonify({'success': False, 'message': 'Token not found'}), 404


@app.route('/incidents/statistics', methods=['GET'])
def get_incident_statistics():
    """Get incident statistics"""
    try:
        stats = db.get_statistics()
        return jsonify({
            'success': True,
            'statistics': stats
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/incidents/<int:incident_id>/resolve', methods=['POST'])
def resolve_incident(incident_id):
    """Manually resolve an incident"""
    try:
        db.resolve_fall_incident(incident_id)
        return jsonify({
            'success': True,
            'message': f'Incident {incident_id} resolved'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/incidents/<int:incident_id>', methods=['DELETE'])
def delete_incident(incident_id):
    """Delete a specific incident"""
    try:
        db.delete_incident(incident_id)
        return jsonify({
            'success': True,
            'message': f'Incident {incident_id} deleted'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/incidents/clear', methods=['POST'])
def clear_all_incidents():
    """Clear all incidents"""
    try:
        db.clear_all_incidents()
        return jsonify({
            'success': True,
            'message': 'All incidents cleared'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================================================
# DATA GATHERING ENDPOINTS
# ============================================================================

def _dg_compute_summary():
    """Compute summary stats from current data_gathering session."""
    with data_gathering_lock:
        dg = data_gathering.copy()
        perf_by_count = dict(dg['perf_by_person_count'])
        alert_events = list(dg['alert_events'])
        inf_times = list(dg['inference_times_ms'])
        fps_s = list(dg['fps_samples'])
        cpu_s = list(dg['cpu_samples'])
        mem_s = list(dg['memory_samples_mb'])

    now = time.time()
    start = dg['start_time']
    end = dg['end_time']
    uptime_sec = 0
    if start:
        uptime_sec = (end if end else now) - start

    avg_inf = round(sum(inf_times) / len(inf_times), 2) if inf_times else 0.0
    avg_fps = round(sum(fps_s) / len(fps_s), 2) if fps_s else 0.0
    avg_cpu = round(sum(cpu_s) / len(cpu_s), 2) if cpu_s else 0.0
    avg_mem = round(sum(mem_s) / len(mem_s), 2) if mem_s else 0.0

    with data_gathering_lock:
        volt_s = list(data_gathering['voltage_samples'])
        temp_s = list(data_gathering['temp_samples'])
    avg_voltage = round(sum(volt_s) / len(volt_s), 4) if volt_s else None
    avg_temp = round(sum(temp_s) / len(temp_s), 1) if temp_s else None

    # Alert delivery stats
    measured = [e['delivery_ms'] for e in alert_events if e['delivery_ms'] is not None]
    avg_delivery_ms = round(sum(measured) / len(measured), 1) if measured else None

    return {
        'active': dg['active'],
        'start_time': start,
        'end_time': end,
        'uptime_seconds': round(uptime_sec, 1),
        'alert_count': len(alert_events),
        'alert_events': alert_events,
        'avg_delivery_ms': avg_delivery_ms,
        'avg_inference_ms': avg_inf,
        'avg_fps': avg_fps,
        'avg_cpu_percent': avg_cpu,
        'avg_memory_mb': avg_mem,
        'avg_voltage_v': avg_voltage,
        'avg_temp_c': avg_temp,
        'perf_by_person_count': perf_by_count,
        'total_frames_sampled': len(inf_times),
    }


def _dg_format_report(summary):
    """Format the data gathering summary as a human-readable text report."""
    import datetime

    def ts(epoch):
        if epoch is None:
            return 'N/A'
        return datetime.datetime.fromtimestamp(epoch).strftime('%Y-%m-%d %H:%M:%S')

    def hms(seconds):
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    lines = [
        "=" * 60,
        "       CAIretaker Field Test Evaluation Report",
        "=" * 60,
        f"Session Start : {ts(summary['start_time'])}",
        f"Session End   : {ts(summary['end_time'])}",
        f"Total Uptime  : {hms(summary['uptime_seconds'])} ({summary['uptime_seconds']:.1f} s)",
        "",
        "-" * 60,
        "1. SYSTEM UPTIME & RELIABILITY",
        "-" * 60,
        f"  Uptime Duration : {hms(summary['uptime_seconds'])}",
        f"  Frames Sampled  : {summary['total_frames_sampled']}",
        "",
        "-" * 60,
        "2. ALERT NOTIFICATION DELIVERY TIME",
        "   (Measured as round-trip time: Pi → Expo push server per alert)",
        "-" * 60,
        f"  Total Alerts Sent        : {summary['alert_count']}",
    ]

    avg_ms = summary.get('avg_delivery_ms')
    if avg_ms is not None:
        lines.append(f"  Avg Delivery Time        : {avg_ms:.1f} ms  (Pi → Expo server round-trip)")
    else:
        lines.append(f"  Avg Delivery Time        : N/A (network error)")

    alert_events = summary.get('alert_events', [])
    if alert_events:
        lines.append("")
        lines.append(f"  {'#':<5} {'Timestamp':<22} {'Type':<26} {'Delivery':>10} {'Method':>10}")
        lines.append("  " + "-" * 75)
        for i, ev in enumerate(alert_events, 1):
            if ev['delivery_ms'] is not None:
                dms = f"{ev['delivery_ms']:.1f} ms"
            else:
                dms = "error"
            method = "probe" if ev.get('timing_only') else "push"
            lines.append(f"  {i:<5} {ts(ev['timestamp']):<22} {ev['title']:<26} {dms:>10} {method:>10}")
    else:
        lines.append("  No alerts were sent during this session.")

    lines += [
        "",
        "-" * 60,
        "3. PERFORMANCE DEGRADATION BY PEOPLE IN FRAME",
        "-" * 60,
    ]

    if summary['perf_by_person_count']:
        lines.append(f"  {'People':<8} {'FPS':>8} {'Infer(ms)':>12} {'CPU%':>8} {'Mem(MB)':>10}")
        lines.append("  " + "-" * 48)
        for n in sorted(summary['perf_by_person_count'].keys()):
            p = summary['perf_by_person_count'][n]
            lines.append(
                f"  {n:<8} {p['fps']:>8.2f} {p['inference_ms']:>12.2f} "
                f"{p['cpu_percent']:>8.2f} {p['memory_mb']:>10.2f}"
            )
    else:
        lines.append("  No person-count snapshots recorded yet.")

    lines += [
        "",
        "-" * 60,
        "4. EDGE DEVICE PERFORMANCE (Session Averages)",
        "-" * 60,
        f"  Avg Inference Time  : {summary['avg_inference_ms']:.2f} ms/frame",
        f"  Avg FPS             : {summary['avg_fps']:.2f}",
        f"  Avg CPU Utilization : {summary['avg_cpu_percent']:.2f}%",
        f"  Avg Memory Usage    : {summary['avg_memory_mb']:.2f} MB",
    ]
    v = summary.get('avg_voltage_v')
    lines.append(f"  Avg Input Voltage   : {v:.4f} V" if v is not None else
                 "  Avg Input Voltage   : N/A (vcgencmd unavailable)")
    t = summary.get('avg_temp_c')
    lines.append(f"  Avg CPU Temperature : {t:.1f} \u00b0C" if t is not None else
                 "  Avg CPU Temperature : N/A (vcgencmd unavailable)")
    lines += [
        "",
        "=" * 60,
        "              End of Report",
        "=" * 60,
    ]
    return "\n".join(lines)


@app.route('/api/data-gathering/start', methods=['POST'])
def dg_start():
    """Start a data gathering session (resets all counters)."""
    with data_gathering_lock:
        data_gathering['active'] = True
        data_gathering['start_time'] = time.time()
        data_gathering['end_time'] = None
        data_gathering['alert_events'] = []
        data_gathering['inference_times_ms'] = []
        data_gathering['fps_samples'] = []
        data_gathering['cpu_samples'] = []
        data_gathering['memory_samples_mb'] = []
        data_gathering['voltage_samples'] = []
        data_gathering['temp_samples'] = []
        data_gathering['perf_by_person_count'] = {}
        data_gathering['_perf_count_accum'] = {}
    print("[DATA GATHERING] Session started")
    return jsonify({'success': True, 'message': 'Data gathering session started'})


@app.route('/api/data-gathering/stop', methods=['POST'])
def dg_stop():
    """Stop the active data gathering session and save a copy of the report to the Pi."""
    import datetime
    with data_gathering_lock:
        data_gathering['active'] = False
        data_gathering['end_time'] = time.time()

    # Generate and save a report file on the Pi
    try:
        summary = _dg_compute_summary()
        text = _dg_format_report(summary)
        reports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'field_test_reports')
        os.makedirs(reports_dir, exist_ok=True)
        filename = f"field_test_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        filepath = os.path.join(reports_dir, filename)
        with open(filepath, 'w') as f:
            f.write(text)
        print(f"[DATA GATHERING] Session stopped. Report saved to: {filepath}")
        saved_path = filepath
    except Exception as e:
        print(f"[DATA GATHERING] Session stopped (report save failed: {e})")
        saved_path = None

    return jsonify({
        'success': True,
        'message': 'Data gathering session stopped',
        'report_saved_to': saved_path,
    })


@app.route('/api/data-gathering/status', methods=['GET'])
def dg_status():
    """Get lightweight status (active flag + uptime + key averages)."""
    summary = _dg_compute_summary()
    return jsonify({
        'success': True,
        'active': summary['active'],
        'uptime_seconds': summary['uptime_seconds'],
        'alert_count': summary['alert_count'],
        'avg_inference_ms': summary['avg_inference_ms'],
        'avg_fps': summary['avg_fps'],
        'avg_cpu_percent': summary['avg_cpu_percent'],
        'avg_memory_mb': summary['avg_memory_mb'],
        'frames_sampled': summary['total_frames_sampled'],
    })


@app.route('/api/data-gathering/report', methods=['GET'])
def dg_report():
    """Return full JSON report of the current/last session."""
    summary = _dg_compute_summary()
    return jsonify({'success': True, 'report': summary})


@app.route('/api/data-gathering/export', methods=['GET'])
def dg_export():
    """Return formatted plain-text report as a downloadable file."""
    import datetime
    from flask import Response as _Response
    summary = _dg_compute_summary()
    text = _dg_format_report(summary)
    filename = f"cairetaker_field_test_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    return _Response(
        text,
        mimetype='text/plain',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )


# ============================================================================
# MAIN
# ============================================================================

if __name__ == '__main__':
    print("\n" + "="*60)
    print("CAIretaker Backend - Enhanced Fall Detection")
    print("Powered by Hailo AI HAT+ (26 TOPS NPU)")
    print("="*60)
    
    if initialize_detector():
        print("\nInitializing default camera at startup...")
        camera_success = initialize_camera(0)
        
        if not camera_success:
            print("\n⚠ Warning: Camera initialization failed.")
            print("  The system will continue to attempt camera connection.")
            print("  Video feed will be available once camera is detected.\n")
        
        # Start the single frame-producer thread before accepting viewers
        start_producer()

        print("\nStarting Flask server...")
        print("Backend will be available at: http://localhost:5002")
        print("\nEndpoints:")
        print("  GET  /video_feed - MJPEG video stream")
        print("  GET  /api/camera/stream - Alias for video_feed")
        print("  GET  /api/camera/status - Camera & detector status")
        print("  GET  /api/active-falls - Get active fall alerts")
        print("  GET  /api/fall-events - Get fall event history")
        print("  GET  /api/gait-events - Get gait alert history")
        print("  POST /switch_camera - Switch between cameras")
        print("  GET  /available_cameras - Get available cameras")
        print("="*60 + "\n")
        
        app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
    else:
        print("\n✗ Failed to initialize. Please check model files.")
        print(f"  CNN Model Path: {Config.CNN_MODEL_PATH}")
        print(f"  YOLO Model Path: {Config.YOLO_MODEL}")
