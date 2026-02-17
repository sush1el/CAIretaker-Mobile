import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faBrain, faMicrochip, faRotateRight, faPowerOff } from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faMicrochip, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';

export default function Settings({ highSensitivity, setHighSensitivity, privacyMask, setPrivacyMask }) {
  const [isRebooting, setIsRebooting] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { theme } = useTheme();
  
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    settingsGroupTitle: { fontWeight: 'bold', color: theme.text, marginLeft: 8, fontSize: 12 },
    settingsCard: { backgroundColor: theme.card, borderRadius: 20, paddingHorizontal: 20 },
    settingsLabel: { color: theme.text, fontWeight: 'bold' },
  };

  const handleReboot = () => {
    Alert.alert(
      'Reboot Hub',
      'Are you sure you want to reboot the Raspberry Pi? The system will be temporarily unavailable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reboot',
          style: 'destructive',
          onPress: async () => {
            setIsRebooting(true);
            try {
              const result = await api.rebootSystem();
              if (result.ok) {
                Alert.alert('Rebooting', 'The system is rebooting. It will be available again in about 1-2 minutes.');
              } else {
                Alert.alert('Error', result.data?.error || 'Failed to reboot the system.');
              }
            } catch (error) {
              Alert.alert('Error', 'Could not connect to the server.');
            } finally {
              setIsRebooting(false);
            }
          },
        },
      ]
    );
  };

  const handleShutdown = () => {
    Alert.alert(
      'Shutdown Hub',
      'Are you sure you want to shut down the Raspberry Pi? You will need to physically turn it back on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Shut Down',
          style: 'destructive',
          onPress: async () => {
            setIsShuttingDown(true);
            try {
              const result = await api.shutdownSystem();
              if (result.ok) {
                Alert.alert('Shutting Down', 'The system is shutting down. You will need to physically power it back on.');
              } else {
                Alert.alert('Error', result.data?.error || 'Failed to shut down the system.');
              }
            } catch (error) {
              Alert.alert('Error', 'Could not connect to the server.');
            } finally {
              setIsShuttingDown(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>SETTINGS</Text>
        <FontAwesomeIcon icon={faGear} color={theme.text} size={18}/>
      </View>

      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faBrain} color="#1E3A5F" size={14} />
          <Text style={styles.settingsGroupTitle}>AI Engine</Text>
        </View>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>High Sensitivity</Text>
            <Switch value={highSensitivity} onValueChange={setHighSensitivity} trackColor={{ true: '#A8D5E2' }} thumbColor="#1E3A5F" />
          </View>
          <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingsLabel}>Privacy Masking</Text>
            <Switch value={privacyMask} onValueChange={setPrivacyMask} trackColor={{ true: '#A8D5E2' }} thumbColor="#1E3A5F" />
          </View>
        </View>
      </View>

      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faMicrochip} color="#1E3A5F" size={14} />
          <Text style={styles.settingsGroupTitle}>Hardware (Pi 5)</Text>
        </View>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>System Health</Text>
            <Text style={{ color: '#7CB342', fontWeight: 'bold' }}>Optimal</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={handleReboot}
            disabled={isRebooting}
          >
            <Text style={styles.settingsLabel}>Reboot Hub</Text>
            {isRebooting ? (
              <ActivityIndicator size="small" color="#1E3A5F" />
            ) : (
              <FontAwesomeIcon icon={faRotateRight} color="#1E3A5F" size={14} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.settingsRow, { borderBottomWidth: 0 }]}
            onPress={handleShutdown}
            disabled={isShuttingDown}
          >
            <Text style={[styles.settingsLabel, { color: '#D32F2F' }]}>Shutdown Hub</Text>
            {isShuttingDown ? (
              <ActivityIndicator size="small" color="#D32F2F" />
            ) : (
              <FontAwesomeIcon icon={faPowerOff} color="#D32F2F" size={14} />
            )}
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
  settingsGroup: { marginBottom: 20 },
  settingsGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginLeft: 10 },
  settingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
});