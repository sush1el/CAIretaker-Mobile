import sqlite3
import bcrypt
from datetime import datetime, timedelta
from config import Config
import random
import string

def get_db_connection():
    """Get a database connection with row factory"""
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize the database with required tables"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users table with role field
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            is_verified INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # OTP table for password reset and email verification
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            code TEXT NOT NULL,
            purpose TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            is_used INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Sessions table (optional - for tracking active sessions)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT NOT NULL,
            device_info TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Create default Super Admin if not exists
    cursor.execute('SELECT id FROM users WHERE role = ?', ('super_admin',))
    if not cursor.fetchone():
        # Default Super Admin account
        password_hash = bcrypt.hashpw('Admin@123'.encode('utf-8'), bcrypt.gensalt())
        cursor.execute('''
            INSERT INTO users (full_name, email, password_hash, role, is_verified, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', ('Super Admin', 'admin@cairetaker.com', password_hash.decode('utf-8'), 'super_admin', 1, 1))
        print("✅ Default Super Admin created (email: admin@cairetaker.com, password: Admin@123)")
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

# ==================== USER OPERATIONS ====================

def create_user(full_name: str, email: str, password: str, role: str = 'user') -> dict:
    """Create a new user account"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if email already exists
        cursor.execute('SELECT id FROM users WHERE email = ?', (email.lower(),))
        if cursor.fetchone():
            return {'success': False, 'error': 'Email already registered'}
        
        # Hash password
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        # Insert user
        cursor.execute('''
            INSERT INTO users (full_name, email, password_hash, role, is_active)
            VALUES (?, ?, ?, ?, ?)
        ''', (full_name, email.lower(), password_hash.decode('utf-8'), role, 1))
        
        conn.commit()
        user_id = cursor.lastrowid
        
        return {
            'success': True,
            'user_id': user_id,
            'message': 'Account created successfully'
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def verify_user(email: str, password: str) -> dict:
    """Verify user credentials for login"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, full_name, email, password_hash, role, is_verified, is_active
            FROM users WHERE email = ?
        ''', (email.lower(),))
        
        user = cursor.fetchone()
        
        if not user:
            return {'success': False, 'error': 'Invalid email or password'}
        
        # Check if account is active
        if not user['is_active']:
            return {'success': False, 'error': 'Account is disabled. Contact administrator.'}
        
        # Verify password
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return {
                'success': True,
                'user': {
                    'id': user['id'],
                    'full_name': user['full_name'],
                    'email': user['email'],
                    'role': user['role'],
                    'is_verified': bool(user['is_verified']),
                    'is_active': bool(user['is_active'])
                }
            }
        else:
            return {'success': False, 'error': 'Invalid email or password'}
            
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def get_user_by_email(email: str) -> dict:
    """Get user by email"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, full_name, email, role, is_verified, is_active, created_at
            FROM users WHERE email = ?
        ''', (email.lower(),))
        
        user = cursor.fetchone()
        
        if user:
            return {
                'success': True,
                'user': dict(user)
            }
        return {'success': False, 'error': 'User not found'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def get_all_users() -> dict:
    """Get all users (for admin)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, full_name, email, role, is_verified, is_active, created_at
            FROM users ORDER BY created_at DESC
        ''')
        
        users = [dict(row) for row in cursor.fetchall()]
        
        return {
            'success': True,
            'users': users,
            'count': len(users)
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def update_user(user_id: int, **kwargs) -> dict:
    """Update user information"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Build update query dynamically
        allowed_fields = ['full_name', 'email', 'role', 'is_verified', 'is_active']
        updates = []
        values = []
        
        for field in allowed_fields:
            if field in kwargs:
                updates.append(f'{field} = ?')
                values.append(kwargs[field])
        
        if not updates:
            return {'success': False, 'error': 'No fields to update'}
        
        updates.append('updated_at = CURRENT_TIMESTAMP')
        values.append(user_id)
        
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, values)
        
        if cursor.rowcount == 0:
            return {'success': False, 'error': 'User not found'}
        
        conn.commit()
        return {'success': True, 'message': 'User updated successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def delete_user(user_id: int) -> dict:
    """Delete a user account"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Don't allow deleting super_admin
        cursor.execute('SELECT role FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return {'success': False, 'error': 'User not found'}
        
        if user['role'] == 'super_admin':
            return {'success': False, 'error': 'Cannot delete Super Admin account'}
        
        cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        
        conn.commit()
        return {'success': True, 'message': 'User deleted successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def toggle_user_status(user_id: int, is_active: bool) -> dict:
    """Enable or disable a user account"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Don't allow disabling super_admin
        cursor.execute('SELECT role FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        
        if not user:
            return {'success': False, 'error': 'User not found'}
        
        if user['role'] == 'super_admin':
            return {'success': False, 'error': 'Cannot disable Super Admin account'}
        
        cursor.execute('''
            UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (1 if is_active else 0, user_id))
        
        conn.commit()
        return {'success': True, 'message': f'User {"enabled" if is_active else "disabled"} successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def update_password(email: str, new_password: str) -> dict:
    """Update user password"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
        
        cursor.execute('''
            UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
            WHERE email = ?
        ''', (password_hash.decode('utf-8'), email.lower()))
        
        if cursor.rowcount == 0:
            return {'success': False, 'error': 'User not found'}
        
        conn.commit()
        return {'success': True, 'message': 'Password updated successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

# ==================== OTP OPERATIONS ====================

def generate_otp(length: int = 6) -> str:
    """Generate a random numeric OTP"""
    return ''.join(random.choices(string.digits, k=length))

def create_otp(email: str, purpose: str = 'password_reset') -> dict:
    """Create and store an OTP for a user"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Invalidate any existing unused OTPs for this email and purpose
        cursor.execute('''
            UPDATE otp_codes SET is_used = 1
            WHERE email = ? AND purpose = ? AND is_used = 0
        ''', (email.lower(), purpose))
        
        # Generate new OTP
        otp_code = generate_otp()
        expires_at = datetime.now() + timedelta(minutes=Config.OTP_EXPIRY_MINUTES)
        
        # Store OTP
        cursor.execute('''
            INSERT INTO otp_codes (email, code, purpose, expires_at)
            VALUES (?, ?, ?, ?)
        ''', (email.lower(), otp_code, purpose, expires_at))
        
        conn.commit()
        
        return {
            'success': True,
            'otp': otp_code,
            'expires_at': expires_at.isoformat()
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def verify_otp(email: str, otp_code: str, purpose: str = 'password_reset') -> dict:
    """Verify an OTP code"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, expires_at FROM otp_codes
            WHERE email = ? AND code = ? AND purpose = ? AND is_used = 0
            ORDER BY created_at DESC LIMIT 1
        ''', (email.lower(), otp_code, purpose))
        
        otp_record = cursor.fetchone()
        
        if not otp_record:
            return {'success': False, 'error': 'Invalid OTP code'}
        
        # Check expiry
        expires_at = datetime.fromisoformat(otp_record['expires_at'])
        if datetime.now() > expires_at:
            return {'success': False, 'error': 'OTP has expired'}
        
        # Mark OTP as used
        cursor.execute('''
            UPDATE otp_codes SET is_used = 1 WHERE id = ?
        ''', (otp_record['id'],))
        
        conn.commit()
        
        return {'success': True, 'message': 'OTP verified successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

# Initialize database when module is imported
if __name__ == '__main__':
    init_db()
