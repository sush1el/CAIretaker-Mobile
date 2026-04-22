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

    def get_columns(table_name):
        cursor.execute(f"PRAGMA table_info({table_name})")
        return {row[1] for row in cursor.fetchall()}

    def add_column_if_missing(table_name, column_name, definition):
        cols = get_columns(table_name)
        if column_name not in cols:
            cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")
    
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

    # Backward-compatible migrations for older databases.
    add_column_if_missing('users', 'role', "TEXT DEFAULT 'user'")
    add_column_if_missing('users', 'is_verified', 'INTEGER DEFAULT 0')
    add_column_if_missing('users', 'is_active', 'INTEGER DEFAULT 1')
    add_column_if_missing('users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    add_column_if_missing('users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')

    # Normalize existing rows that may have nulls after migration.
    cursor.execute("UPDATE users SET role = 'user' WHERE role IS NULL")
    cursor.execute("UPDATE users SET is_verified = 0 WHERE is_verified IS NULL")
    cursor.execute("UPDATE users SET is_active = 1 WHERE is_active IS NULL")
    
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

    add_column_if_missing('otp_codes', 'purpose', "TEXT DEFAULT 'password_reset'")
    add_column_if_missing('otp_codes', 'is_used', 'INTEGER DEFAULT 0')
    add_column_if_missing('otp_codes', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    
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
    
    # Fall incidents table for persistent fall log storage
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS fall_incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL,
            confidence REAL NOT NULL,
            location TEXT,
            timestamp REAL NOT NULL,
            status TEXT DEFAULT 'active',
            type TEXT DEFAULT 'fall',
            resolved_at REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            person_label TEXT
        )
    ''')

    add_column_if_missing('fall_incidents', 'location', 'TEXT')
    add_column_if_missing('fall_incidents', 'status', "TEXT DEFAULT 'active'")
    add_column_if_missing('fall_incidents', 'type', "TEXT DEFAULT 'fall'")
    add_column_if_missing('fall_incidents', 'resolved_at', 'REAL')
    add_column_if_missing('fall_incidents', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
    add_column_if_missing('fall_incidents', 'person_label', 'TEXT')

    cursor.execute("UPDATE fall_incidents SET status = 'active' WHERE status IS NULL")
    cursor.execute("UPDATE fall_incidents SET type = 'fall' WHERE type IS NULL")

    # Face profiles table — stores one embedding per named person
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS face_profiles (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL UNIQUE,
            embedding  BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

# ==================== FALL INCIDENT OPERATIONS (SQLite-backed) ====================

class FallIncidentDB:
    """
    SQLite-backed database for fall incidents.
    Replaces the in-memory SimpleDatabase so logs persist across restarts.
    
    Single-active-fall-per-person rule:
    - Only one 'active' fall per person_id at a time.
    - A new fall is only logged if that person has no active fall.
    - When a person recovers, their active fall is resolved,
      making them eligible for a new fall log if they fall again.
    """

    def __init__(self, db_path=None):
        self.db_path = db_path or Config.DATABASE_PATH
        # Ensure the fall_incidents table exists
        init_db()

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _row_to_dict(self, row):
        """Convert a sqlite3.Row to a plain dict matching the old in-memory format"""
        if row is None:
            return None
        return {
            'id': row['id'],
            'person_id': row['person_id'],
            'confidence': row['confidence'],
            'location': row['location'],
            'timestamp': row['timestamp'],
            'status': row['status'],
            'type': row['type'],
            'resolved_at': row['resolved_at'],
            'person_label': row['person_label'] if 'person_label' in row.keys() else None,
        }

    # ---------- check for active fall ----------
    def has_active_fall(self, person_id):
        """Return True if the person already has an unresolved active fall"""
        conn = self._get_conn()
        try:
            row = conn.execute(
                "SELECT id FROM fall_incidents WHERE person_id = ? AND status = 'active' LIMIT 1",
                (person_id,)
            ).fetchone()
            return row is not None
        finally:
            conn.close()

    # ---------- log a new fall ----------
    def log_fall_incident(self, person_id, confidence, location, person_label=None):
        """
        Log a new fall incident.
        Returns the incident id, or None if the person already has an active fall.
        person_label: optional human-readable name (e.g. "Maria" or "Person 1")
        """
        if self.has_active_fall(person_id):
            print(f"DB: Person {person_id} already has an active fall — skipping duplicate log")
            return None

        import time as _time
        conn = self._get_conn()
        try:
            cur = conn.execute(
                '''INSERT INTO fall_incidents
                       (person_id, confidence, location, timestamp, status, type, person_label)
                   VALUES (?, ?, ?, ?, 'active', 'fall', ?)''',
                (person_id, confidence, location, _time.time(), person_label)
            )
            conn.commit()
            incident_id = cur.lastrowid
            lbl = f" ({person_label})" if person_label else ""
            print(f"DB: Fall incident {incident_id} logged for person {person_id}{lbl}")
            return incident_id
        except Exception as e:
            print(f"DB ERROR (log_fall_incident): {e}")
            return None
        finally:
            conn.close()

    # ---------- log an at-risk event ----------
    def log_at_risk_event(self, person_id, confidence, location, person_label=None):
        """Log an at-risk (abnormal gait) detection"""
        import time as _time
        conn = self._get_conn()
        try:
            cur = conn.execute(
                '''INSERT INTO fall_incidents (person_id, confidence, location, timestamp, status, type, person_label)
                   VALUES (?, ?, ?, ?, 'logged', 'at_risk', ?)''',
                (person_id, confidence, location, _time.time(), person_label)
            )
            conn.commit()
            return cur.lastrowid
        except Exception as e:
            print(f"DB ERROR (log_at_risk_event): {e}")
            return None
        finally:
            conn.close()

    # ---------- resolve by person ----------
    def resolve_fall_for_person(self, person_id):
        """Resolve all active falls for a person (called on recovery)"""
        import time as _time
        conn = self._get_conn()
        try:
            cur = conn.execute(
                '''UPDATE fall_incidents SET status = 'resolved', resolved_at = ?
                   WHERE person_id = ? AND status = 'active' ''',
                (_time.time(), person_id)
            )
            conn.commit()
            if cur.rowcount:
                print(f"DB: {cur.rowcount} incident(s) resolved for person {person_id}")
            else:
                print(f"DB: No active incidents found for person {person_id}")
        finally:
            conn.close()

    # ---------- resolve by incident id ----------
    def resolve_fall_incident(self, incident_id):
        """Resolve a specific incident"""
        import time as _time
        conn = self._get_conn()
        try:
            conn.execute(
                '''UPDATE fall_incidents SET status = 'resolved', resolved_at = ?
                   WHERE id = ?''',
                (_time.time(), incident_id)
            )
            conn.commit()
            return True
        except Exception as e:
            print(f"DB ERROR (resolve_fall_incident): {e}")
            return False
        finally:
            conn.close()

    # ---------- queries ----------
    def get_all_incidents(self, limit=100, status=None):
        """Get incidents with optional status filter, newest first"""
        conn = self._get_conn()
        try:
            if status:
                rows = conn.execute(
                    'SELECT * FROM fall_incidents WHERE status = ? ORDER BY timestamp DESC LIMIT ?',
                    (status, limit)
                ).fetchall()
            else:
                rows = conn.execute(
                    'SELECT * FROM fall_incidents ORDER BY timestamp DESC LIMIT ?',
                    (limit,)
                ).fetchall()
            return [self._row_to_dict(r) for r in rows]
        finally:
            conn.close()

    def get_active_falls(self):
        """Get currently active falls"""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                "SELECT * FROM fall_incidents WHERE status = 'active' ORDER BY timestamp DESC"
            ).fetchall()
            return [self._row_to_dict(r) for r in rows]
        finally:
            conn.close()

    def get_statistics(self):
        """Get incident statistics"""
        conn = self._get_conn()
        try:
            total = conn.execute('SELECT COUNT(*) FROM fall_incidents').fetchone()[0]
            active = conn.execute("SELECT COUNT(*) FROM fall_incidents WHERE status = 'active'").fetchone()[0]
            resolved = conn.execute("SELECT COUNT(*) FROM fall_incidents WHERE status = 'resolved'").fetchone()[0]
            return {'total': total, 'active': active, 'resolved': resolved}
        finally:
            conn.close()

    def delete_incident(self, incident_id):
        """Delete a specific incident"""
        conn = self._get_conn()
        try:
            conn.execute('DELETE FROM fall_incidents WHERE id = ?', (incident_id,))
            conn.commit()
        finally:
            conn.close()

    def clear_all_incidents(self):
        """Clear all incidents"""
        conn = self._get_conn()
        try:
            conn.execute('DELETE FROM fall_incidents')
            conn.commit()
        finally:
            conn.close()


# Initialize database when module is imported
if __name__ == '__main__':
    init_db()


# ==================== FACE PROFILE OPERATIONS ====================

class FaceProfileDB:
    """
    SQLite-backed store for named face embeddings (MobileFaceNet / InsightFace).

    Each profile holds:
    - name:      human-readable label (unique)
    - embedding: float32 numpy array serialised as raw bytes (BLOB)

    Recognition is performed by cosine-similarity comparison against all
    stored embeddings. The match is returned when similarity >= threshold.
    """

    def __init__(self, db_path=None, threshold: float = 0.40):
        self.db_path   = db_path or Config.DATABASE_PATH
        self.threshold = threshold
        # In-memory cache: name -> np.ndarray embedding
        self._cache: dict = {}
        # Ensure the table exists and populate cache
        init_db()
        self._load_cache()

    # ------------------------------------------------------------------ #
    # Private helpers                                                      #
    # ------------------------------------------------------------------ #

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _load_cache(self):
        """Reload all embeddings from DB into memory."""
        import numpy as np
        conn = self._get_conn()
        try:
            rows = conn.execute('SELECT name, embedding FROM face_profiles').fetchall()
            self._cache = {
                row['name']: np.frombuffer(row['embedding'], dtype=np.float32).copy()
                for row in rows
            }
            print(f"[FaceProfileDB] Loaded {len(self._cache)} face profile(s) into cache")
        finally:
            conn.close()

    @staticmethod
    def _cosine_similarity(a, b):
        """Cosine similarity between two 1-D vectors (range -1 to 1)."""
        import numpy as np
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        if denom < 1e-8:
            return 0.0
        return float(np.dot(a, b) / denom)

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def get_all_profiles(self) -> list:
        """Return list of {id, name} dicts (embedding excluded for network efficiency)."""
        conn = self._get_conn()
        try:
            rows = conn.execute(
                'SELECT id, name, created_at, updated_at FROM face_profiles ORDER BY name'
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def add_or_update_profile(self, name: str, embedding) -> int:
        """
        Insert or replace a face profile.
        embedding: numpy float32 array of shape (N,)
        Returns the row id.
        """
        import numpy as np
        emb = np.array(embedding, dtype=np.float32)
        blob = emb.tobytes()
        conn = self._get_conn()
        try:
            cur = conn.execute(
                '''INSERT INTO face_profiles (name, embedding, updated_at)
                   VALUES (?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(name) DO UPDATE SET
                       embedding   = excluded.embedding,
                       updated_at  = CURRENT_TIMESTAMP''',
                (name, blob)
            )
            conn.commit()
            profile_id = cur.lastrowid or conn.execute(
                'SELECT id FROM face_profiles WHERE name = ?', (name,)
            ).fetchone()['id']
            self._cache[name] = emb
            print(f"[FaceProfileDB] Profile '{name}' saved (id={profile_id})")
            return profile_id
        except Exception as e:
            print(f"[FaceProfileDB] ERROR add_or_update_profile: {e}")
            return -1
        finally:
            conn.close()

    def delete_profile(self, name: str) -> bool:
        """Delete a profile by name. Returns True if a row was deleted."""
        conn = self._get_conn()
        try:
            cur = conn.execute('DELETE FROM face_profiles WHERE name = ?', (name,))
            conn.commit()
            self._cache.pop(name, None)
            deleted = cur.rowcount > 0
            if deleted:
                print(f"[FaceProfileDB] Profile '{name}' deleted")
            return deleted
        except Exception as e:
            print(f"[FaceProfileDB] ERROR delete_profile: {e}")
            return False
        finally:
            conn.close()

    def find_match(self, embedding) -> tuple:
        """
        Compare embedding against all stored profiles.

        Returns:
            (name, similarity)  if best match >= self.threshold
            (None, 0.0)         if no match found or cache is empty
        """
        if not self._cache:
            return None, 0.0

        best_name = None
        best_sim  = -1.0
        for name, stored_emb in self._cache.items():
            sim = self._cosine_similarity(embedding, stored_emb)
            if sim > best_sim:
                best_sim  = sim
                best_name = name

        if best_sim >= self.threshold:
            return best_name, best_sim
        return None, best_sim

    def reload(self):
        """Force-reload embeddings from DB (call after external edits)."""
        self._load_cache()
