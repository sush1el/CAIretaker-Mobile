import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Card from '../components/Card';

const Monitoring = () => {
  // Dummy data to mimic backend response
  const cameras = [
    { id: 1, name: 'Camera 1', location: 'UAC - Exhibit', status: 'Online' },
    { id: 2, name: 'Camera 2', location: 'Entrance', status: 'Offline' },
  ];

  return (
    <ScrollView style={styles.container}>
      <Card title="Multi-Camera Monitoring">
        <Text style={styles.subtitle}>Tap a feed to view full screen</Text>
        
        {cameras.map((cam) => (
          <View key={cam.id} style={styles.cameraRow}>
            <View style={styles.feedPlaceholder}>
               <Text style={styles.placeholderText}>Feed {cam.id}</Text>
            </View>
            <View style={styles.infoColumn}>
              <Text style={styles.camName}>{cam.name}</Text>
              <Text style={styles.camLoc}>{cam.location}</Text>
              <Text style={[styles.status, { color: cam.status === 'Online' ? 'green' : 'red' }]}>
                ● {cam.status}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  subtitle: { marginBottom: 15, color: '#888', fontStyle: 'italic' },
  cameraRow: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  feedPlaceholder: {
    width: 100,
    height: 80,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: { color: '#666', fontSize: 10 },
  infoColumn: { padding: 10, justifyContent: 'center' },
  camName: { fontWeight: 'bold', fontSize: 16 },
  camLoc: { color: '#666', fontSize: 12 },
  status: { fontSize: 12, marginTop: 4 },
});

export default Monitoring;