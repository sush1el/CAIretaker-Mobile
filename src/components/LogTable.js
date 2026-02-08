import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChartBar, faMagnifyingGlass, faTrash, faRotateRight, faXmark } from '@fortawesome/free-solid-svg-icons';

const LogTable = ({ data, title, onDeletePress, onClear, setLogs }) => {
  const [searchText, setSearchText] = useState('');

  const filtered = data.filter(l => 
      l.residentId.toLowerCase().includes(searchText.toLowerCase()) || 
      l.location.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.logsSection}>
      <View style={styles.logsHeaderCard}>
        <Text style={styles.logsHeaderText}>{title}</Text>
        <FontAwesomeIcon icon={faChartBar} color="#FFF" size={14}/>
      </View>
      <View style={styles.logsTableContainer}>
        <View style={styles.searchBar}>
          <FontAwesomeIcon icon={faMagnifyingGlass} color="#999" size={14} style={{marginRight: 8}}/>
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search ID or Room..." 
            value={searchText} 
            onChangeText={setSearchText}
          />
        </View>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, {flex: 2}]}>Resident ID</Text>
          <Text style={[styles.tableHeaderText, {flex: 1, textAlign: 'center'}]}>Time</Text>
          <Text style={[styles.tableHeaderText, {flex: 1, textAlign: 'center'}]}>Action</Text>
        </View>
        <ScrollView style={{maxHeight: 200}} nestedScrollEnabled>
          {filtered.map((log) => (
              <View key={log.id} style={styles.tableRow}>
                  <Text style={[styles.tableText, {flex: 2}]}>{log.residentId}</Text>
                  <Text style={[styles.tableText, {flex: 1, textAlign: 'center'}]}>{log.time}</Text>
                  <TouchableOpacity style={{flex: 1, alignItems: 'center'}} onPress={() => onDeletePress(log.id)}>
                      <FontAwesomeIcon icon={faTrash} color="#D32F2F" size={14} />
                  </TouchableOpacity>
              </View>
          ))}
        </ScrollView>
        <View style={styles.actionButtonsRow}>
           <TouchableOpacity style={styles.miniBtn} onPress={() => setSearchText('')}>
              <Text style={styles.miniBtnText}>REFRESH </Text>
              <FontAwesomeIcon icon={faRotateRight} color="#FFF" size={10}/>
           </TouchableOpacity>
           <TouchableOpacity style={styles.miniBtn} onPress={() => setLogs([])}>
              <Text style={styles.miniBtnText}>CLEAR </Text>
              <FontAwesomeIcon icon={faXmark} color="#FFF" size={10}/>
           </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  logsHeaderCard: { backgroundColor: '#1E3A5F', padding: 10, borderTopLeftRadius: 15, borderTopRightRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  logsHeaderText: { color: '#FFF', fontWeight: 'bold', marginRight: 8, fontSize: 12 },
  logsTableContainer: { backgroundColor: '#FFF', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, padding: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 8, borderRadius: 10, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 12, color: '#333' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1E3A5F', padding: 8, borderRadius: 5, marginBottom: 5 },
  tableHeaderText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
  tableText: { fontSize: 12, color: '#1E3A5F' },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15 },
  miniBtn: { backgroundColor: '#1E3A5F', paddingVertical: 6, paddingHorizontal: 15, borderRadius: 8, marginHorizontal: 5, flexDirection: 'row', alignItems: 'center' },
  miniBtnText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
});

export default LogTable;