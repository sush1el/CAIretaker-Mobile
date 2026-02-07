import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faCirclePlay, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

export default function Cameras({ setScreen, setMonitoringRoom }) {
  return (
    <View>
      <View style={styles.pillHeader}><Text style={styles.pillHeaderText}>ACTIVE CAMERAS</Text><FontAwesomeIcon icon={faCamera} color="#1E3A5F" size={16}/></View>
      {[1, 2, 3, 4].map(r => (
        <View key={r} style={styles.cameraCard}>
          <Text style={styles.cameraCardTitle}>ROOM #{r}</Text>
          <TouchableOpacity style={styles.playBtn} onPress={() => { setMonitoringRoom(r); setScreen('LiveView'); }}>
            <FontAwesomeIcon icon={faCirclePlay} color="rgba(255,255,255,0.4)" size={60}/>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.paginationRow}>
        <TouchableOpacity style={styles.circleArrow}><FontAwesomeIcon icon={faChevronLeft} color="#FFF"/></TouchableOpacity>
        <TouchableOpacity style={styles.circleArrow}><FontAwesomeIcon icon={faChevronRight} color="#FFF"/></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  cameraCard: { height: 130, backgroundColor: '#0D1B2E', borderRadius: 20, marginBottom: 15, padding: 15 },
  cameraCardTitle: { color: '#FFF', fontWeight: 'bold' },
  playBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  circleArrow: { backgroundColor: '#1E3A5F', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
});