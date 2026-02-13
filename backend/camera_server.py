"""
CAIretaker Fall Detection Camera Server
Uses YOLOv11 for fall detection and streams video to mobile app via WebSocket
"""

import cv2
import numpy as np
import base64
import json
import time
from datetime import datetime
from flask import Flask, Response, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import threading
import os

# YOLOv11 will be imported when model is loaded
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("⚠️  ultralytics not installed. Run: pip install ultralytics")

app = Flask(__name__)
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Configuration
CAMERA_INDEX = 0  # 0 = default webcam, change if you have multiple cameras
MODEL_PATH = r"C:\Users\DELL\CAIretaker-Mobile\cnn_model_fall.pth"  # Your YOLOv11 model
CONFIDENCE_THRESHOLD = 0.5
AT_RISK_THRESHOLD = 0.3  # Below confidence threshold but above this = "at risk"
STREAM_FPS = 15  # Frames per second to stream

# Class configuration from your trained model
CLASS_NAMES = {0: "Standing", 1: "Sitting", 2: "Fallen"}
CLASS_COLORS = {
    0: (0, 255, 0),      # Standing - Green (BGR)
    1: (0, 255, 255),    # Sitting - Yellow
    2: (0, 0, 255),      # Fallen - Red
    'at_risk': (0, 165, 255)  # At Risk - Orange
}

# Global state
camera = None
model = None
is_streaming = False
fall_events = []
connected_clients = 0
active_falls = []  # Currently active fall detections


class FallDetector:
    def __init__(self, model_path=MODEL_PATH):
        self.model = None
        self.model_path = model_path
        self.last_fall_time = 0
        self.fall_cooldown = 5  # Seconds between fall alerts
        self.load_model()
    
    def load_model(self):
        """Load YOLOv11 model"""
        if not YOLO_AVAILABLE:
            print("❌ Cannot load model - ultralytics not installed")
            return False
        
        if not os.path.exists(self.model_path):
            print(f"⚠️  Model not found at {self.model_path}")
            print("   Please place your fall_detection.pth file in the backend folder")
            return False
        
        try:
            self.model = YOLO(self.model_path)
            print(f"✅ Model loaded successfully: {self.model_path}")
            print(f"   Classes: {CLASS_NAMES}")
            return True
        except Exception as e:
            print(f"❌ Error loading model: {e}")
            return False
    
    def detect(self, frame):
        """
        Run fall detection on a frame
        Returns: (annotated_frame, detections_list)
        """
        global active_falls
        
        if self.model is None:
            return frame, []
        
        try:
            # Run inference
            results = self.model(frame, verbose=False)
            
            detections = []
            annotated_frame = frame.copy()
            current_falls = []
            
            for result in results:
                boxes = result.boxes
                for box in boxes:
                    # Get box coordinates
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    confidence = float(box.conf[0])
                    class_id = int(box.cls[0])
                    
                    # Use our class names
                    class_name = CLASS_NAMES.get(class_id, f"Class_{class_id}")
                    
                    # Determine detection status and color
                    is_fall = False
                    is_at_risk = False
                    
                    if class_id == 2:  # Fallen class
                        if confidence >= CONFIDENCE_THRESHOLD:
                            is_fall = True
                            color = CLASS_COLORS[2]  # Red
                        elif confidence >= AT_RISK_THRESHOLD:
                            is_at_risk = True
                            color = CLASS_COLORS['at_risk']  # Orange
                            class_name = "At Risk"
                        else:
                            continue  # Skip low confidence falls
                    elif confidence >= CONFIDENCE_THRESHOLD:
                        color = CLASS_COLORS.get(class_id, (255, 255, 255))
                    else:
                        continue  # Skip low confidence detections
                    
                    # Draw bounding box
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)
                    
                    # Add label with background
                    label = f"{class_name}: {confidence:.2f}"
                    (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
                    cv2.rectangle(annotated_frame, (x1, y1 - label_h - 10), (x1 + label_w, y1), color, -1)
                    cv2.putText(annotated_frame, label, (x1, y1 - 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
                    
                    detection = {
                        'class': class_name,
                        'confidence': confidence,
                        'bbox': [x1, y1, x2, y2],
                        'is_fall': is_fall,
                        'is_at_risk': is_at_risk,
                        'class_id': class_id
                    }
                    detections.append(detection)
                    
                    # Track falls
                    if is_fall or is_at_risk:
                        current_falls.append(detection)
            
            # Update active falls
            active_falls = current_falls
            
            # Log fall event (with cooldown)
            if current_falls:
                current_time = time.time()
                if current_time - self.last_fall_time > self.fall_cooldown:
                    for fall in current_falls:
                        if fall['is_fall']:
                            self.log_fall_event(fall['class'], fall['confidence'])
                            self.last_fall_time = current_time
                            break
            
            return annotated_frame, detections
            
        except Exception as e:
            print(f"Detection error: {e}")
            return frame, []
    
    def log_fall_event(self, class_name, confidence):
        """Log a fall detection event"""
        event = {
            'timestamp': datetime.now().isoformat(),
            'class': class_name,
            'confidence': confidence,
            'room': 'Room 1'  # Will be configurable
        }
        fall_events.append(event)
        
        # Emit alert to all connected clients
        socketio.emit('fall_detected', event)
        print(f"🚨 FALL DETECTED: {class_name} ({confidence:.2f})")


class CameraStream:
    def __init__(self, camera_index=CAMERA_INDEX):
        self.camera_index = camera_index
        self.cap = None
        self.detector = FallDetector()
        self.frame = None
        self.running = False
        self.lock = threading.Lock()
    
    def start(self):
        """Start camera capture"""
        if self.cap is not None:
            return True
        
        self.cap = cv2.VideoCapture(self.camera_index)
        if not self.cap.isOpened():
            print(f"❌ Cannot open camera {self.camera_index}")
            return False
        
        # Set camera properties
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        
        self.running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()
        print(f"✅ Camera started on index {self.camera_index}")
        return True
    
    def stop(self):
        """Stop camera capture"""
        self.running = False
        if self.cap is not None:
            self.cap.release()
            self.cap = None
        print("📷 Camera stopped")
    
    def _capture_loop(self):
        """Continuous capture loop"""
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                # Run fall detection
                annotated_frame, detections = self.detector.detect(frame)
                
                with self.lock:
                    self.frame = annotated_frame
            
            time.sleep(1 / 30)  # ~30 FPS capture
    
    def get_frame(self):
        """Get current frame"""
        with self.lock:
            return self.frame.copy() if self.frame is not None else None
    
    def get_frame_base64(self):
        """Get current frame as base64 encoded JPEG"""
        frame = self.get_frame()
        if frame is None:
            return None
        
        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        return base64.b64encode(buffer).decode('utf-8')


# Global camera instance
camera_stream = CameraStream()


# ============== REST API Routes ==============

@app.route('/api/camera/status')
def camera_status():
    """Get camera status"""
    return jsonify({
        'camera_running': camera_stream.running,
        'model_loaded': camera_stream.detector.model is not None,
        'connected_clients': connected_clients,
        'yolo_available': YOLO_AVAILABLE,
        'active_falls': len(active_falls),
        'has_active_fall': any(f['is_fall'] for f in active_falls)
    })


@app.route('/api/active-falls')
def get_active_falls():
    """Get currently active fall detections"""
    return jsonify({
        'active_falls': active_falls,
        'count': len(active_falls),
        'has_confirmed_fall': any(f['is_fall'] for f in active_falls),
        'has_at_risk': any(f['is_at_risk'] for f in active_falls)
    })


@app.route('/api/camera/start', methods=['POST'])
def start_camera():
    """Start camera capture"""
    success = camera_stream.start()
    return jsonify({
        'success': success,
        'message': 'Camera started' if success else 'Failed to start camera'
    })


@app.route('/api/camera/stop', methods=['POST'])
def stop_camera():
    """Stop camera capture"""
    camera_stream.stop()
    return jsonify({
        'success': True,
        'message': 'Camera stopped'
    })


@app.route('/api/camera/frame')
def get_single_frame():
    """Get a single frame as JPEG"""
    frame = camera_stream.get_frame()
    if frame is None:
        return jsonify({'error': 'No frame available'}), 404
    
    _, buffer = cv2.imencode('.jpg', frame)
    return Response(buffer.tobytes(), mimetype='image/jpeg')


@app.route('/api/fall-events')
def get_fall_events():
    """Get list of fall events"""
    return jsonify({
        'events': fall_events[-100:],  # Last 100 events
        'total': len(fall_events)
    })


@app.route('/api/fall-events/clear', methods=['POST'])
def clear_fall_events():
    """Clear fall events"""
    fall_events.clear()
    return jsonify({'success': True, 'message': 'Fall events cleared'})


# MJPEG Streaming endpoint (alternative to WebSocket)
def generate_mjpeg():
    """Generate MJPEG stream"""
    while True:
        frame = camera_stream.get_frame()
        if frame is not None:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        time.sleep(1 / STREAM_FPS)


@app.route('/api/camera/stream')
def video_stream():
    """MJPEG video stream endpoint"""
    return Response(generate_mjpeg(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


# ============== WebSocket Events ==============

@socketio.on('connect')
def handle_connect():
    global connected_clients
    connected_clients += 1
    print(f"📱 Client connected (Total: {connected_clients})")
    emit('status', {'message': 'Connected to CAIretaker Camera Server'})


@socketio.on('disconnect')
def handle_disconnect():
    global connected_clients
    connected_clients = max(0, connected_clients - 1)
    print(f"📱 Client disconnected (Total: {connected_clients})")


@socketio.on('start_stream')
def handle_start_stream():
    """Start streaming to client"""
    global is_streaming
    
    if not camera_stream.running:
        camera_stream.start()
    
    is_streaming = True
    emit('stream_started', {'message': 'Stream started'})
    
    # Start streaming loop in background
    def stream_loop():
        while is_streaming and connected_clients > 0:
            frame_b64 = camera_stream.get_frame_base64()
            if frame_b64:
                socketio.emit('frame', {'image': frame_b64})
            time.sleep(1 / STREAM_FPS)
    
    threading.Thread(target=stream_loop, daemon=True).start()


@socketio.on('stop_stream')
def handle_stop_stream():
    """Stop streaming"""
    global is_streaming
    is_streaming = False
    emit('stream_stopped', {'message': 'Stream stopped'})


# ============== Main ==============

if __name__ == '__main__':
    print("\n" + "="*50)
    print("  CAIretaker Fall Detection Camera Server")
    print("="*50)
    print(f"\n📷 Camera Index: {CAMERA_INDEX}")
    print(f"🤖 Model Path: {MODEL_PATH}")
    print(f"🎯 Confidence Threshold: {CONFIDENCE_THRESHOLD}")
    print(f"📺 Stream FPS: {STREAM_FPS}")
    
    if not YOLO_AVAILABLE:
        print("\n⚠️  Install ultralytics to enable fall detection:")
        print("   pip install ultralytics")
    
    if not os.path.exists(MODEL_PATH):
        print(f"\n⚠️  Model not found: {MODEL_PATH}")
        print("   Place your fall_detection.pt file in the backend folder")
    
    print("\n🌐 Server Endpoints:")
    print("   - REST API: http://localhost:5002/api/camera/status")
    print("   - MJPEG Stream: http://localhost:5002/api/camera/stream")
    print("   - WebSocket: ws://localhost:5002")
    print("\n" + "="*50 + "\n")
    
    # Auto-start camera
    camera_stream.start()
    
    # Run server
    socketio.run(app, host='0.0.0.0', port=5002, debug=False, allow_unsafe_werkzeug=True)
