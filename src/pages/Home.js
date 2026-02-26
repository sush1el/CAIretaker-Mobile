import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, Dimensions, StatusBar, Alert } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faTriangleExclamation, faChevronDown, faPersonWalking, faArrowLeft, faRefresh, faVideoCamera, faExpand, faCompress, faChartBar } from '@fortawesome/free-solid-svg-icons';
import { WebView } from 'react-native-webview';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';
import AlertCard from '../components/AlertCard';

export default function Home({ setScreen, setMonitoringRoom }) {
  const { theme, isDarkMode } = useTheme();
  const [hasActiveFall, setHasActiveFall] = useState(false);
  const [activeFallCount, setActiveFallCount] = useState(0);
  const [fallEvents, setFallEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState(null);
  const [sortType, setSortType] = useState('latestDate');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [homeLogsClearedAt, setHomeLogsClearedAt] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [gaitAlertCount, setGaitAlertCount] = useState(0);
  const isPolling = useRef(false);

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [cameraStatus, setCameraStatus] = useState(null);
  const [streamKey, setStreamKey] = useState(0);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkFalls = async () => {
      if (isPolling.current) return;
      isPolling.current = true;

      try {
        let hasLiveFall = false;
        let liveFallCount = 0;

        const statusResult = await api.getCameraStatus();
        if (mounted && statusResult.ok) {
          const detections = statusResult.data.detections || [];
          hasLiveFall = detections.some(d => d.is_fall || d.is_fallen);
          liveFallCount = detections.filter(d => d.is_fall || d.is_fallen).length;

          if (statusResult.data.has_active_fall) {
            hasLiveFall = true;
            liveFallCount = Math.max(liveFallCount, 1);
          }
        }

        if (mounted) {
          setHasActiveFall(hasLiveFall);
          setActiveFallCount(liveFallCount);
          setGaitAlertCount(statusResult.ok ? (statusResult.data.gait_alerts || 0) : 0);
          setLastUpdate(Date.now());
        }

        const eventsResult = await api.getFallEvents();
        if (mounted && eventsResult.ok) {
          const events = eventsResult.data.events || eventsResult.data.incidents || [];
          setFallEvents([...events]);
        }
      } catch (error) {
        console.log('Error checking falls:', error);
      } finally {
        isPolling.current = false;
      }
    };

    checkFalls();
    const interval = setInterval(checkFalls, 500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (selectedRoom === null) {
      setCameraStatus(null);
      return;
    }
    let mounted = true;
    setIsStreamLoading(true);
    const checkCamera = async () => {
      try {
        const result = await api.getCameraStatus();
        if (mounted) {
          setCameraStatus(result.ok ? result.data : null);
          setIsStreamLoading(false);
        }
      } catch (e) {
        if (mounted) { setCameraStatus(null); setIsStreamLoading(false); }
      }
    };
    checkCamera();
    const interval = setInterval(checkCamera, 2000);
    return () => { mounted = false; clearInterval(interval); };
  }, [selectedRoom]);

  const refreshStream = () => {
    setStreamKey(prev => prev + 1);
  };

  const startCamera = async () => {
    setIsStreamLoading(true);
    await api.startCamera();
    const result = await api.getCameraStatus();
    if (result.ok) setCameraStatus(result.data);
    setIsStreamLoading(false);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const eventsResult = await api.getFallEvents();
      if (eventsResult.ok) {
        setFallEvents(eventsResult.data.events || []);
      }
    } catch (error) {
      console.log('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const recentLogs = fallEvents
    .filter(event => {
      const isFall = event.class?.toLowerCase().includes('fall') || event.class?.toLowerCase().includes('fallen') || event.type === 'fall' || event.status === 'active';
      const isGait = event.type === 'at_risk';
      if (!isFall && !isGait) return false;

      if (homeLogsClearedAt !== null) {
        if (!event.timestamp || event.timestamp <= homeLogsClearedAt) return false;
      }

      if (roomFilter !== null) {
        const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
        if (parseInt(roomNum) !== roomFilter) return false;
      }

      return true;
    })
    .map((event, index) => {
      const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
      const eventDate = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
      const isGait = event.type === 'at_risk';

      return {
        incidentId: event.id || index,
        roomNo: `Room ${roomNum}`,
        status: isGait ? 'Gait' : 'Fall',
        eventType: event.type,
        timestamp: event.timestamp,
        eventDate: eventDate,
        date: eventDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        time: eventDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
      };
    })
    .sort((a, b) => {
      const dateA = a.eventDate || new Date(0);
      const dateB = b.eventDate || new Date(0);

      switch (sortType) {
        case 'latestDate':
          return dateB - dateA;
        case 'latestTime':
          const timeA1 = dateA.getHours() * 60 + dateA.getMinutes();
          const timeB1 = dateB.getHours() * 60 + dateB.getMinutes();
          return timeB1 - timeA1;
        case 'oldestDate':
          return dateA - dateB;
        case 'oldestTime':
          const timeA2 = dateA.getHours() * 60 + dateA.getMinutes();
          const timeB2 = dateB.getHours() * 60 + dateB.getMinutes();
          return timeA2 - timeB2;
        default:
          return dateB - dateA;
      }
    });

  const sortOptions = [
    { value: 'latestDate', label: 'Latest by Date' },
    { value: 'latestTime', label: 'Latest by Time' },
    { value: 'oldestDate', label: 'Oldest by Date' },
    { value: 'oldestTime', label: 'Oldest by Time' },
  ];

  const currentSortLabel = sortOptions.find(opt => opt.value === sortType)?.label || 'Latest by Date';

  const handleRoomFilter = (room) => {
    if (roomFilter === room) {
      setRoomFilter(null);
    } else {
      setRoomFilter(room);
    }
  };

  const handleClearLogs = () => {
    Alert.alert(
      'Clear Home Logs',
      'This will only clear logs shown on this Home page until a new log is recorded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setHomeLogsClearedAt(Math.floor(Date.now() / 1000));
          },
        },
      ]
    );
  };

  const renderInlineCameraFeed = () => {
    if (selectedRoom !== 1) {
      return (
        <View style={styles.videoPlaceholder}>
          <FontAwesomeIcon icon={faVideoCamera} color="#555" size={40} />
          <Text style={styles.placeholderStatusText}>Room {selectedRoom}</Text>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
          <Text style={styles.expansionText}>Camera expansion planned</Text>
        </View>
      );
    }
    if (isStreamLoading) {
      return (
        <View style={styles.videoPlaceholder}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.placeholderStatusText}>Connecting to camera...</Text>
        </View>
      );
    }
    if (!cameraStatus || !cameraStatus.camera_running) {
      return (
        <View style={styles.videoPlaceholder}>
          <FontAwesomeIcon icon={faVideoCamera} color="#666" size={40} />
          <Text style={styles.placeholderStatusText}>Camera Offline</Text>
          <TouchableOpacity style={styles.startButton} onPress={startCamera}>
            <Text style={styles.startButtonText}>Start Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.videoContainer}>
        <WebView
          key={streamKey}
          source={{ uri: api.getCameraStreamUrl() }}
          style={styles.videoStream}
          javaScriptEnabled={false}
          scrollEnabled={false}
          bounces={false}
          onError={(e) => console.log('WebView error:', e.nativeEvent)}
        />
        <TouchableOpacity
          style={styles.fullscreenButton}
          onPress={() => setIsFullscreen(true)}
        >
          <FontAwesomeIcon icon={faExpand} color="#FFF" size={16} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderFullscreenModal = () => {
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
    return (
      <Modal
        visible={isFullscreen}
        animationType="fade"
        supportedOrientations={['portrait', 'landscape']}
        statusBarTranslucent
        onRequestClose={() => setIsFullscreen(false)}
      >
        <StatusBar hidden={isFullscreen} />
        <View style={styles.fullscreenOverlay}>
          <View style={[
            styles.fullscreenStreamContainer,
            { width: screenHeight, height: screenWidth, transform: [{ rotate: '90deg' }] }
          ]}>
            <WebView
              key={`fs-${streamKey}`}
              source={{ uri: api.getCameraStreamUrl() }}
              style={styles.fullscreenStream}
              javaScriptEnabled={false}
              scrollEnabled={false}
              bounces={false}
              onError={(e) => console.log('Fullscreen WebView error:', e.nativeEvent)}
            />
            <View style={styles.fullscreenTopBar}>
              <View style={styles.fullscreenLiveBadge}>
                <View style={[styles.innerDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.fullscreenLiveText}>LIVE</Text>
              </View>
              <Text style={styles.fullscreenRoomText}>ROOM {selectedRoom}</Text>
            </View>
            <TouchableOpacity
              style={styles.fullscreenCloseButton}
              onPress={() => setIsFullscreen(false)}
            >
              <FontAwesomeIcon icon={faCompress} color="#FFF" size={20} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // -------------------------
  // THEME DYNAMIC STYLES
  // -------------------------
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },

    // 1. TOP CAMERA BUTTONS (No Borders, Clean Shadows, Bold Navy Assets)
    topRoomGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 20,
      paddingHorizontal: 2
    },
    topRoomBtn: {
      backgroundColor: theme.card, // Flat card color (white or dark gray depending on theme)
      paddingVertical: 20, // Slightly taller to breathe
      borderRadius: 24,
      flex: 1,
      marginHorizontal: 6,
      alignItems: 'center',
      // We rely entirely on this beautiful floating shadow instead of an outline
      shadowColor: isDarkMode ? '#000' : '#1E3A5F', // Navy-tinted shadow looks premium in light mode
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 6,
      borderWidth: 0, // NO MORE BORDER
    },
    topRoomIconCircle: {
      backgroundColor: '#1E3A5F', // Solid Navy Blue bubble
      width: 44, // Slightly larger to act as the visual anchor
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
      shadowColor: '#1E3A5F', // Inner glow/drop shadow for the circle itself
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    topRoomBtnLabel: {
      fontSize: 10,
      color: isDarkMode ? '#8c9eff' : '#1E3A5F', // Navy Blue text
      fontWeight: '800',
      letterSpacing: 1,
    },
    topRoomBtnNum: {
      fontSize: 28,
      fontWeight: '900',
      color: isDarkMode ? theme.text : '#1E3A5F', // Navy Blue text
      marginTop: 2,
    },

    // 2. NAVY BLUE RECENT LOGS HEADER 
    logsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1E3A5F',
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderRadius: 15,
      marginBottom: 15,
    },
    logsSectionHeaderText: {
      fontWeight: '800',
      color: '#FFFFFF',
      fontSize: 15,
      marginLeft: 10,
      letterSpacing: 1,
    },

    // 3. BOTTOM FILTER BUBBLES
    livelyPaginationTrack: {
      flexDirection: 'row',
      backgroundColor: isDarkMode ? '#1A2332' : '#E8ECEF',
      borderRadius: 25,
      padding: 4,
      flex: 1,
      marginRight: 10,
    },
    bubbleBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    bubbleBtnActive: {
      backgroundColor: isDarkMode ? '#1E3A5F' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    bubbleText: {
      color: isDarkMode ? '#6C7C92' : '#8A9BA8',
      fontWeight: '700',
      fontSize: 12,
    },
    bubbleTextActive: {
      color: isDarkMode ? '#FFFFFF' : '#1E3A5F',
      fontWeight: '900',
    },

    sortDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? '#1A2332' : '#E8ECEF', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 25 },
    sortDropdownText: { color: isDarkMode ? '#8c9eff' : '#5C6C7B', fontWeight: '700', fontSize: 11, marginRight: 6 },
    sortDropdownMenu: { position: 'absolute', top: '100%', right: 0, backgroundColor: theme.card, borderRadius: 12, marginTop: 4, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, minWidth: 150, zIndex: 1000 },
    sortDropdownItemText: { color: theme.text, fontSize: 12 },
    logsContainer: { backgroundColor: theme.card, borderRadius: 15, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3 },
    logHeaderRow: { flexDirection: 'row', backgroundColor: theme.primary, padding: 14, alignItems: 'center' },
    logRow: { flexDirection: 'row', padding: 14, borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#2c3e50' : '#F0F0F0', alignItems: 'center' },
    logText: { color: theme.text, fontSize: 12 },
    loadingContainer: { backgroundColor: theme.card, padding: 20, borderRadius: 15, alignItems: 'center' },
    loadingText: { color: theme.textSecondary, marginTop: 10 },
    emptyState: { backgroundColor: theme.card, padding: 30, borderRadius: 15, alignItems: 'center' },
    emptyStateText: { color: theme.textSecondary, fontWeight: '600', fontSize: 16 },
    emptyStateSubtext: { color: theme.textSecondary, marginTop: 5, fontSize: 12 },
    backBadge: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    liveBadge: { backgroundColor: theme.primary, paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
    metaBadge: { backgroundColor: theme.card, paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
    refreshBadge: { backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    metaText: { color: theme.text, fontWeight: 'bold', fontSize: 10 },
    clearLogsButton: {
      backgroundColor: theme.danger,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
  };

  return (
    <View style={{ flex: 1, paddingBottom: 20 }}>
      {renderFullscreenModal()}

      {/* -------------------- TOP CAMERA SECTION -------------------- */}
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>{selectedRoom ? 'LIVE MONITORING' : 'SELECT CAMERA'}</Text>
        <FontAwesomeIcon icon={faCamera} color={theme.text} size={16} />
      </View>

      {/* RE-STYLED LIVELY CAMERA SELECTION BUTTONS WITH NAVY */}
      {selectedRoom === null ? (
        <View style={dynamicStyles.topRoomGrid}>
          {[1, 2, 3].map(r => (
            <TouchableOpacity
              key={r}
              style={dynamicStyles.topRoomBtn}
              activeOpacity={0.7}
              onPress={() => { setSelectedRoom(r); setMonitoringRoom(r); }}
            >
              {/* Solid Navy Blue Icon Circle with White Icon */}
              <View style={dynamicStyles.topRoomIconCircle}>
                <FontAwesomeIcon icon={faVideoCamera} color="#FFFFFF" size={16} />
              </View>
              <Text style={dynamicStyles.topRoomBtnLabel}>ROOM</Text>
              <Text style={dynamicStyles.topRoomBtnNum}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={{ marginBottom: 20 }}>
          <View style={styles.liveMetaRow}>
            <TouchableOpacity style={dynamicStyles.backBadge} onPress={() => setSelectedRoom(null)}>
              <FontAwesomeIcon icon={faArrowLeft} color="#FFF" size={12} />
            </TouchableOpacity>
            <View style={dynamicStyles.liveBadge}>
              <View style={[styles.innerDot, { backgroundColor: cameraStatus?.camera_running ? '#4CAF50' : '#F44336' }]} />
              <Text style={styles.liveBadgeText}>{cameraStatus?.camera_running ? 'LIVE' : 'OFFLINE'}</Text>
            </View>
            <View style={dynamicStyles.metaBadge}>
              <Text style={dynamicStyles.metaText}>ROOM {selectedRoom}</Text>
            </View>
            <TouchableOpacity style={dynamicStyles.refreshBadge} onPress={refreshStream}>
              <FontAwesomeIcon icon={faRefresh} color={theme.primary} size={12} />
            </TouchableOpacity>
            <View style={dynamicStyles.metaBadge}>
              <Text style={dynamicStyles.metaText}>FPS: 15</Text>
            </View>
          </View>
          {renderInlineCameraFeed()}
        </View>
      )}

      {/* -------------------- ALERT DASHBOARD -------------------- */}
      <View style={styles.alertGridContainer}>
        <AlertCard
          title="Live Fall Alerts"
          icon={faTriangleExclamation}
          mainValue={hasActiveFall ? activeFallCount.toString() : "0"}
          subText={hasActiveFall ? "Fall(s) Detected!" : "Active Falls"}
          isSafe={!hasActiveFall}
          theme={theme}
          isDarkMode={isDarkMode}
        />

        <AlertCard
          title="Live Gait Alerts"
          icon={faPersonWalking}
          mainValue={gaitAlertCount.toString()}
          subText={gaitAlertCount > 0 ? "Abnormal Gait!" : "Bad Gait Alerts"}
          isSafe={gaitAlertCount === 0}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      </View>

      {/* -------------------- RECENT LOGS SECTION -------------------- */}
      <View style={dynamicStyles.logsSectionHeader}>
        <Text style={dynamicStyles.logsSectionHeaderText}>RECENT LOGS </Text>
        <FontAwesomeIcon icon={faChartBar} color="#FFFFFF" size={18} />
      </View>

      <View style={styles.filterBar}>
        <View style={dynamicStyles.livelyPaginationTrack}>
          {[1, 2, 3].map((room) => (
            <TouchableOpacity
              key={room}
              style={[
                dynamicStyles.bubbleBtn,
                roomFilter === room && dynamicStyles.bubbleBtnActive
              ]}
              onPress={() => handleRoomFilter(room)}
            >
              <Text style={[
                dynamicStyles.bubbleText,
                roomFilter === room && dynamicStyles.bubbleTextActive
              ]}>Room {room}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sortDropdownContainer}>
          <TouchableOpacity
            style={dynamicStyles.sortDropdown}
            onPress={() => setShowSortDropdown(!showSortDropdown)}
          >
            <Text style={dynamicStyles.sortDropdownText}>{currentSortLabel}</Text>
            <FontAwesomeIcon icon={faChevronDown} size={10} color={isDarkMode ? '#8c9eff' : '#5C6C7B'} />
          </TouchableOpacity>

          {showSortDropdown && (
            <View style={dynamicStyles.sortDropdownMenu}>
              {sortOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sortDropdownItem,
                    sortType === option.value && { backgroundColor: isDarkMode ? '#1a3a5a' : '#E8F4FD' }
                  ]}
                  onPress={() => {
                    setSortType(option.value);
                    setShowSortDropdown(false);
                  }}
                >
                  <Text style={[
                    dynamicStyles.sortDropdownItemText,
                    sortType === option.value && { color: theme.primary, fontWeight: '600' }
                  ]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={dynamicStyles.loadingText}>Loading logs...</Text>
        </View>
      ) : recentLogs.length > 0 ? (
        <View style={dynamicStyles.logsContainer}>
          <View style={dynamicStyles.logHeaderRow}>
            <View style={styles.columnCenter}>
              <Text style={styles.logHeaderText}>Room No</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.logHeaderText}>Status</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.logHeaderText}>Date</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.logHeaderText}>Time</Text>
            </View>
          </View>

          {recentLogs.slice(0, 5).map((log, index) => (
            <View key={`log-${index}-${log.incidentId || 'no-id'}-${log.date}-${log.time}`} style={dynamicStyles.logRow}>
              <View style={styles.columnCenter}>
                <Text style={dynamicStyles.logText}>{log.roomNo}</Text>
              </View>
              <View style={styles.columnCenter}>
                <View style={[styles.tagBadge, log.eventType === 'at_risk' ? styles.tagGait : styles.tagFall]}>
                  <Text style={styles.tagText}>{log.status}</Text>
                </View>
              </View>
              <View style={styles.columnCenter}>
                <Text style={dynamicStyles.logText}>{log.date}</Text>
              </View>
              <View style={styles.columnCenter}>
                <Text style={dynamicStyles.logText}>{log.time}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={dynamicStyles.emptyState}>
          <Text style={dynamicStyles.emptyStateText}>No recent logs</Text>
          <Text style={dynamicStyles.emptyStateSubtext}>Fall events will appear here</Text>
        </View>
      )}

      <View style={styles.logsActionsRow}>
        <TouchableOpacity style={dynamicStyles.clearLogsButton} onPress={handleClearLogs}>
          <Text style={styles.clearLogsButtonText}>Clear Logs</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.hiddenStream}>
        <WebView
          source={{ uri: api.getCameraStreamUrl() }}
          style={{ width: 1, height: 1, opacity: 0 }}
          javaScriptEnabled={false}
          scrollEnabled={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  alertGridContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    marginVertical: 15,
  },
  liveMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' },
  innerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  liveBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  videoPlaceholder: { width: '100%', height: 220, backgroundColor: '#1a1a1a', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  videoContainer: { width: '100%', height: 220, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  videoStream: { flex: 1, backgroundColor: '#000' },
  placeholderStatusText: { color: '#999', marginTop: 10, fontSize: 14 },
  comingSoonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  expansionText: { color: '#666', fontSize: 12, marginTop: 4 },
  startButton: { marginTop: 15, backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startButtonText: { color: '#FFF', fontWeight: 'bold' },
  fullscreenButton: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 12 },
  fullscreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullscreenStreamContainer: { position: 'relative' },
  fullscreenStream: { flex: 1, backgroundColor: '#000' },
  fullscreenTopBar: { position: 'absolute', top: 15, left: 15, flexDirection: 'row', alignItems: 'center' },
  fullscreenLiveBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  fullscreenLiveText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  fullscreenRoomText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  fullscreenCloseButton: { position: 'absolute', bottom: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 14 },

  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },

  sortDropdownContainer: { position: 'relative', zIndex: 100 },
  sortDropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  logHeaderText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  columnCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tagBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#EEE' },
  tagFall: { backgroundColor: '#FF3B30' },
  tagGait: { backgroundColor: '#F57C00' },
  tagText: { fontSize: 11, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  hiddenStream: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  logsActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    marginBottom: 10,
  },
  clearLogsButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});