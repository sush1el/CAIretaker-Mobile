import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import LogTable from '../components/LogTable';

export default function LiveView({ monitoringRoom, setMonitoringRoom, logs, requestDeleteLog, setLogs }) {
  return (
    <View>
      <View style={styles.liveMetaRow}>
        <View style={styles.liveBadge}><View style={styles.innerRedDot}/><Text style={styles.liveBadgeText}>LIVE</Text></View>
        <View style={styles.metaBadge}><Text style={styles.metaText}>ID: 112233</Text></View>
        <View style={styles.metaBadge}><Text style={styles.metaText}>FPS: 30</Text></View>
      </View>
      <View style={styles.videoPlaceholder}><FontAwesomeIcon icon={faCamera} color="#333" size={40}/></View>
      <View style={styles.pillHeader}><Text style={styles.pillHeaderText}>LIVE MONITORING</Text><FontAwesomeIcon icon={faCamera} color="#1E3A5F" size={16}/></View>
      <LogTable 
        data={logs.filter(l => l.location === `ROOM ${monitoringRoom}`)} 
        title={`ROOM ${monitoringRoom} ACTIVITY`} 
        onDeletePress={requestDeleteLog}
        setLogs={setLogs}
      />
      <View style={styles.paginationRow}>
        <TouchableOpacity style={styles.circleArrow} onPress={() => setMonitoringRoom(monitoringRoom <= 1 ? 3 : monitoringRoom - 1)}>
            <FontAwesomeIcon icon={faChevronLeft} color="#FFF"/>
        </TouchableOpacity>
        <TouchableOpacity style={styles.circleArrow} onPress={() => setMonitoringRoom(monitoringRoom >= 3 ? 1 : monitoringRoom + 1)}>
            <FontAwesomeIcon icon={faChevronRight} color="#FFF"/>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  videoPlaceholder: { width: '100%', height: 200, backgroundColor: '#000', borderRadius: 20, marginBottom: 15, justifyContent: 'center', alignItems: 'center' },
  liveMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  liveBadge: { backgroundColor: '#D32F2F', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  innerRedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF', marginRight: 6 },
  liveBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  metaBadge: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
  metaText: { color: '#1E3A5F', fontWeight: 'bold', fontSize: 10 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  circleArrow: { backgroundColor: '#1E3A5F', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
});