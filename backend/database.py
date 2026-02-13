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
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            full_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_verified INTEGER DEFAULT 0,
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
    
    # Residents table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resident_id TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            age INTEGER NOT NULL,
            room_number TEXT NOT NULL,
            risk_level TEXT DEFAULT 'Low',
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized successfully")

# ==================== USER OPERATIONS ====================

def create_user(full_name: str, email: str, password: str) -> dict:
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
            INSERT INTO users (full_name, email, password_hash)
            VALUES (?, ?, ?)
        ''', (full_name, email.lower(), password_hash.decode('utf-8')))
        
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
            SELECT id, full_name, email, password_hash, is_verified
            FROM users WHERE email = ?
        ''', (email.lower(),))
        
        user = cursor.fetchone()
        
        if not user:
            return {'success': False, 'error': 'Invalid email or password'}
        
        # Verify password
        if bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            return {
                'success': True,
                'user': {
                    'id': user['id'],
                    'full_name': user['full_name'],
                    'email': user['email'],
                    'is_verified': bool(user['is_verified'])
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
            SELECT id, full_name, email, is_verified, created_at
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

# ==================== RESIDENT OPERATIONS ====================

def create_resident(resident_id: str, full_name: str, age: int, room_number: str, 
                    risk_level: str = 'Low', notes: str = '') -> dict:
    """Create a new resident"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Check if resident_id already exists
        cursor.execute('SELECT id FROM residents WHERE resident_id = ?', (resident_id,))
        if cursor.fetchone():
            return {'success': False, 'error': 'Resident ID already exists'}
        
        cursor.execute('''
            INSERT INTO residents (resident_id, full_name, age, room_number, risk_level, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (resident_id, full_name, age, room_number, risk_level, notes))
        
        conn.commit()
        
        return {
            'success': True,
            'id': cursor.lastrowid,
            'message': 'Resident enrolled successfully'
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def get_all_residents(include_inactive: bool = False) -> dict:
    """Get all residents"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if include_inactive:
            cursor.execute('''
                SELECT id, resident_id, full_name, age, room_number, risk_level, notes, is_active, created_at
                FROM residents ORDER BY created_at DESC
            ''')
        else:
            cursor.execute('''
                SELECT id, resident_id, full_name, age, room_number, risk_level, notes, is_active, created_at
                FROM residents WHERE is_active = 1 ORDER BY created_at DESC
            ''')
        
        residents = [dict(row) for row in cursor.fetchall()]
        
        return {
            'success': True,
            'residents': residents,
            'count': len(residents)
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def get_resident_by_id(resident_id: str) -> dict:
    """Get a resident by their resident_id"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            SELECT id, resident_id, full_name, age, room_number, risk_level, notes, is_active, created_at
            FROM residents WHERE resident_id = ?
        ''', (resident_id,))
        
        resident = cursor.fetchone()
        
        if resident:
            return {
                'success': True,
                'resident': dict(resident)
            }
        return {'success': False, 'error': 'Resident not found'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def update_resident(resident_id: str, **kwargs) -> dict:
    """Update resident information"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Build update query dynamically
        allowed_fields = ['full_name', 'age', 'room_number', 'risk_level', 'notes', 'is_active']
        updates = []
        values = []
        
        for field in allowed_fields:
            if field in kwargs:
                updates.append(f'{field} = ?')
                values.append(kwargs[field])
        
        if not updates:
            return {'success': False, 'error': 'No fields to update'}
        
        updates.append('updated_at = CURRENT_TIMESTAMP')
        values.append(resident_id)
        
        query = f"UPDATE residents SET {', '.join(updates)} WHERE resident_id = ?"
        cursor.execute(query, values)
        
        if cursor.rowcount == 0:
            return {'success': False, 'error': 'Resident not found'}
        
        conn.commit()
        return {'success': True, 'message': 'Resident updated successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

def delete_resident(resident_id: str, hard_delete: bool = False) -> dict:
    """Delete a resident (soft delete by default)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if hard_delete:
            cursor.execute('DELETE FROM residents WHERE resident_id = ?', (resident_id,))
        else:
            # Soft delete - just mark as inactive
            cursor.execute('''
                UPDATE residents SET is_active = 0, updated_at = CURRENT_TIMESTAMP
                WHERE resident_id = ?
            ''', (resident_id,))
        
        if cursor.rowcount == 0:
            return {'success': False, 'error': 'Resident not found'}
        
        conn.commit()
        return {'success': True, 'message': 'Resident deleted successfully'}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}
    finally:
        conn.close()

# Initialize database when module is imported
if __name__ == '__main__':
    init_db()
