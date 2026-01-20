import React from 'react';
import { View, Text, FlatList, StyleSheet, TextInput } from 'react-native';

const Logs = () => {
  // Static placeholder data
  const logs = [
    { id: '101', date: '2026-01-20', time: '14:30', location: 'Living Room' },
    { id: '102', date: '2026-01-19', time: '09:15', location: 'Kitchen' },
    { id: '103', date: '2026-01-18', time: '18:45', location: 'Hallway' },
  ];

  const renderItem = ({ item }) => (
    <View style={styles.logItem}>
      <View style={styles.logHeader}>
        <Text style={styles.logId}>#{item.id}</Text>
        <Text style={styles.logDate}>{item.date} {item.time}</Text>
      </View>
      <Text style={styles.location}>📍 {item.location}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Bar Placeholder */}
      <View style={styles.searchContainer}>
        <TextInput 
          placeholder="Search logs..." 
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={logs}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { padding: 16, backgroundColor: 'white' },
  searchInput: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  listContent: { padding: 16 },
  logItem: {
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 1,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  logId: { fontWeight: 'bold', color: '#1890ff' },
  logDate: { color: '#999', fontSize: 12 },
  location: { color: '#333' },
});

export default Logs;