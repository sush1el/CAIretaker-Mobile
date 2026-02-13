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
import { faUserGear, faTrash, faPlus, faExclamationTriangle, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

const riskColors = {
  Low: { bg: '#C8E6C9', text: '#2E7D32' },
  Medium: { bg: '#FFF3E0', text: '#E65100' },
  High: { bg: '#FFCDD2', text: '#D32F2F' },
};

export default function Resident() {
  // State
  const [residents, setResidents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [residentId, setResidentId] = useState('');
  const [riskLevel, setRiskLevel] = useState('Low');
  
  // Available rooms
  const rooms = ['1', '2', '3'];
  
  // Room dropdown state
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [residentToDelete, setResidentToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load residents on mount
  useEffect(() => {
    loadResidents();
  }, []);

  const loadResidents = async () => {
    try {
      const result = await api.getResidents();
      if (result.ok && result.data.success) {
        setResidents(result.data.residents);
      } else {
        console.error('Failed to load residents:', result.data.error);
      }
    } catch (error) {
      console.error('Error loading residents:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadResidents();
  };

  const generateResidentId = () => {
    const prefix = 'R-';
    const number = String(residents.length + 1).padStart(3, '0');
    return `${prefix}${number}`;
  };

  const clearForm = () => {
    setFullName('');
    setAge('');
    setRoomNumber('');
    setResidentId('');
    setRiskLevel('Low');
  };

  const handleSaveProfile = async () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Error', 'Please enter full name');
      return;
    }
    if (!age || isNaN(parseInt(age)) || parseInt(age) < 0) {
      Alert.alert('Error', 'Please enter a valid age');
      return;
    }
    if (!roomNumber) {
      Alert.alert('Error', 'Please select a room');
      return;
    }
    
    const finalResidentId = residentId.trim() || generateResidentId();
    
    setIsSaving(true);
    
    try {
      const result = await api.enrollResident({
        resident_id: finalResidentId,
        full_name: fullName.trim(),
        age: parseInt(age),
        room_number: roomNumber.trim(),
        risk_level: riskLevel,
      });
      
      if (result.ok && result.data.success) {
        Alert.alert('Success', 'Resident enrolled successfully!');
        clearForm();
        loadResidents();
      } else {
        Alert.alert('Error', result.data.error || 'Failed to enroll resident');
      }
    } catch (error) {
      console.error('Error enrolling resident:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (resident) => {
    setResidentToDelete(resident);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!residentToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const result = await api.deleteResident(residentToDelete.resident_id, true);
      
      if (result.ok && result.data.success) {
        Alert.alert('Success', 'Resident deleted successfully');
        setShowDeleteModal(false);
        setResidentToDelete(null);
        loadResidents();
      } else {
        Alert.alert('Error', result.data.error || 'Failed to delete resident');
      }
    } catch (error) {
      console.error('Error deleting resident:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setResidentToDelete(null);
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>RESIDENT PROFILES</Text>
        <FontAwesomeIcon icon={faUserGear} color="#1E3A5F" size={18}/>
      </View>
      
      {/* Enroll Form */}
      <View style={styles.formCard}>
        <View style={styles.formTitleRow}>
          <FontAwesomeIcon icon={faPlus} color="#1E3A5F" size={14}/>
          <Text style={styles.formTitle}>Enroll New Resident</Text>
        </View>
        
        <TextInput 
          style={styles.formInput} 
          placeholder="Full Name" 
          placeholderTextColor="#999"
          value={fullName}
          onChangeText={setFullName}
        />
        
        <View style={styles.rowInputs}>
          <TextInput 
            style={[styles.formInput, styles.halfInput]} 
            placeholder="Age" 
            keyboardType="numeric" 
            placeholderTextColor="#999"
            value={age}
            onChangeText={setAge}
          />
          <View style={styles.halfInput}>
            <TouchableOpacity 
              style={styles.dropdownInput}
              onPress={() => setShowRoomDropdown(!showRoomDropdown)}
            >
              <Text style={[styles.dropdownText, !roomNumber && styles.dropdownPlaceholder]}>
                {roomNumber ? `Room ${roomNumber}` : 'Room no.'}
              </Text>
              <FontAwesomeIcon icon={faChevronDown} color="#666" size={12} />
            </TouchableOpacity>
            
            {/* Room Dropdown Menu */}
            {showRoomDropdown && (
              <>
                {/* Backdrop to close dropdown */}
                <TouchableOpacity 
                  style={styles.dropdownBackdrop} 
                  activeOpacity={1}
                  onPress={() => setShowRoomDropdown(false)} 
                />
                <View style={styles.dropdownMenu}>
                  {/* Default option to clear selection */}
                  <TouchableOpacity
                    style={[
                      styles.dropdownItem,
                      !roomNumber && styles.dropdownItemSelected
                    ]}
                    onPress={() => {
                      setRoomNumber('');
                      setShowRoomDropdown(false);
                    }}
                  >
                    <Text style={[
                      styles.dropdownItemText,
                      styles.dropdownPlaceholder
                    ]}>
                      Room no.
                    </Text>
                  </TouchableOpacity>
                  
                  {rooms.map((room) => (
                    <TouchableOpacity
                      key={room}
                      style={[
                        styles.dropdownItem,
                        roomNumber === room && styles.dropdownItemSelected
                      ]}
                      onPress={() => {
                        setRoomNumber(room);
                        setShowRoomDropdown(false);
                      }}
                    >
                      <Text style={[
                        styles.dropdownItemText,
                        roomNumber === room && styles.dropdownItemTextSelected
                      ]}>
                        Room {room}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
        
        <TextInput 
          style={styles.formInput} 
          placeholder="Resident ID (auto-generated if empty)" 
          placeholderTextColor="#999"
          value={residentId}
          onChangeText={setResidentId}
        />
        
        {/* Risk Level Selector */}
        <Text style={styles.riskLabel}>Fall Risk Level:</Text>
        <View style={styles.riskSelector}>
          {['Low', 'Medium', 'High'].map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.riskOption,
                riskLevel === level && { backgroundColor: riskColors[level].bg }
              ]}
              onPress={() => setRiskLevel(level)}
            >
              <Text style={[
                styles.riskOptionText,
                riskLevel === level && { color: riskColors[level].text, fontWeight: 'bold' }
              ]}>
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity 
          style={[styles.submitBtn, isSaving && styles.submitBtnDisabled]} 
          onPress={handleSaveProfile}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>SAVE PROFILE</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Registered Database Header */}
      <View style={styles.logsHeaderCard}>
        <Text style={styles.logsHeaderText}>REGISTERED DATABASE</Text>
        <Text style={styles.countBadge}>{residents.length}</Text>
      </View>
      
      {/* Residents List - Grouped by Room */}
      <View style={styles.logsTableContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1E3A5F" />
            <Text style={styles.loadingText}>Loading residents...</Text>
          </View>
        ) : residents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No residents registered yet</Text>
            <Text style={styles.emptySubText}>Enroll a resident using the form above</Text>
          </View>
        ) : (
          rooms.map((room) => {
            const roomResidents = residents.filter(r => r.room_number === room);
            if (roomResidents.length === 0) return null;
            
            return (
              <View key={room} style={styles.roomSection}>
                <View style={styles.roomHeader}>
                  <Text style={styles.roomHeaderText}>Room {room}</Text>
                  <Text style={styles.roomCount}>{roomResidents.length}</Text>
                </View>
                
                {roomResidents.map((res, i) => (
                  <View key={res.id || i} style={styles.tableRow}>
                    <View style={styles.residentInfo}>
                      <Text style={styles.residentName}>{res.full_name}</Text>
                      <Text style={styles.residentMeta}>
                        {res.resident_id} • Age {res.age}
                      </Text>
                    </View>
                    
                    <View style={[
                      styles.stabilityBadge, 
                      { backgroundColor: riskColors[res.risk_level || 'Low'].bg }
                    ]}>
                      <Text style={[
                        styles.badgeText,
                        { color: riskColors[res.risk_level || 'Low'].text }
                      ]}>
                        {res.risk_level || 'Low'}
                      </Text>
                    </View>
                    
                    <TouchableOpacity 
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(res)}
                    >
                      <FontAwesomeIcon icon={faTrash} color="#D32F2F" size={16} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })
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
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <FontAwesomeIcon icon={faExclamationTriangle} color="#D32F2F" size={24} />
              <Text style={styles.modalTitle}>Confirm Delete</Text>
            </View>
            
            <Text style={styles.modalMessage}>
              Are you sure you want to delete{' '}
              <Text style={styles.modalHighlight}>{residentToDelete?.full_name}</Text>?
            </Text>
            <Text style={styles.modalSubMessage}>
              This action cannot be undone.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={cancelDelete}
                disabled={isDeleting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
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
  container: { flex: 1 },
  pillHeader: { 
    backgroundColor: '#FFF', 
    padding: 12, 
    borderRadius: 30, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 15 
  },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  
  // Form
  formCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20 },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E3A5F', marginLeft: 8 },
  formInput: { 
    backgroundColor: '#F9F9F9', 
    borderRadius: 10, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: '#EEE', 
    color: '#333',
    fontSize: 15,
  },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between', zIndex: 10 },
  halfInput: { width: '48%', zIndex: 10 },
  
  // Risk Selector
  riskLabel: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 8 },
  riskSelector: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  riskOption: { 
    flex: 1, 
    padding: 10, 
    marginHorizontal: 4, 
    borderRadius: 8, 
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  riskOptionText: { fontSize: 12, color: '#666' },
  
  // Room Dropdown
  dropdownInput: {
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEE',
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    color: '#333',
    fontSize: 15,
  },
  dropdownPlaceholder: {
    color: '#999',
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: -200,
    bottom: -500,
    left: -200,
    right: -200,
    zIndex: 99,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EEE',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 100,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  dropdownItemText: {
    color: '#333',
    fontSize: 15,
  },
  dropdownItemTextSelected: {
    color: '#1565C0',
    fontWeight: 'bold',
  },
  
  // Submit Button
  submitBtn: { backgroundColor: '#1E3A5F', padding: 15, borderRadius: 15, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  
  // Table Header
  logsHeaderCard: { 
    backgroundColor: '#1E3A5F', 
    padding: 12, 
    borderTopLeftRadius: 15, 
    borderTopRightRadius: 15, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
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
  
  // Table
  logsTableContainer: { 
    backgroundColor: '#FFF', 
    borderBottomLeftRadius: 15, 
    borderBottomRightRadius: 15, 
    padding: 15,
    minHeight: 100,
  },
  
  // Room Sections
  roomSection: {
    marginBottom: 15,
  },
  roomHeader: {
    backgroundColor: '#E3F2FD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomHeaderText: {
    color: '#1565C0',
    fontWeight: 'bold',
    fontSize: 13,
    flex: 1,
  },
  roomCount: {
    backgroundColor: '#1565C0',
    color: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 'bold',
    overflow: 'hidden',
  },
  
  tableRow: { 
    flexDirection: 'row', 
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F0F0F0', 
    alignItems: 'center' 
  },
  residentInfo: { flex: 1 },
  residentName: { fontWeight: 'bold', color: '#1E3A5F', fontSize: 14 },
  residentMeta: { fontSize: 11, color: '#666', marginTop: 2 },
  stabilityBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, marginRight: 10 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  deleteBtn: { padding: 8 },
  
  // Loading & Empty
  loadingContainer: { alignItems: 'center', padding: 30 },
  loadingText: { marginTop: 10, color: '#666' },
  emptyContainer: { alignItems: 'center', padding: 30 },
  emptyText: { color: '#666', fontSize: 14 },
  emptySubText: { color: '#999', fontSize: 12, marginTop: 4 },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFF',
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
    color: '#D32F2F',
    marginLeft: 10,
  },
  modalMessage: {
    fontSize: 15,
    color: '#333',
    marginBottom: 5,
  },
  modalHighlight: {
    fontWeight: 'bold',
    color: '#1E3A5F',
  },
  modalSubMessage: {
    fontSize: 13,
    color: '#666',
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
    color: '#666',
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