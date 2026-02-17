import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faCirclePlay, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';

export default function Cameras({ setScreen, setMonitoringRoom }) {
  const { theme, isDarkMode } = useTheme();
  
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    cameraCard: { height: 130, backgroundColor: isDarkMode ? '#1a2a3a' : '#0D1B2E', borderRadius: 20, marginBottom: 15, padding: 15 },
    circleArrow: { backgroundColor: theme.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>ACTIVE CAMERAS</Text>
        <FontAwesomeIcon icon={faCamera} color={theme.text} size={16} />
      </View>
      {[1, 2, 3, 4].map(r => (
        <View key={r} style={dynamicStyles.cameraCard}>
          <Text style={styles.cameraCardTitle}>ROOM #{r}</Text>
          <TouchableOpacity style={styles.playBtn} onPress={() => { setMonitoringRoom(r); setScreen('LiveView'); }}>
            <FontAwesomeIcon icon={faCirclePlay} color="rgba(255,255,255,0.4)" size={60} />
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.paginationRow}>
        <TouchableOpacity style={dynamicStyles.circleArrow}><FontAwesomeIcon icon={faChevronLeft} color="#FFF" /></TouchableOpacity>
        <TouchableOpacity style={dynamicStyles.circleArrow}><FontAwesomeIcon icon={faChevronRight} color="#FFF" /></TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraCardTitle: { color: '#FFF', fontWeight: 'bold' },
  playBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
});