/**
 * CAIretaker API Configuration
 * 
 * Update BACKEND_URL to your server's IP address when deploying to Raspberry Pi
 */

// For development: Use your computer's local IP when testing on physical device
// Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) to find your local IP

// Current configuration for physical device testing via Expo Go
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const CAMERA_URL = process.env.EXPO_PUBLIC_CAMERA_URL;

// For Android Emulator, use: 'http://10.0.2.2:5001'
// For iOS Simulator, use: 'http://localhost:5001'
// For Web Browser, use: 'http://localhost:5001'

export const API_CONFIG = {
  BASE_URL: BACKEND_URL,
  CAMERA_URL: CAMERA_URL,
  ENDPOINTS: {
    // Health
    HEALTH: '/api/health',

    // Auth
    REGISTER: '/api/auth/register',
    LOGIN: '/api/auth/login',
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    VERIFY_OTP: '/api/auth/verify-otp',
    RESET_PASSWORD: '/api/auth/reset-password',

    // User
    PROFILE: '/api/user/profile',

    // Users Management (Super Admin)
    USERS: '/api/users',

    // Camera
    CAMERA_STATUS: '/api/camera/status',
    CAMERA_START: '/api/camera/start',
    CAMERA_STOP: '/api/camera/stop',
    CAMERA_FRAME: '/api/camera/frame',
    CAMERA_STREAM: '/api/camera/stream',
    FALL_EVENTS: '/api/fall-events',
    ACTIVE_FALLS: '/api/active-falls',
    GAIT_EVENTS: '/api/gait-events',

    // System
    REBOOT: '/api/system/reboot',
    SHUTDOWN: '/api/system/shutdown',
    RESTART_SERVICES: '/api/system/restart-services',
    SYSTEM_STATS: '/api/system/stats',

    // Data Gathering (camera server)
    DATA_GATHERING_START: '/api/data-gathering/start',
    DATA_GATHERING_STOP: '/api/data-gathering/stop',
    DATA_GATHERING_STATUS: '/api/data-gathering/status',
    DATA_GATHERING_REPORT: '/api/data-gathering/report',
    DATA_GATHERING_EXPORT: '/api/data-gathering/export',
    // Push token registration on the camera server
    PUSH_TOKEN_CAMERA: '/api/push-token',
  },
  TIMEOUT: 10000, // 10 seconds
};

/**
 * API Helper Functions
 */

class APIService {
  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
    this.token = null;
    this.userRole = 'user';
    this.userName = '';
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
    this.userRole = 'user';
    this.userName = '';
  }

  getUserRole() {
    return this.userRole;
  }

  getUserName() {
    return this.userName;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          ok: false,
          status: 0,
          data: { success: false, error: 'Request timeout' },
        };
      }

      return {
        ok: false,
        status: 0,
        data: { success: false, error: error.message || 'Network error' },
      };
    }
  }

  // ==================== AUTH METHODS ====================

  async register(fullName, email, password) {
    return this.request(API_CONFIG.ENDPOINTS.REGISTER, {
      method: 'POST',
      body: JSON.stringify({ full_name: fullName, email, password }),
    });
  }

  async login(email, password) {
    const result = await this.request(API_CONFIG.ENDPOINTS.LOGIN, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (result.ok && result.data.access_token) {
      this.setToken(result.data.access_token);
      // Store user role and name from response
      if (result.data.user) {
        this.userRole = result.data.user.role || 'user';
        this.userName = result.data.user.full_name || '';
      }
    }

    return result;
  }

  async forgotPassword(email) {
    return this.request(API_CONFIG.ENDPOINTS.FORGOT_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOTP(email, otp, purpose = 'password_reset') {
    return this.request(API_CONFIG.ENDPOINTS.VERIFY_OTP, {
      method: 'POST',
      body: JSON.stringify({ email, otp, purpose }),
    });
  }

  async resetPassword(email, otp, newPassword) {
    return this.request(API_CONFIG.ENDPOINTS.RESET_PASSWORD, {
      method: 'POST',
      body: JSON.stringify({ email, otp, new_password: newPassword }),
    });
  }

  async getProfile() {
    return this.request(API_CONFIG.ENDPOINTS.PROFILE, {
      method: 'GET',
    });
  }

  async healthCheck() {
    return this.request(API_CONFIG.ENDPOINTS.HEALTH, {
      method: 'GET',
    });
  }

  // Logout
  logout() {
    this.clearToken();
  }

  // ==================== PUSH NOTIFICATIONS ====================

  async registerPushToken(token) {
    // Register with camera server (which handles fall detection)
    return this.cameraRequest('/api/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  // ==================== USER MANAGEMENT METHODS (Super Admin) ====================

  async getUsers() {
    return this.request(API_CONFIG.ENDPOINTS.USERS, {
      method: 'GET',
    });
  }

  async createUser(userData) {
    return this.request(API_CONFIG.ENDPOINTS.USERS, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(userId, updateData) {
    return this.request(`${API_CONFIG.ENDPOINTS.USERS}/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    });
  }

  async deleteUser(userId) {
    return this.request(`${API_CONFIG.ENDPOINTS.USERS}/${userId}`, {
      method: 'DELETE',
    });
  }

  async toggleUserStatus(userId, isActive) {
    return this.request(`${API_CONFIG.ENDPOINTS.USERS}/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  // ==================== CAMERA METHODS ====================

  async cameraRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.CAMERA_URL}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      ...options.headers,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: 'no-store', // React Native fetch cache option
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      return {
        ok: response.ok,
        status: response.status,
        data,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: { success: false, error: error.message || 'Network error' },
      };
    }
  }

  async getCameraStatus() {
    // Add timestamp to prevent caching and ensure fresh data
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.CAMERA_STATUS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async startCamera() {
    return this.cameraRequest(API_CONFIG.ENDPOINTS.CAMERA_START, {
      method: 'POST',
    });
  }

  async stopCamera() {
    return this.cameraRequest(API_CONFIG.ENDPOINTS.CAMERA_STOP, {
      method: 'POST',
    });
  }

  getCameraStreamUrl() {
    return `${API_CONFIG.CAMERA_URL}${API_CONFIG.ENDPOINTS.CAMERA_STREAM}`;
  }

  getCameraFrameUrl() {
    return `${API_CONFIG.CAMERA_URL}${API_CONFIG.ENDPOINTS.CAMERA_FRAME}`;
  }

  async getFallEvents() {
    // Add timestamp to prevent caching and ensure fresh data
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.FALL_EVENTS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async clearFallEvents() {
    return this.cameraRequest('/incidents/clear', {
      method: 'POST',
    });
  }

  async deleteFallEvent(incidentId) {
    return this.cameraRequest(`/incidents/${incidentId}`, {
      method: 'DELETE',
    });
  }

  async getActiveFalls() {
    // Add timestamp to prevent caching and ensure fresh data
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.ACTIVE_FALLS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async getGaitEvents() {
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.GAIT_EVENTS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  // ==================== SYSTEM METHODS ====================

  async healthCheck() {
    return this.request(`${API_CONFIG.ENDPOINTS.HEALTH}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async getSystemStats() {
    return this.request(`${API_CONFIG.ENDPOINTS.SYSTEM_STATS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async rebootSystem() {
    return this.request(API_CONFIG.ENDPOINTS.REBOOT, {
      method: 'POST',
    });
  }

  async shutdownSystem() {
    return this.request(API_CONFIG.ENDPOINTS.SHUTDOWN, {
      method: 'POST',
    });
  }

  async restartServices() {
    return this.request(API_CONFIG.ENDPOINTS.RESTART_SERVICES, {
      method: 'POST',
    });
  }

  // ==================== DATA GATHERING METHODS ====================

  async startDataGathering() {
    return this.cameraRequest(API_CONFIG.ENDPOINTS.DATA_GATHERING_START, {
      method: 'POST',
    });
  }

  async stopDataGathering() {
    return this.cameraRequest(API_CONFIG.ENDPOINTS.DATA_GATHERING_STOP, {
      method: 'POST',
    });
  }

  async getDataGatheringStatus() {
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.DATA_GATHERING_STATUS}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  async getDataGatheringReport() {
    return this.cameraRequest(`${API_CONFIG.ENDPOINTS.DATA_GATHERING_REPORT}?_t=${Date.now()}`, {
      method: 'GET',
    });
  }

  getDataGatheringExportUrl() {
    return `${API_CONFIG.CAMERA_URL}${API_CONFIG.ENDPOINTS.DATA_GATHERING_EXPORT}`;
  }

  async registerPushTokenOnCamera(token) {
    // Register the Expo push token with the CAMERA server (fall_detector_server_pi.py)
    // so it can measure real notification delivery times during field tests.
    return this.cameraRequest(API_CONFIG.ENDPOINTS.PUSH_TOKEN_CAMERA, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }
}

// Export singleton instance
export const api = new APIService();
export default api;
