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
    create_resident, get_all_residents, get_resident_by_id, update_resident, delete_resident
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
    Register a new user
    
    Request Body:
    {
        "full_name": "John Doe",
        "email": "john@example.com",
        "password": "SecurePass123!"
    }
    """
    data = request.get_json()
    
    # Validate input
    required_fields = ['full_name', 'email', 'password']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'{field} is required'}), 400
    
    full_name = data['full_name'].strip()
    email = data['email'].strip().lower()
    password = data['password']
    
    # Validate email format
    if '@' not in email or '.' not in email:
        return jsonify({'success': False, 'error': 'Invalid email format'}), 400
    
    # Validate password strength
    if len(password) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400
    
    # Create user
    result = create_user(full_name, email, password)
    
    if result['success']:
        # Optionally send verification email
        # otp_result = create_otp(email, 'email_verification')
        # if otp_result['success']:
        #     send_otp_email(email, otp_result['otp'], 'email_verification')
        
        return jsonify({
            'success': True,
            'message': 'Account created successfully',
            'user_id': result['user_id']
        }), 201
    else:
        return jsonify(result), 400

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
                'full_name': user['full_name']
            }
        )
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'access_token': access_token,
            'user': {
                'id': user['id'],
                'full_name': user['full_name'],
                'email': user['email']
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
        # Don't reveal if email exists or not (security)
        return jsonify({
            'success': True,
            'message': 'If this email is registered, you will receive a reset code'
        })
    
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

# ==================== RESIDENT ENDPOINTS ====================

@app.route('/api/residents', methods=['GET'])
def get_residents():
    """
    Get all residents
    
    Query Parameters:
    - include_inactive: true/false (default: false)
    """
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    result = get_all_residents(include_inactive)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/residents', methods=['POST'])
def enroll_resident():
    """
    Enroll a new resident
    
    Request Body:
    {
        "resident_id": "R-001",
        "full_name": "Juan Dela Cruz",
        "age": 78,
        "room_number": "1",
        "risk_level": "High",  // optional: Low, Medium, High
        "notes": "..."         // optional
    }
    """
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['resident_id', 'full_name', 'age', 'room_number']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'error': f'{field} is required'}), 400
    
    # Validate age
    try:
        age = int(data['age'])
        if age < 0 or age > 150:
            return jsonify({'success': False, 'error': 'Invalid age'}), 400
    except ValueError:
        return jsonify({'success': False, 'error': 'Age must be a number'}), 400
    
    result = create_resident(
        resident_id=data['resident_id'].strip(),
        full_name=data['full_name'].strip(),
        age=age,
        room_number=str(data['room_number']).strip(),
        risk_level=data.get('risk_level', 'Low'),
        notes=data.get('notes', '')
    )
    
    if result['success']:
        return jsonify(result), 201
    else:
        return jsonify(result), 400

@app.route('/api/residents/<resident_id>', methods=['GET'])
def get_resident(resident_id):
    """Get a specific resident by ID"""
    result = get_resident_by_id(resident_id)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404

@app.route('/api/residents/<resident_id>', methods=['PUT'])
def update_resident_endpoint(resident_id):
    """
    Update a resident's information
    
    Request Body (all fields optional):
    {
        "full_name": "...",
        "age": 80,
        "room_number": "2",
        "risk_level": "Medium",
        "notes": "..."
    }
    """
    data = request.get_json()
    
    # Prepare update data
    update_data = {}
    if 'full_name' in data:
        update_data['full_name'] = data['full_name'].strip()
    if 'age' in data:
        try:
            update_data['age'] = int(data['age'])
        except ValueError:
            return jsonify({'success': False, 'error': 'Age must be a number'}), 400
    if 'room_number' in data:
        update_data['room_number'] = str(data['room_number']).strip()
    if 'risk_level' in data:
        if data['risk_level'] not in ['Low', 'Medium', 'High']:
            return jsonify({'success': False, 'error': 'Invalid risk level'}), 400
        update_data['risk_level'] = data['risk_level']
    if 'notes' in data:
        update_data['notes'] = data['notes']
    
    result = update_resident(resident_id, **update_data)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 400

@app.route('/api/residents/<resident_id>', methods=['DELETE'])
def delete_resident_endpoint(resident_id):
    """
    Delete a resident
    
    Query Parameters:
    - hard: true/false (default: false for soft delete)
    """
    hard_delete = request.args.get('hard', 'false').lower() == 'true'
    result = delete_resident(resident_id, hard_delete)
    
    if result['success']:
        return jsonify(result)
    else:
        return jsonify(result), 404

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
