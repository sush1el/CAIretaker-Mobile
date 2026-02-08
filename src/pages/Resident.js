import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faUserGear } from '@fortawesome/free-solid-svg-icons';

export default function Resident({ residents }) {
  return (
    <View>
      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>RESIDENT PROFILES</Text>
        <FontAwesomeIcon icon={faUserGear} color="#1E3A5F" size={18}/>
      </View>
      
      <View style={styles.formCard}>
          <Text style={styles.formTitle}>Enroll New Resident</Text>
          <TextInput style={styles.formInput} placeholder="Full Name" placeholderTextColor="#999" />
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <TextInput style={[styles.formInput, {width: '48%'}]} placeholder="Age" keyboardType="numeric" placeholderTextColor="#999" />
              <TextInput style={[styles.formInput, {width: '48%'}]} placeholder="Room No." keyboardType="numeric" placeholderTextColor="#999" />
          </View>
          <TextInput style={styles.formInput} placeholder="Resident ID" placeholderTextColor="#999" />
          <TouchableOpacity style={styles.submitBtn}>
            <Text style={styles.submitBtnText}>SAVE PROFILE</Text>
          </TouchableOpacity>
      </View>

      <View style={styles.logsHeaderCard}>
        <Text style={styles.logsHeaderText}>REGISTERED DATABASE</Text>
      </View>
      <View style={styles.logsTableContainer}>
          {residents.map((res, i) => (
          <View key={i} style={styles.tableRow}>
              <View style={{flex: 2}}>
                <Text style={{fontWeight: 'bold', color: '#1E3A5F'}}>{res.name}</Text>
                <Text style={{fontSize: 10, color: '#666'}}>{res.id} • Room {res.room}</Text>
              </View>
              <View style={[styles.stabilityBadge, {backgroundColor: res.risk === 'High' ? '#FFCDD2' : '#C8E6C9'}]}>
                <Text style={{fontSize: 10, color: res.risk === 'High' ? '#D32F2F' : '#2E7D32', fontWeight: 'bold'}}>{res.risk} Risk</Text>
              </View>
          </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  formCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 20 },
  formTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E3A5F', marginBottom: 15 },
  formInput: { backgroundColor: '#F9F9F9', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#EEE', color: '#333' },
  submitBtn: { backgroundColor: '#1E3A5F', padding: 15, borderRadius: 15, alignItems: 'center' },
  submitBtnText: { color: '#FFF', fontWeight: 'bold' },
  logsHeaderCard: { backgroundColor: '#1E3A5F', padding: 10, borderTopLeftRadius: 15, borderTopRightRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  logsHeaderText: { color: '#FFF', fontWeight: 'bold', marginRight: 8, fontSize: 12 },
  logsTableContainer: { backgroundColor: '#FFF', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, padding: 15 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
  stabilityBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
});