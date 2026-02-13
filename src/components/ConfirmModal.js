import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';

const ConfirmModal = ({ isOpen, title, onCancel, onConfirm }) => (
  <Modal visible={isOpen} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.confirmBox}>
        <Text style={styles.confirmTitle}>{title}</Text>
        <View style={styles.confirmButtons}>
          <TouchableOpacity style={styles.noButton} onPress={onCancel}><Text style={styles.noText}>NO</Text></TouchableOpacity>
          <TouchableOpacity style={styles.yesButton} onPress={onConfirm}><Text style={styles.yesText}>YES</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  confirmBox: { backgroundColor: '#FFF', padding: 25, borderRadius: 20, width: '85%' },
  confirmTitle: { textAlign: 'center', fontWeight: 'bold', color: '#1E3A5F', marginBottom: 25 },
  confirmButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  noButton: { flex: 1, backgroundColor: '#EEE', padding: 12, borderRadius: 20, marginRight: 8, alignItems: 'center' },
  yesButton: { flex: 1, backgroundColor: '#1E3A5F', padding: 12, borderRadius: 20, marginLeft: 8, alignItems: 'center' },
  noText: { color: '#1E3A5F', fontWeight: 'bold' },
  yesText: { color: '#FFF', fontWeight: 'bold' }
});

export default ConfirmModal;