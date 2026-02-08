import React from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faBrain, faMicrochip, faRotateRight } from '@fortawesome/free-solid-svg-icons';

export default function Settings({ highSensitivity, setHighSensitivity, privacyMask, setPrivacyMask }) {
  return (
    <View>
      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>SETTINGS</Text>
        <FontAwesomeIcon icon={faGear} color="#1E3A5F" size={18}/>
      </View>
      
      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
            <FontAwesomeIcon icon={faBrain} color="#1E3A5F" size={14}/>
            <Text style={styles.settingsGroupTitle}>AI Engine</Text>
        </View>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>High Sensitivity</Text>
            <Switch value={highSensitivity} onValueChange={setHighSensitivity} trackColor={{true: '#A8D5E2'}} thumbColor="#1E3A5F" />
          </View>
          <View style={[styles.settingsRow, {borderBottomWidth: 0}]}>
            <Text style={styles.settingsLabel}>Privacy Masking</Text>
            <Switch value={privacyMask} onValueChange={setPrivacyMask} trackColor={{true: '#A8D5E2'}} thumbColor="#1E3A5F" />
          </View>
        </View>
      </View>

      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
            <FontAwesomeIcon icon={faMicrochip} color="#1E3A5F" size={14}/>
            <Text style={styles.settingsGroupTitle}>Hardware (Pi 5)</Text>
        </View>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>System Health</Text>
            <Text style={{color: '#7CB342', fontWeight: 'bold'}}>Optimal</Text>
          </View>
          <TouchableOpacity style={[styles.settingsRow, {borderBottomWidth: 0}]}>
            <Text style={styles.settingsLabel}>Reboot Hub</Text>
            <FontAwesomeIcon icon={faRotateRight} color="#1E3A5F" size={14}/>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  settingsGroup: { marginBottom: 20 },
  settingsGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 10 },
  settingsGroupTitle: { fontWeight: 'bold', color: '#1E3A5F', marginLeft: 8, fontSize: 12 },
  settingsCard: { backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 20 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  settingsLabel: { color: '#1E3A5F', fontWeight: 'bold' },
});