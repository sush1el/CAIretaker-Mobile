import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faBrain, faMicrochip, faRotateRight, faPowerOff, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function Settings({ highSensitivity, setHighSensitivity, privacyMask, setPrivacyMask }) {
  const [isRebooting, setIsRebooting] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const { theme } = useTheme();
  const [piStatus, setPiStatus] = useState('Checking...');
  const [systemStats, setSystemStats] = useState(null);

  // Poll Pi health status every 3 seconds
  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const result = await api.healthCheck();
        if (mounted) {
          if (result.ok) {
            setPiStatus('Active');
            setIsRebooting(false);
            setIsShuttingDown(false);

            const statsResult = await api.getSystemStats();
            if (statsResult.ok && statsResult.data && statsResult.data.success) {
              setSystemStats(statsResult.data.stats);
            }
          } else {
            setPiStatus(isRebooting ? 'Rebooting...' : isShuttingDown ? 'Shut Down' : 'Offline');
            setSystemStats(null);
          }
        }
      } catch (e) {
        if (mounted) setPiStatus(isRebooting ? 'Rebooting...' : isShuttingDown ? 'Shut Down' : 'Offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [isRebooting, isShuttingDown]);

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
                setPiStatus('Rebooting...');
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
                setPiStatus('Shut Down');
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

  const handleRestartServices = () => {
    Alert.alert(
      'Restart Services',
      'This will restart the backend services to apply code changes. The system will be briefly unavailable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: async () => {
            setIsRestarting(true);
            try {
              const result = await api.restartServices();
              if (result.ok) {
                setPiStatus('Restarting...');
                Alert.alert('Restarting', 'Services are restarting. They will be available again in a few seconds.');
              } else {
                Alert.alert('Error', result.data?.error || 'Failed to restart services.');
              }
            } catch (error) {
              Alert.alert('Error', 'Could not connect to the server.');
            } finally {
              setIsRestarting(false);
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
        <FontAwesomeIcon icon={faGear} color={theme.text} size={18} />
      </View>
      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faMicrochip} color="#1E3A5F" size={14} />
          <Text style={styles.settingsGroupTitle}>Hardware (Pi 5)</Text>
        </View>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsLabel}>System Health</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: piStatus === 'Active' ? '#7CB342' : piStatus === 'Rebooting...' ? '#FF9800' : '#D32F2F', marginRight: 8 }} />
              <Text style={{ color: piStatus === 'Active' ? '#7CB342' : piStatus === 'Rebooting...' ? '#FF9800' : '#D32F2F', fontWeight: 'bold' }}>{piStatus}</Text>
            </View>
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
            style={styles.settingsRow}
            onPress={handleRestartServices}
            disabled={isRestarting}
          >
            <Text style={styles.settingsLabel}>Restart Services</Text>
            {isRestarting ? (
              <ActivityIndicator size="small" color="#FF9800" />
            ) : (
              <FontAwesomeIcon icon={faArrowsRotate} color="#FF9800" size={14} />
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

        {systemStats && (
          <View style={[styles.settingsCard, { marginTop: 15, paddingVertical: 10, paddingHorizontal: 20 }]}>
            <View style={[styles.settingsRow, { marginBottom: 10 }]}>
              <Text style={styles.settingsLabel}>CPU Usage</Text>
              <Text style={{ fontWeight: '600', color: '#1E3A5F' }}>{systemStats.cpu_usage}%</Text>
            </View>
            <View style={[styles.settingsRow, { marginBottom: 10 }]}>
              <Text style={styles.settingsLabel}>Memory Usage</Text>
              <Text style={{ fontWeight: '600', color: '#1E3A5F' }}>{systemStats.memory_percent}%</Text>
            </View>
            <View style={[styles.settingsRow, { marginBottom: 10 }]}>
              <Text style={styles.settingsLabel}>CPU Temp</Text>
              <Text style={{ fontWeight: '600', color: '#1E3A5F' }}>{systemStats.temperature}{systemStats.temperature !== 'N/A' ? '°C' : ''}</Text>
            </View>
            <View style={[styles.settingsRow, { marginBottom: 0, borderBottomWidth: 0 }]}>
              <Text style={styles.settingsLabel}>Input Voltage</Text>
              <Text style={{ fontWeight: '600', color: '#1E3A5F' }}>{systemStats.voltage}</Text>
            </View>
          </View>
        )}
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