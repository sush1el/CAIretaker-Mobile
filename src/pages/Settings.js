import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faGear, faBrain, faMicrochip, faRotateRight, faPowerOff, faArrowsRotate, faFlask, faPlay, faStop, faFileExport, faBell, faVolumeHigh } from '@fortawesome/free-solid-svg-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function Settings({ highSensitivity, setHighSensitivity, privacyMask, setPrivacyMask }) {
  const [isRebooting, setIsRebooting] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const { theme, isDarkMode } = useTheme();
  const [piStatus, setPiStatus] = useState('Checking...');
  const [systemStats, setSystemStats] = useState(null);

  // ---- Data Gathering state ----
  const [dgActive, setDgActive] = useState(false);
  const [dgLoading, setDgLoading] = useState(false);   // button spinner
  const [dgExporting, setDgExporting] = useState(false);
  const [dgUptime, setDgUptime] = useState(0);          // seconds — ticked locally
  const [dgStatus, setDgStatus] = useState(null);       // last polled status object
  const dgUptimeRef = useRef(null);                     // interval for local timer

  // ---- Audio Settings state ----
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedSound, setSelectedSound] = useState('sound1');
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewSoundRef = useRef(null);

  // Load Audio Settings
  useEffect(() => {
    const loadAudioSettings = async () => {
      try {
        const enabledStr = await AsyncStorage.getItem('soundEnabled');
        if (enabledStr !== null) setSoundEnabled(enabledStr === 'true');

        const soundStr = await AsyncStorage.getItem('selectedSound');
        if (soundStr !== null) setSelectedSound(soundStr);
      } catch (e) {
        console.log("Failed to load audio settings", e);
      }
    };
    loadAudioSettings();

    return () => {
      if (previewSoundRef.current) {
        previewSoundRef.current.unloadAsync();
      }
    };
  }, []);

  const toggleSound = async (value) => {
    setSoundEnabled(value);
    await AsyncStorage.setItem('soundEnabled', value.toString());
  };

  const changeSound = async (value) => {
    setSelectedSound(value);
    await AsyncStorage.setItem('selectedSound', value);
  };

  const playPreview = async () => {
    try {
      if (isPlayingPreview) return;
      setIsPlayingPreview(true);

      if (previewSoundRef.current) {
        await previewSoundRef.current.unloadAsync();
      }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

      const soundFiles = {
        sound1: require('../../assets/sounds/sound1.wav'),
      };

      const { sound } = await Audio.Sound.createAsync(soundFiles[selectedSound] || soundFiles.sound1);
      previewSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlayingPreview(false);
        }
      });

      await sound.playAsync();
    } catch (e) {
      console.log("Failed to play preview", e);
      setIsPlayingPreview(false);
    }
  };

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

  // Poll data gathering status every 5 seconds
  useEffect(() => {
    let mounted = true;
    const pollDG = async () => {
      try {
        const result = await api.getDataGatheringStatus();
        if (mounted && result.ok && result.data?.success) {
          const s = result.data;
          setDgActive(s.active);
          setDgStatus(s);
          // Seed the local timer with server uptime (keeps it accurate on remount)
          if (s.active) {
            setDgUptime(Math.round(s.uptime_seconds));
          }
        }
      } catch (_) { }
    };
    pollDG();
    const interval = setInterval(pollDG, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Local uptime ticker — ticks every second while session is active
  useEffect(() => {
    if (dgActive) {
      dgUptimeRef.current = setInterval(() => {
        setDgUptime(prev => prev + 1);
      }, 1000);
    } else {
      if (dgUptimeRef.current) {
        clearInterval(dgUptimeRef.current);
        dgUptimeRef.current = null;
      }
    }
    return () => {
      if (dgUptimeRef.current) clearInterval(dgUptimeRef.current);
    };
  }, [dgActive]);

  const dynamicStyles = {
    pillHeader: {
      backgroundColor: theme.card,
      padding: 14,
      borderRadius: 30,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 18,
      elevation: 2,
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 16, letterSpacing: 1 },
    settingsGroupTitle: { fontWeight: '700', color: theme.text, marginLeft: 8, fontSize: 13 },
    settingsCard: {
      backgroundColor: theme.card,
      borderRadius: 16,
      paddingHorizontal: 18,
      paddingVertical: 4,
      borderWidth: isDarkMode ? 1 : 0,
      borderColor: theme.inputBorder,
      elevation: 2,
      shadowColor: theme.shadowColor,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    settingsLabel: { color: theme.text, fontWeight: '600', fontSize: 14 },
    settingsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.inputBorder,
    },
    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginRight: 7,
      backgroundColor: piStatus === 'Active' ? theme.success : piStatus === 'Rebooting...' ? theme.warning : theme.danger,
    },
    statusText: {
      color: piStatus === 'Active' ? theme.success : piStatus === 'Rebooting...' ? theme.warning : theme.danger,
      fontWeight: '600',
      fontSize: 13,
    },
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

  // ---- Data Gathering handlers ----
  const fmtUptime = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartGathering = async () => {
    setDgLoading(true);
    try {
      const result = await api.startDataGathering();
      if (result.ok) {
        setDgActive(true);
        setDgUptime(0);
        setDgStatus(null);
      } else {
        Alert.alert('Error', result.data?.message || 'Could not start data gathering.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not connect to the detection server.');
    } finally {
      setDgLoading(false);
    }
  };

  const handleStopGathering = () => {
    Alert.alert(
      'Stop Data Gathering',
      'Stop the current session? The report will be downloaded automatically.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop & Export',
          style: 'destructive',
          onPress: async () => {
            setDgLoading(true);
            try {
              const result = await api.stopDataGathering();
              if (result.ok) {
                setDgActive(false);
                setDgStatus(null);   // clear old session values immediately
                setDgUptime(0);
                // Auto-export immediately after stopping
                await handleExportReport();
              } else {
                Alert.alert('Error', result.data?.message || 'Could not stop data gathering.');
              }
            } catch (e) {
              Alert.alert('Error', 'Could not connect to the detection server.');
            } finally {
              setDgLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExportReport = async () => {
    setDgExporting(true);
    try {
      const exportUrl = api.getDataGatheringExportUrl();
      const fileName = `cairetaker_field_test_${new Date().toISOString().slice(0, 10)}.txt`;
      const fileUri = FileSystem.cacheDirectory + fileName;

      // Download from camera server
      const downloadResult = await FileSystem.downloadAsync(exportUrl, fileUri);
      if (downloadResult.status !== 200) {
        Alert.alert('Export Failed', 'Could not download report from the detection server.');
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Not Available', 'File sharing is not supported on this device.');
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: 'Export Field Test Report',
        UTI: 'public.plain-text',
      });
    } catch (e) {
      Alert.alert('Export Failed', e.message || 'An error occurred while exporting.');
    } finally {
      setDgExporting(false);
    }
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>SETTINGS</Text>
        <FontAwesomeIcon icon={faGear} color={theme.text} size={18} />
      </View>
      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faMicrochip} color={theme.primary} size={14} />
          <Text style={dynamicStyles.settingsGroupTitle}>Hardware (Pi 5)</Text>
        </View>
        <View style={dynamicStyles.settingsCard}>
          <View style={dynamicStyles.settingsRow}>
            <Text style={dynamicStyles.settingsLabel}>System Health</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={dynamicStyles.statusDot} />
              <Text style={dynamicStyles.statusText}>{piStatus}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={dynamicStyles.settingsRow}
            onPress={handleReboot}
            disabled={isRebooting}
          >
            <Text style={dynamicStyles.settingsLabel}>Reboot Hub</Text>
            {isRebooting ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <FontAwesomeIcon icon={faRotateRight} color={theme.primary} size={14} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={dynamicStyles.settingsRow}
            onPress={handleRestartServices}
            disabled={isRestarting}
          >
            <Text style={dynamicStyles.settingsLabel}>Restart Services</Text>
            {isRestarting ? (
              <ActivityIndicator size="small" color={theme.warning} />
            ) : (
              <FontAwesomeIcon icon={faArrowsRotate} color={theme.warning} size={14} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[dynamicStyles.settingsRow, { borderBottomWidth: 0 }]}
            onPress={handleShutdown}
            disabled={isShuttingDown}
          >
            <Text style={[dynamicStyles.settingsLabel, { color: theme.danger }]}>Shutdown Hub</Text>
            {isShuttingDown ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <FontAwesomeIcon icon={faPowerOff} color={theme.danger} size={14} />
            )}
          </TouchableOpacity>
        </View>

        {systemStats && (
          <View style={[dynamicStyles.settingsCard, { marginTop: 12, paddingVertical: 6 }]}>
            <View style={dynamicStyles.settingsRow}>
              <Text style={dynamicStyles.settingsLabel}>CPU Usage</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{systemStats.cpu_usage}%</Text>
            </View>
            <View style={dynamicStyles.settingsRow}>
              <Text style={dynamicStyles.settingsLabel}>Memory Usage</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{systemStats.memory_percent}%</Text>
            </View>
            <View style={dynamicStyles.settingsRow}>
              <Text style={dynamicStyles.settingsLabel}>CPU Temp</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{systemStats.temperature}{systemStats.temperature !== 'N/A' ? '°C' : ''}</Text>
            </View>
            <View style={[dynamicStyles.settingsRow, { borderBottomWidth: 0 }]}>
              <Text style={dynamicStyles.settingsLabel}>Input Voltage</Text>
              <Text style={[styles.statValue, { color: theme.primary }]}>{systemStats.voltage}</Text>
            </View>
          </View>
        )}
      </View>

      {/* ===== AUDIO SETTINGS SECTION ===== */}
      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faBell} color={theme.primary} size={14} />
          <Text style={dynamicStyles.settingsGroupTitle}>Alert Audio</Text>
        </View>

        <View style={dynamicStyles.settingsCard}>
          <View style={dynamicStyles.settingsRow}>
            <Text style={dynamicStyles.settingsLabel}>Play Sound on Alert</Text>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{ false: theme.inputBorder, true: theme.primary }}
              thumbColor={theme.card}
            />
          </View>

          <View style={[dynamicStyles.settingsRow, { borderBottomWidth: 0 }]}>
            <Text style={dynamicStyles.settingsLabel}>Alarm Sound</Text>
            <View style={{
              backgroundColor: theme.background,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.inputBorder,
              overflow: 'hidden',
            }}>
              <Picker
                selectedValue={selectedSound}
                onValueChange={changeSound}
                enabled={soundEnabled}
                style={{
                  width: 130,
                  height: Platform.OS === 'ios' ? 40 : 42,
                  color: soundEnabled ? theme.text : theme.textSecondary,
                  backgroundColor: 'transparent',
                }}
                itemStyle={{ fontSize: 14, color: theme.text, height: 40 }}
                dropdownIconColor={theme.text}
              >
                <Picker.Item label="Sound 1" value="sound1" />
              </Picker>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.previewButton,
              {
                backgroundColor: soundEnabled ? theme.background : theme.inputBorder,
                borderWidth: 1,
                borderColor: theme.inputBorder,
              }
            ]}
            onPress={playPreview}
            disabled={!soundEnabled || isPlayingPreview}
          >
            {isPlayingPreview ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <FontAwesomeIcon icon={faVolumeHigh} color={soundEnabled ? theme.primary : theme.textSecondary} size={14} />
            )}
            <Text style={[styles.dgButtonText, { color: soundEnabled ? theme.primary : theme.textSecondary }]}>
              {isPlayingPreview ? 'Playing...' : 'Preview Sound'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== FIELD TEST SECTION ===== */}
      <View style={styles.settingsGroup}>
        <View style={styles.settingsGroupHeader}>
          <FontAwesomeIcon icon={faFlask} color={theme.primary} size={14} />
          <Text style={dynamicStyles.settingsGroupTitle}>Field Test Evaluation</Text>
        </View>

        <View style={dynamicStyles.settingsCard}>
          {/* Session Status */}
          <View style={dynamicStyles.settingsRow}>
            <Text style={dynamicStyles.settingsLabel}>Session Status</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={[
                dynamicStyles.statusDot,
                { backgroundColor: dgActive ? theme.success : theme.textSecondary }
              ]} />
              <Text style={[dynamicStyles.settingsLabel, {
                color: dgActive ? theme.success : theme.textSecondary,
                fontSize: 13,
              }]}>
                {dgActive ? 'Recording' : 'Idle'}
              </Text>
            </View>
          </View>

          {/* Uptime Timer */}
          <View style={dynamicStyles.settingsRow}>
            <Text style={dynamicStyles.settingsLabel}>Uptime</Text>
            <Text style={{
              fontWeight: '700',
              color: dgActive ? theme.success : theme.textSecondary,
              fontVariant: ['tabular-nums'],
              fontSize: 14,
            }}>
              {fmtUptime(dgUptime)}
            </Text>
          </View>

          {/* Live stats when active */}
          {dgActive && dgStatus && (
            <View style={{ paddingBottom: 4 }}>
              <View style={styles.dgStatsRow}>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>Avg FPS</Text>
                <Text style={[styles.dgStatValue, { color: theme.primary }]}>{dgStatus.avg_fps}</Text>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>Avg Infer</Text>
                <Text style={[styles.dgStatValue, { color: theme.primary }]}>{dgStatus.avg_inference_ms} ms</Text>
              </View>
              <View style={styles.dgStatsRow}>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>CPU%</Text>
                <Text style={[styles.dgStatValue, { color: theme.primary }]}>{dgStatus.avg_cpu_percent}%</Text>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>Mem</Text>
                <Text style={[styles.dgStatValue, { color: theme.primary }]}>{dgStatus.avg_memory_mb} MB</Text>
              </View>
              <View style={[styles.dgStatsRow, { marginTop: 2 }]}>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>Alerts</Text>
                <Text style={[styles.dgStatValue, { color: theme.warning }]}>{dgStatus.alert_count}</Text>
                <Text style={[dynamicStyles.settingsLabel, styles.dgStatLabel]}>Frames</Text>
                <Text style={[styles.dgStatValue, { color: theme.primary }]}>{dgStatus.frames_sampled}</Text>
              </View>
            </View>
          )}

          {/* Start / Stop Button */}
          <View style={[dynamicStyles.settingsRow, { borderBottomWidth: 0, paddingTop: 4, paddingBottom: 14 }]}>
            {dgActive ? (
              <TouchableOpacity
                style={[styles.dgButton, { backgroundColor: theme.danger }]}
                onPress={handleStopGathering}
                disabled={dgLoading}
              >
                {dgLoading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <FontAwesomeIcon icon={faStop} color="#FFF" size={13} />
                }
                <Text style={styles.dgButtonText}>Stop Recording</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.dgButton, { backgroundColor: theme.success || '#2E7D32' }]}
                onPress={handleStartGathering}
                disabled={dgLoading}
              >
                {dgLoading
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <FontAwesomeIcon icon={faPlay} color="#FFF" size={13} />
                }
                <Text style={styles.dgButtonText}>Start Data Gathering</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.dgButton, { backgroundColor: theme.primary, marginLeft: 8 }]}
              onPress={handleExportReport}
              disabled={dgExporting}
            >
              {dgExporting
                ? <ActivityIndicator size="small" color="#FFF" />
                : <FontAwesomeIcon icon={faFileExport} color="#FFF" size={13} />
              }
              <Text style={styles.dgButtonText}>Export Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsGroup: { marginBottom: 22 },
  settingsGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginLeft: 12 },

  // System stats value
  statValue: {
    fontWeight: '700',
    fontSize: 14,
    color: '#1E3A5F',
  },

  // Audio preview button
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 14,
  },

  // Data Gathering
  dgButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 7,
  },
  dgButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  dgStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  dgStatLabel: {
    flex: 1,
    fontSize: 11,
    opacity: 0.75,
  },
  dgStatValue: {
    flex: 1,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'right',
    paddingRight: 12,
  },
});