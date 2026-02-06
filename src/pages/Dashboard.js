import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Card from '../components/Card';

const Dashboard = () => {
  return (
    <ScrollView style={styles.container}>
      {/* Status Badge */}
      <View style={styles.statusBadge}>
        <View style={styles.greenDot} />
        <Text style={styles.statusText}>System Online</Text>
      </View>

      {/* Video Feed Placeholder */}
      <Card title="Live Feed (Camera 1)">
        <View style={styles.videoPlaceholder}>
          <Text style={{color: '#aaa'}}>Video Feed Component</Text>
          <Text style={{color: '#aaa', fontSize: 10}}>(Backend Integration Required)</Text>
        </View>
      </Card>

      {/* Live Alerts Section */}
      <Card title="Live Fall Alerts">
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>No Active Fall Alerts</Text>
          <Text style={styles.alertSubText}>System is monitoring...</Text>
        </View>
      </Card>

      {/* Status Grid - Adapted from your 'Status Cards' */}
      <View style={styles.gridContainer}>
        <View style={[styles.gridItem, { backgroundColor: '#e6f7ff' }]}>
          <Text style={styles.gridLabel}>Cameras</Text>
          <Text style={styles.gridValue}>1</Text>
        </View>
        <View style={[styles.gridItem, { backgroundColor: '#f6ffed' }]}>
          <Text style={styles.gridLabel}>Connection</Text>
          <Text style={styles.gridValue}>Healthy</Text>
        </View>
        <View style={[styles.gridItem, { backgroundColor: '#fff7e6' }]}>
          <Text style={styles.gridLabel}>People</Text>
          <Text style={styles.gridValue}>0</Text>
        </View>
        <View style={[styles.gridItem, { backgroundColor: '#fff0f6' }]}>
          <Text style={styles.gridLabel}>FPS</Text>
          <Text style={styles.gridValue}>--</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#fff',
  },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#52c41a', marginRight: 6 },
  statusText: { color: '#666' },
  videoPlaceholder: {
    height: 200,
    backgroundColor: '#eee',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBox: {
    padding: 15,
    backgroundColor: '#f6ffed',
    borderWidth: 1,
    borderColor: '#b7eb8f',
    borderRadius: 4,
  },
  alertText: { color: '#389e0d', fontWeight: 'bold' },
  alertSubText: { color: '#389e0d', fontSize: 12 },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  gridItem: {
    width: '45%',
    margin: '2.5%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    elevation: 1,
  },
  gridLabel: { fontSize: 12, color: '#666' },
  gridValue: { fontSize: 24, fontWeight: 'bold', color: '#333' },
});

export default Dashboard;