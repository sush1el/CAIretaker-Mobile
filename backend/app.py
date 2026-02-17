"""
CAIretaker Backend Server
Flask + Flask-SocketIO + SQLite
Authentication API Endpoints
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
from datetime import timedelta

from config import Config
from database import (
    init_db, create_user, verify_user, get_user_by_email,
    update_password, create_otp, verify_otp,
    get_all_users, update_user, delete_user, toggle_user_status
)
from email_service import send_otp_email

# Initialize Flask App
app = Flask(__name__)
app.config['SECRET_KEY'] = Config.SECRET_KEY
app.config['JWT_SECRET_KEY'] = Config.JWT_SECRET_KEY
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(seconds=Config.JWT_ACCESS_TOKEN_EXPIRES)

# Enable CORS for React Native
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize JWT
jwt = JWTManager(app)

# Initialize SocketIO (for future real-time features)
socketio = SocketIO(app, cors_allowed_origins="*")

# ==================== HEALTH CHECK ====================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'CAIretaker Backend',
        'version': '1.0.0'
    })

# ==================== AUTH ENDPOINTS ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    Register a new user (restricted - only Super Admin can create accounts via /api/users)
    This endpoint is kept for backward compatibility but returns an error.
    """
    return jsonify({
        'success': False, 
        'error': 'Self-registration is disabled. Please contact the administrator to create an account.'
    }), 403

@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Login user and return JWT token
    
    Request Body:
    {
        "email": "john@example.com",
        "password": "SecurePass123!"
    }
    """
    data = request.get_json()
    
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password are required'}), 400
    
    # Verify credentials
    result = verify_user(email, password)
    
    if result['success']:
        user = result['user']
        
        # Create JWT token
        access_token = create_access_token(
            identity=user['email'],
            additional_claims={
                'user_id': user['id'],
                'full_name': user['full_name'],
                'role': user['role']
            }
        )
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'access_token': access_token,
            'user': {
                'id': user['id'],
                'full_name': user['full_name'],
                'email': user['email'],
                'role': user['role'],
                'is_active': user.get('is_active', True)
            }
        })
    else:
        return jsonify(result), 401

@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """
    Request password reset OTP
    
    Request Body:
    {
        "email": "john@example.com"
    }
    """
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    
    if not email:
        return jsonify({'success': False, 'error': 'Email is required'}), 400
    
    # Check if user exists
    user_result = get_user_by_email(email)
    
    if not user_result['success']:
        # Explicitly reject non-registered emails
        return jsonify({
            'success': False,
            'error': 'This email is not registered in the system'
        }), 404
    
    # Generate OTP
    otp_result = create_otp(email, 'password_reset')
    
    if otp_result['success']:
        # Send OTP email
        email_result = send_otp_email(email, otp_result['otp'], 'password_reset')
        
        response = {
            'success': True,
            'message': 'Password reset code sent to your email'
        }
        
        # Include OTP in response for development (remove in production!)
        if Config.DEBUG and 'dev_note' in email_result:
            response['dev_otp'] = otp_result['otp']
        
        return jsonify(response)
    else:
        return jsonify(otp_result), 500

@app.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp_endpoint():
    """
    Verify OTP code
    
    Request Body:
    {
        "email": "john@example.com",
        "otp": "123456",
        "purpose": "password_reset"  // or "email_verification"
    }
    """
    data = request.get_json()
    
    email = data.get('email', '').strip().lower()
    otp_code = data.get('otp', '').strip()
    purpose = data.get('purpose', 'password_reset')
    
    if not email or not otp_code:
        return jsonify({'success': False, 'error': 'Email and OTP are required'}), 400
    
    result = verify_otp(email, otp_code, purpose)
    
    if result['success']:
        return jsonify({
            'success': True,
            'message': 'OTP verified successfully',
            'can_reset_password': True
        })
    else:
        return jsonify(result), 400

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password after OTP verification
    
    Request Body:
    {
        "email": "john@example.com",
        "otp": "123456",
        "new_password": "NewSecurePass123!"
    }
    """
    data = request.get_json()
    
    email = data.get('email', '').strip().lower()
    otp_code = data.get('otp', '').strip()
    new_password = data.get('new_password', '')
    
    if not email or not otp_code or not new_password:
        return jsonify({
            'success': False,
            'error': 'Email, OTP, and new password are required'
        }), 400
    
    # Validate new password
    if len(new_password) < 8:
        return jsonify({
            'success': False,
            'error': 'Password must be at least 8 characters'
        }), 400
    
    # Check for lowercase letter
    import re
    if not re.search(r'[a-z]', new_password):
        return jsonify({
            'success': False,
            'error': 'Password must contain at least one lowercase letter'
        }), 400
    
    # Verify OTP first
    otp_result = verify_otp(email, otp_code, 'password_reset')
    
    if not otp_result['success']:
        return jsonify(otp_result), 400
    
    # Update password
    update_result = update_password(email, new_password)
    
    if update_result['success']:
        return jsonify({
            'success': True,
            'message': 'Password reset successfully. Please login with your new password.'
        })
    else:
        return jsonify(update_result), 500

# ==================== PROTECTED ROUTES ====================

@app.route('/api/user/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get current user profile (requires JWT token)"""
    current_user_email = get_jwt_identity()
    result = get_user_by_email(current_user_email)
    
    if result['success']:
        return jsonify({
            'success': True,
            'user': result['user']
        })
    else:
        return jsonify(result), 404

# ==================== USER MANAGEMENT ENDPOINTS (Super Admin Only) ====================

def require_super_admin():
    """Helper decorator to check if user is super admin"""
    from functools import wraps
    def decorator(f):
        @wraps(f)
        @jwt_required()
        def decorated_function(*args, **kwargs):
            from flask_jwt_extended import get_jwt
            claims = get_jwt()
            if claims.get('role') != 'super_admin':
                return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    """
    Get all users (Super Admin only)
    """
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    if claims.get('role') != 'super_admin':
        return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
    
    result = get_all_users()
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/users', methods=['POST'])
@jwt_required()
def create_user_endpoint():
    """
    Create a new user (Super Admin only)
    
    Request Body:
    {
        "full_name": "John Doe",
        "email": "john@example.com",
        "password": "SecurePass123!",
        "role": "user"  // optional: "user" (default) or "super_admin"
    }
    """
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    if claims.get('role') != 'super_admin':
        return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
    
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['full_name', 'email', 'password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'{field} is required'}), 400
    
    full_name = data['full_name'].strip()
    email = data['email'].strip().lower()
    password = data['password']
    role = data.get('role', 'user')
    
    # Validate email format
    if '@' not in email or '.' not in email:
        return jsonify({'success': False, 'error': 'Invalid email format'}), 400
    
    # Validate password strength
    if len(password) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400
    
    # Check for lowercase letter
    import re
    if not re.search(r'[a-z]', password):
        return jsonify({'success': False, 'error': 'Password must contain at least one lowercase letter'}), 400
    
    # Validate role
    if role not in ['user', 'super_admin']:
        return jsonify({'success': False, 'error': 'Invalid role. Must be "user" or "super_admin"'}), 400
    
    result = create_user(full_name, email, password, role)
    
    if result['success']:
        return jsonify({
            'success': True,
            'message': 'User created successfully',
            'user_id': result['user_id']
        }), 201
    else:
        return jsonify(result), 400

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user_endpoint(user_id):
    """
    Update a user's information (Super Admin only)
    
    Request Body (all fields optional):
    {
        "full_name": "...",
        "email": "...",
        "role": "user"
    }
    """
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    if claims.get('role') != 'super_admin':
        return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
    
    data = request.get_json()
    
    # Prepare update data
    update_data = {}
    if 'full_name' in data:
        update_data['full_name'] = data['full_name'].strip()
    if 'email' in data:
        update_data['email'] = data['email'].strip().lower()
    if 'role' in data:
        if data['role'] not in ['user', 'super_admin']:
            return jsonify({'success': False, 'error': 'Invalid role'}), 400
        update_data['role'] = data['role']
    
    result = update_user(user_id, **update_data)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user_endpoint(user_id):
    """Delete a user (Super Admin only)"""
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    if claims.get('role') != 'super_admin':
        return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
    
    result = delete_user(user_id)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400

@app.route('/api/users/<int:user_id>/status', methods=['PUT'])
@jwt_required()
def toggle_user_status_endpoint(user_id):
    """
    Enable or disable a user account (Super Admin only)
    
    Request Body:
    {
        "is_active": true/false
    }
    """
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    if claims.get('role') != 'super_admin':
        return jsonify({'success': False, 'error': 'Access denied. Super Admin privileges required.'}), 403
    
    data = request.get_json()
    is_active = data.get('is_active', True)
    
    result = toggle_user_status(user_id, is_active)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400

# ==================== SOCKET.IO EVENTS ====================

@socketio.on('connect')
def handle_connect():
    print('🔌 Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('🔌 Client disconnected')

# ==================== MAIN ====================

if __name__ == '__main__':
    print("🚀 Starting CAIretaker Backend Server...")
    print(f"📍 Running on http://{Config.HOST}:{Config.PORT}")
    
    # Initialize database
    init_db()
    
    # Run with SocketIO
    socketio.run(
        app,
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG
    )
