import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl
} from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { 
  faUserGear, 
  faTrash, 
  faPlus, 
  faExclamationTriangle, 
  faToggleOn,
  faToggleOff,
  faEye,
  faEyeSlash
} from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const roleColors = {
  super_admin: { bg: '#E3F2FD', text: '#1565C0' },
  user: { bg: '#E8F5E9', text: '#2E7D32' },
};

const statusColors = {
  active: { bg: '#E8F5E9', text: '#2E7D32' },
  disabled: { bg: '#FFEBEE', text: '#C62828' },
};

export default function UserManagement() {
  const { theme } = useTheme();
  
  // State
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const result = await api.getUsers();
      if (result.ok && result.data.success) {
        setUsers(result.data.users);
      } else {
        console.error('Failed to load users:', result.data.error);
        if (result.status === 403) {
          Alert.alert('Access Denied', 'You do not have permission to view users.');
        }
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadUsers();
  };

  const clearForm = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleCreateUser = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!password || password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (!/[a-z]/.test(password)) {
      Alert.alert('Error', 'Password must contain at least one lowercase letter');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    
    setIsSaving(true);
    
    try {
      const result = await api.createUser({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password: password,
        role: 'user', // All new users are automatically 'user' role
      });
      
      if (result.ok && result.data.success) {
        Alert.alert('Success', 'User created successfully!');
        clearForm();
        loadUsers();
      } else {
        Alert.alert('Error', result.data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const newStatus = !user.is_active;
    
    try {
      const result = await api.toggleUserStatus(user.id, newStatus);
      
      if (result.ok && result.data.success) {
        loadUsers();
      } else {
        Alert.alert('Error', result.data.error || 'Failed to update user status');
      }
    } catch (error) {
      console.error('Error toggling user status:', error);
      Alert.alert('Error', 'Unable to connect to server');
    }
  };

  const confirmDelete = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const result = await api.deleteUser(userToDelete.id);
      
      if (result.ok && result.data.success) {
        Alert.alert('Success', 'User deleted successfully');
        setShowDeleteModal(false);
        setUserToDelete(null);
        loadUsers();
      } else {
        Alert.alert('Error', result.data.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
  };

  // Dynamic styles
  const dynamicStyles = {
    container: { flex: 1 },
    pillHeader: { 
      backgroundColor: theme.pillBg, 
      padding: 12, 
      borderRadius: 30, 
      flexDirection: 'row', 
      justifyContent: 'center', 
      alignItems: 'center', 
      marginBottom: 15 
    },
    pillHeaderText: { fontWeight: '800', color: theme.textPrimary, marginRight: 10, fontSize: 15 },
    formCard: { backgroundColor: theme.cardBg, borderRadius: 20, padding: 20, marginBottom: 20 },
    formInput: { 
      backgroundColor: theme.inputBg, 
      borderRadius: 10, 
      padding: 12, 
      marginBottom: 12, 
      borderWidth: 1, 
      borderColor: theme.inputBorder, 
      color: theme.textPrimary,
      fontSize: 15,
    },
    logsHeaderCard: { 
      backgroundColor: theme.primary, 
      padding: 12, 
      borderTopLeftRadius: 15, 
      borderTopRightRadius: 15, 
      flexDirection: 'row', 
      justifyContent: 'center', 
      alignItems: 'center' 
    },
    logsTableContainer: { 
      backgroundColor: theme.cardBg, 
      borderBottomLeftRadius: 15, 
      borderBottomRightRadius: 15, 
      padding: 15,
      minHeight: 100,
    },
    tableRow: { 
      flexDirection: 'row', 
      paddingVertical: 12, 
      borderBottomWidth: 1, 
      borderBottomColor: theme.inputBorder, 
      alignItems: 'center' 
    },
  };

  return (
    <ScrollView 
      style={dynamicStyles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>USER MANAGEMENT</Text>
        <FontAwesomeIcon icon={faUserGear} color={theme.textPrimary} size={18}/>
      </View>
      
      {/* Create User Form */}
      <View style={dynamicStyles.formCard}>
        <View style={styles.formTitleRow}>
          <FontAwesomeIcon icon={faPlus} color={theme.textPrimary} size={14}/>
          <Text style={[styles.formTitle, { color: theme.textPrimary }]}>Create New User</Text>
        </View>
        
        <TextInput 
          style={dynamicStyles.formInput} 
          placeholder="Full Name" 
          placeholderTextColor={theme.textMuted}
          value={fullName}
          onChangeText={setFullName}
        />
        
        <TextInput 
          style={dynamicStyles.formInput} 
          placeholder="Email Address" 
          placeholderTextColor={theme.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        
        <View style={styles.passwordContainer}>
          <TextInput 
            style={[dynamicStyles.formInput, styles.passwordInput]} 
            placeholder="Password (min 8 characters)" 
            placeholderTextColor={theme.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <FontAwesomeIcon 
              icon={showPassword ? faEyeSlash : faEye} 
              color={theme.textMuted} 
              size={18}
            />
          </TouchableOpacity>
        </View>
        
        <View style={styles.passwordContainer}>
          <TextInput 
            style={[dynamicStyles.formInput, styles.passwordInput]} 
            placeholder="Confirm Password" 
            placeholderTextColor={theme.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
          >
            <FontAwesomeIcon 
              icon={showConfirmPassword ? faEyeSlash : faEye} 
              color={theme.textMuted} 
              size={18}
            />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={[styles.submitBtn, isSaving && styles.submitBtnDisabled]} 
          onPress={handleCreateUser}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>CREATE USER</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Registered Users Header */}
      <View style={dynamicStyles.logsHeaderCard}>
        <Text style={styles.logsHeaderText}>REGISTERED USERS</Text>
        <Text style={styles.countBadge}>{users.length}</Text>
      </View>
      
      {/* Users List */}
      <View style={dynamicStyles.logsTableContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading users...</Text>
          </View>
        ) : users.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No users found</Text>
          </View>
        ) : (
          users.map((user) => (
            <View key={user.id} style={dynamicStyles.tableRow}>
              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: theme.textPrimary }]}>{user.full_name}</Text>
                <Text style={[styles.userMeta, { color: theme.textSecondary }]}>
                  {user.email}
                </Text>
              </View>
              
              <View style={[
                styles.roleBadge, 
                { backgroundColor: (roleColors[user.role] || roleColors.user).bg }
              ]}>
                <Text style={[
                  styles.badgeText,
                  { color: (roleColors[user.role] || roleColors.user).text }
                ]}>
                  {user.role === 'super_admin' ? 'Admin' : 'User'}
                </Text>
              </View>
              
              {/* Status Toggle */}
              {user.role !== 'super_admin' && (
                <TouchableOpacity 
                  style={styles.toggleBtn}
                  onPress={() => handleToggleStatus(user)}
                >
                  <FontAwesomeIcon 
                    icon={user.is_active ? faToggleOn : faToggleOff} 
                    color={user.is_active ? '#2E7D32' : '#C62828'} 
                    size={24} 
                  />
                </TouchableOpacity>
              )}
              
              {/* Delete Button */}
              {user.role !== 'super_admin' && (
                <TouchableOpacity 
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(user)}
                >
                  <FontAwesomeIcon icon={faTrash} color="#D32F2F" size={16} />
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </View>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.cardBg }]}>
            <View style={styles.modalHeader}>
              <FontAwesomeIcon icon={faExclamationTriangle} color="#D32F2F" size={24} />
              <Text style={[styles.modalTitle, { color: '#D32F2F' }]}>Confirm Delete</Text>
            </View>
            
            <Text style={[styles.modalMessage, { color: theme.textPrimary }]}>
              Are you sure you want to delete{' '}
              <Text style={styles.modalHighlight}>{userToDelete?.full_name}</Text>?
            </Text>
            <Text style={[styles.modalSubMessage, { color: theme.textSecondary }]}>
              This action cannot be undone.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={cancelDelete}
                disabled={isDeleting}
              >
                <Text style={[styles.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.confirmDeleteBtn, isDeleting && styles.btnDisabled]} 
                onPress={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <>
                    <FontAwesomeIcon icon={faTrash} color="#FFF" size={14} />
                    <Text style={styles.confirmDeleteBtnText}>Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Form
  formTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  formTitle: { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  
  // Password
  passwordContainer: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeButton: { position: 'absolute', right: 15, top: 15 },
  
  // Role Selector
  roleLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 8 },
  roleSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  roleOption: { 
    flex: 1, 
    padding: 12, 
    marginHorizontal: 4, 
    borderRadius: 10, 
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  roleOptionText: { fontSize: 12, marginLeft: 6 },
  
  // Submit Button
  submitBtn: { backgroundColor: '#1E3A5F', padding: 15, borderRadius: 15, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // Table Header
  logsHeaderText: { color: '#FFF', fontWeight: 'bold', marginRight: 8, fontSize: 12 },
  countBadge: { 
    backgroundColor: '#FFF', 
    color: '#1E3A5F', 
    paddingHorizontal: 10, 
    paddingVertical: 2, 
    borderRadius: 10, 
    fontSize: 12, 
    fontWeight: 'bold',
    overflow: 'hidden',
  },
  
  // User Row
  userInfo: { flex: 1 },
  userName: { fontWeight: 'bold', fontSize: 14 },
  userMeta: { fontSize: 11, marginTop: 2 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, marginRight: 8 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  toggleBtn: { padding: 8, marginRight: 4 },
  deleteBtn: { padding: 8 },
  
  // Loading & Empty
  loadingContainer: { alignItems: 'center', padding: 30 },
  loadingText: { marginTop: 10 },
  emptyContainer: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 14 },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  modalMessage: {
    fontSize: 15,
    marginBottom: 5,
  },
  modalHighlight: {
    fontWeight: 'bold',
  },
  modalSubMessage: {
    fontSize: 13,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 10,
  },
  cancelBtnText: {
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    backgroundColor: '#D32F2F',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmDeleteBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 6,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});
