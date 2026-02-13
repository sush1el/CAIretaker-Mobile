# CAIretaker Mobile - Setup Guide

## Features

- **Real-Time Fall Detection** - Continuous monitoring with instant alerts
- **Live Status Updates** - "No Active Falls" / "Active Falls Detected!" status indicator on Home page
- **Multi-Room Support** - Monitor multiple rooms (Room 1 active, Rooms 2-3 coming soon)
- **Fall Event Logging** - Persistent logs with Room No, Status, Date, and Time
- **Background Detection** - Hidden camera stream keeps detection active even on Home page

## Prerequisites

### Required Software
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.10 or higher) - [Download](https://python.org/)
- **Expo Go** app on your mobile device - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779) | [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

### Hardware Requirements
- Webcam or laptop camera for fall detection
- Computer and mobile device on the same WiFi network

---

## Installation Steps

### 1. Clone/Download the Repository
Download or clone the project to your local machine.

### 2. Install Node.js Dependencies (React Native App)
Open terminal in the project root folder:
```bash
npm install
```

### 3. Install Python Dependencies (Backend)
Navigate to the backend folder and install dependencies:
```bash
cd backend
pip install -r requirements.txt
```

**Important for PyTorch:** If you have an NVIDIA GPU and want GPU acceleration:
```bash
# For CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# For CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

For CPU-only (no GPU):
```bash
pip install torch torchvision
```

### 4. Download/Place the AI Models

You need two model files:

#### a) Fall Detection Model (`cnn_model_fall.pth`)
- Place this file in the **project root folder** (same level as `package.json`)
- This is a custom CNN model for classifying Standing/Sitting/Fallen poses

#### b) YOLO Pose Model (`yolo11n-pose.pt`)
- Place this file in `backend/models/` folder
- Download from Ultralytics: https://docs.ultralytics.com/models/yolo11/
- Or it will auto-download on first run

**Final structure:**
```
CAIretaker-Mobile/
├── cnn_model_fall.pth          <-- Fall detection model
├── backend/
│   ├── models/
│   │   └── yolo11n-pose.pt     <-- YOLO pose model
│   ├── app.py
│   └── fall_detector_server.py
├── package.json
└── ...
```

### 5. Configure Network IP Address

Find your computer's local IP address:
- **Windows:** Run `ipconfig` in Command Prompt, look for "IPv4 Address"
- **Mac/Linux:** Run `ifconfig` or `ip addr`

Edit `src/services/api.js` and update the IP addresses:
```javascript
// Replace 192.168.100.7 with YOUR computer's IP address
const BACKEND_URL = 'http://YOUR_IP_HERE:5001';
const CAMERA_URL = 'http://YOUR_IP_HERE:5002';
```

### 6. (Optional) Configure Fall Detection Settings

Edit `backend/fall_detector_server.py` Config class if needed:
```python
class Config:
    LOCATION_NAME = "Room 1"  # Change location name shown in logs
    FALL_CONFIRMATION_TIME = 0.5  # Seconds before fall is confirmed
    CONFIDENCE_THRESHOLD = 0.65   # Detection confidence threshold
```

---

## Running the Application

### Step 1: Start the Auth Backend (Port 5001)
Open a terminal in the `backend` folder:
```bash
cd backend
python app.py
```
You should see: `Running on http://0.0.0.0:5001`

### Step 2: Start the Camera/Fall Detection Server (Port 5002)
Open another terminal in the `backend` folder:
```bash
cd backend
python fall_detector_server.py
```
You should see: `✓ Camera 0 initialized successfully`

### Step 3: Start the React Native App
Open another terminal in the project root:
```bash
npx expo start
```

### Step 4: Connect Mobile Device
1. Make sure your phone is on the same WiFi network as your computer
2. Open Expo Go app on your phone
3. Scan the QR code shown in the terminal

---

## Testing Fall Detection

1. Go to **Home** or **LiveView** in the app
2. Stand in front of your webcam
3. You should see your skeleton tracked with status "Standing"
4. Lie down on the floor for 3+ seconds
5. A fall should be detected and logged
6. On the **Home** page, the "No Active Falls" status will change to "Active Falls Detected!" (red) in real-time

### Real-Time Detection

The app includes a **hidden camera stream** on the Home page that keeps fall detection running continuously. This ensures:
- Real-time status updates (polls every 500ms)
- Falls are detected even when not viewing the Room 1 camera
- Logs are updated immediately when a fall occurs

---

## Troubleshooting

### "Failed to load residents" error
- Make sure the auth backend (port 5001) is running
- Check the IP address in `api.js` matches your computer

### Camera not working
- Make sure no other app is using the webcam
- Try closing other video apps (Zoom, Teams, etc.)
- On Windows, check camera permissions in Settings

### Models not loading
- Verify the model files exist in the correct locations
- Check the paths in `fall_detector_server.py` Config class

### Mobile app can't connect
- Make sure computer and phone are on the same WiFi network
- Check firewall settings aren't blocking ports 5001 and 5002
- Verify the IP address in `api.js` is correct

---

## Quick Reference - Commands

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
cd backend
pip install -r requirements.txt

# Start auth backend
cd backend
python app.py

# Start camera server (in another terminal)
cd backend
python fall_detector_server.py

# Start mobile app (in another terminal)
npx expo start
```

---

## Files to Customize

| File | What to Change |
|------|----------------|
| `src/services/api.js` | IP addresses (lines 11-12) |
| `backend/fall_detector_server.py` | LOCATION_NAME, model paths |
| `backend/app.py` | Email credentials for OTP (if using forgot password) |
