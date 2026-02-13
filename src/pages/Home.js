import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import LogTable from '../components/LogTable';

export default function Home({ logs, setScreen, setMonitoringRoom, requestDeleteLog, setLogs }) {
  return (
    <View>
      <View style={styles.pillHeader}><Text style={styles.pillHeaderText}>SELECT CAMERA</Text><FontAwesomeIcon icon={faCamera} color="#1E3A5F" size={16}/></View>
      <View style={styles.roomGrid}>
        {[1, 2, 3].map(r => (
          <TouchableOpacity key={r} style={styles.roomBtn} onPress={() => { setMonitoringRoom(r); setScreen('LiveView'); }}>
            <Text style={styles.roomBtnLabel}>ROOM</Text>
            <Text style={styles.roomBtnNum}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.pillHeader}><Text style={styles.pillHeaderText}>LIVE FALL ALERTS</Text><FontAwesomeIcon icon={faTriangleExclamation} color="#1E3A5F" size={16}/></View>
      <View style={styles.statusCard}><View style={styles.greenDot}/><Text style={styles.statusCardText}>No Active Falls</Text></View>
      <LogTable data={logs} title="RECENT LOGS" onDeletePress={requestDeleteLog} setLogs={setLogs} />
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  roomGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1E3A5F', padding: 12, borderRadius: 20, marginBottom: 20 },
  roomBtn: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, flex: 1, marginHorizontal: 5, alignItems: 'center' },
  roomBtnLabel: { fontSize: 10, color: '#1E3A5F', fontWeight: 'bold' },
  roomBtnNum: { fontSize: 24, fontWeight: '900', color: '#1E3A5F' },
  statusCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  greenDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#7CB342', marginRight: 10 },
  statusCardText: { fontSize: 18, fontWeight: '700', color: '#7CB342' },
});