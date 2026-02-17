import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faMicrochip, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';

export default function Settings() {
  const { theme } = useTheme();
  
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    settingsGroupTitle: { fontWeight: 'bold', color: theme.text, marginLeft: 8, fontSize: 12 },
    settingsCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 20 },
    settingsLabel: { color: theme.text, fontWeight: 'bold' },
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>SETTINGS</Text>
        <FontAwesomeIcon icon={faGear} color={theme.text} size={18}/>
      </View>

      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
            <FontAwesomeIcon icon={faMicrochip} color={theme.text} size={14}/>
            <Text style={dynamicStyles.settingsGroupTitle}>Hardware (Pi 5)</Text>
        </View>
        <View style={dynamicStyles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={dynamicStyles.settingsLabel}>System Health</Text>
            <Text style={{color: '#7CB342', fontWeight: 'bold'}}>Optimal</Text>
          </View>
          <TouchableOpacity style={[styles.settingsRow, {borderBottomWidth: 0}]}>
            <Text style={dynamicStyles.settingsLabel}>Reboot Hub</Text>
            <FontAwesomeIcon icon={faRotateRight} color={theme.text} size={14}/>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsGroup: { marginBottom: 20 },
  settingsGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 10 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
});