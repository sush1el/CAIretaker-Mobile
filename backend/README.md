# CAIretaker Backend Server

Flask-based REST API backend with SQLite database for user authentication.

## Features

- **User Registration** with password hashing (bcrypt)
- **User Login** with JWT token authentication
- **Forgot Password** with OTP via email (Gmail SMTP)
- **Password Reset** flow
- **RESTful API** endpoints
- **Flask-SocketIO** ready for real-time features

## Quick Start

### 1. Setup Python Virtual Environment

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
# Copy example config
copy .env.example .env

# Edit .env file with your settings:
# - Set SECRET_KEY (random string)
# - Set JWT_SECRET_KEY (random string)
# - Configure Gmail SMTP credentials
```

### Gmail App Password Setup

1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to App Passwords → Generate new app password
4. Use that password in `SMTP_PASSWORD`

### 4. Initialize Database

```bash
python database.py
```

### 5. Run Server

```bash
python app.py
```

Server will run on `http://0.0.0.0:5000`

## API Endpoints

### Health Check
```
GET /api/health
```

### Authentication

**Register**
```
POST /api/auth/register
Body: { "full_name": "...", "email": "...", "password": "..." }
```

**Login**
```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
Returns: { "access_token": "...", "user": {...} }
```

**Forgot Password (Send OTP)**
```
POST /api/auth/forgot-password
Body: { "email": "..." }
```

**Verify OTP**
```
POST /api/auth/verify-otp
Body: { "email": "...", "otp": "123456", "purpose": "password_reset" }
```

**Reset Password**
```
POST /api/auth/reset-password
Body: { "email": "...", "otp": "123456", "new_password": "..." }
```

### Protected Routes (Require JWT)

**Get Profile**
```
GET /api/user/profile
Headers: { "Authorization": "Bearer <token>" }
```

## Database Schema

### Users Table
- `id` - Primary key
- `full_name` - User's full name
- `email` - Unique email
- `password_hash` - Bcrypt hashed password
- `is_verified` - Email verification status
- `created_at` - Timestamp
- `updated_at` - Timestamp

### OTP Codes Table
- `id` - Primary key
- `email` - Associated email
- `code` - 6-digit OTP
- `purpose` - 'password_reset' or 'email_verification'
- `expires_at` - Expiry timestamp (10 minutes default)
- `is_used` - Usage flag

## Mobile App Configuration

Update the backend URL in `src/services/api.js`:

```javascript
// For Android Emulator:
const BACKEND_URL = 'http://10.0.2.2:5000';

// For iOS Simulator:
const BACKEND_URL = 'http://localhost:5000';

// For Physical Device (use your computer's IP):
const BACKEND_URL = 'http://192.168.1.xxx:5000';
```

## Development Notes

- In DEBUG mode, OTP codes are logged to console if email is not configured
- JWT tokens expire after 1 hour by default
- OTP codes expire after 10 minutes
