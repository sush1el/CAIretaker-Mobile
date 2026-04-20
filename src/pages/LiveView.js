import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Vibration, Modal, StatusBar, useWindowDimensions } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faChevronLeft, faChevronRight, faRefresh, faVideoCamera, faExclamationTriangle, faChartBar, faExpand, faCompress } from '@fortawesome/free-solid-svg-icons';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import api from '../services/api';

// Vibration pattern: vibrate 500ms, pause 500ms (repeats)
const FALL_VIBRATION_PATTERN = [0, 500, 500];
const GAIT_VIBRATION_PATTERN = [0, 300, 300, 300, 300];
const CAMERA_ASPECT_RATIO = 16 / 9;

export default function LiveView({ monitoringRoom, setMonitoringRoom }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [cameraStatus, setCameraStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamKey, setStreamKey] = useState(0);
  const [activeFalls, setActiveFalls] = useState([]);
  const [fallLogs, setFallLogs] = useState([]); // Persistent fall event logs
  const [isFullscreen, setIsFullscreen] = useState(false);
  const vibrationActiveRef = useRef(false);

  const liveFps = Number.isFinite(Number(cameraStatus?.fps))
    ? Number(cameraStatus.fps).toFixed(1)
    : '--';

  const fullscreenFrameStyle =
    windowWidth / windowHeight > CAMERA_ASPECT_RATIO
      ? { width: windowHeight * CAMERA_ASPECT_RATIO, height: windowHeight }
      : { width: windowWidth, height: windowWidth / CAMERA_ASPECT_RATIO };

  useEffect(() => {
    const applyFullscreenOrientation = async () => {
      try {
        if (isFullscreen) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch (error) {
        console.log('Orientation lock error:', error);
      }
    };

    applyFullscreenOrientation();

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [isFullscreen]);

  // Stop vibration (can be called manually or automatically)
  const stopVibration = () => {
    Vibration.cancel();
    vibrationActiveRef.current = false;
  };

  // Continuous vibration when fall is detected
  useEffect(() => {
    // ONLY vibrate when camera is actively detecting AND there's a fall
    const liveDetections = cameraStatus?.detections || [];

    // Must have at least one detection AND one of them must be a fall
    const hasDetections = liveDetections.length > 0;
    const hasLiveFallDetection = hasDetections && liveDetections.some(d => d.is_fall === true);
    const hasLiveGaitAlert = hasDetections && liveDetections.some(d => d.gait_status === 'abnormal');
    const hasAlert = hasLiveFallDetection || hasLiveGaitAlert;

    console.log('Vibration check:', {
      hasDetections,
      hasLiveFallDetection,
      hasLiveGaitAlert,
      detectionsCount: liveDetections.length,
      isVibrating: vibrationActiveRef.current
    });

    if (hasAlert && !vibrationActiveRef.current) {
      vibrationActiveRef.current = true;
      // Use fall pattern for falls, gait pattern for gait-only alerts
      Vibration.vibrate(hasLiveFallDetection ? FALL_VIBRATION_PATTERN : GAIT_VIBRATION_PATTERN, true);
      console.log(hasLiveFallDetection ? '🔔 Fall alert: vibration started' : '🔔 Gait alert: vibration started');
    } else if (!hasAlert && vibrationActiveRef.current) {
      stopVibration();
      console.log('🔕 Alert cleared: vibration stopped');
    }

    return () => {
      if (vibrationActiveRef.current) {
        Vibration.cancel();
        vibrationActiveRef.current = false;
      }
    };
  }, [cameraStatus, activeFalls]);

  // Initial data fetch
  useEffect(() => {
    checkCameraStatus();
  }, []);

  // Poll for camera status and detections
  useEffect(() => {
    const interval = setInterval(() => {
      checkCameraStatus();
      fetchActiveFalls();
    }, 1000); // Poll every second for real-time updates
    return () => clearInterval(interval);
  }, []);

  const fetchActiveFalls = async () => {
    try {
      const result = await api.getActiveFalls();
      if (result.ok) {
        setActiveFalls(result.data.active_falls || []);
      }
    } catch (error) {
      console.log('Error fetching active falls:', error);
    }
  };

  const checkCameraStatus = async () => {
    try {
      const result = await api.getCameraStatus();
      if (result.ok) {
        setCameraStatus(result.data);

        // Check for new fall events and add to persistent logs
        if (result.data.detections) {
          result.data.detections.forEach(detection => {
            // Backend returns 'id' as the track_id, also check is_fall
            const trackId = detection.id || detection.track_id;
            if (detection.is_fall || detection.is_fallen) {
              const existingLog = fallLogs.find(log =>
                log.trackId === trackId &&
                (Date.now() - log.timestamp) < 5000 // Same fall within 5 seconds
              );

              if (!existingLog) {
                setFallLogs(prev => [{
                  id: Date.now(),
                  trackId: trackId,
                  status: 'Fall',
                  timestamp: Date.now(),
                  date: new Date().toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }),
                  time: new Date().toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })
                }, ...prev].slice(0, 50)); // Keep last 50 logs
              }
            }
          });
        }
      } else {
        setCameraStatus(null);
      }
    } catch (error) {
      console.error('Camera status error:', error);
      setCameraStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStream = () => {
    setStreamKey(prev => prev + 1);
    checkCameraStatus();
    fetchActiveFalls();
  };

  const startCamera = async () => {
    setIsLoading(true);
    await api.startCamera();
    checkCameraStatus();
  };

  // Get current detections with all people tracked
  const getCurrentDetections = () => {
    if (!cameraStatus || !cameraStatus.detections || cameraStatus.detections.length === 0) {
      return [];
    }

    return cameraStatus.detections.map(detection => {
      // Backend returns 'id' as track_id
      const trackId = detection.id || detection.track_id;
      // Use the status directly from API if available
      let status = detection.status || 'Tracking';

      // Override based on specific flags
      if (detection.is_fall || detection.is_fallen || detection.display_state === 'fallen') {
        status = 'Fall';
      } else if (detection.gait_status === 'abnormal') {
        status = 'Abnormal Gait';
      } else if (detection.is_at_risk) {
        status = 'At Risk';
      }

      return {
        trackId: trackId,
        status: status,
        isFall: detection.is_fall || detection.is_fallen,
        isGaitAlert: detection.gait_status === 'abnormal',
        isAtRisk: detection.is_at_risk,
        confidence: detection.confidence
      };
    });
  };

  const currentDetections = getCurrentDetections();

  // Build activity data: real-time detections (live status) + fall logs (persistent)
  // Only show data for Room 1 since that's the only active camera
  const buildActivityData = () => {
    // Room 2 and 3 don't have cameras yet, return empty
    if (monitoringRoom !== 1) {
      return [];
    }

    const now = new Date();
    const liveData = currentDetections.map(detection => ({
      id: detection.trackId,
      trackId: detection.trackId,
      status: detection.status,
      isLive: true,
      isFall: detection.isFall,
      date: now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      time: now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    }));

    // Add fall logs (persistent historical falls)
    const fallData = fallLogs.map(log => ({
      id: log.id,
      trackId: log.trackId,
      status: log.status,
      isLive: false,
      isFall: true,
      date: log.date,
      time: log.time
    }));

    // Combine: live detections first, then fall history
    return [...liveData, ...fallData];
  };

  const activityData = buildActivityData();

  // Render camera feed
  const renderCameraFeed = () => {
    if (monitoringRoom !== 1) {
      return (
        <View style={styles.videoPlaceholder}>
          <FontAwesomeIcon icon={faVideoCamera} color="#555" size={40} />
          <Text style={styles.statusText}>Room {monitoringRoom}</Text>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
          <Text style={styles.expansionText}>Camera expansion planned</Text>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View style={styles.videoPlaceholder}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.statusText}>Connecting to camera...</Text>
        </View>
      );
    }

    if (!cameraStatus || !cameraStatus.camera_running) {
      return (
        <View style={styles.videoPlaceholder}>
          <FontAwesomeIcon icon={faVideoCamera} color="#666" size={40} />
          <Text style={styles.statusText}>Camera Offline</Text>
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
        {!cameraStatus.model_loaded && (
          <View style={styles.modelWarning}>
            <FontAwesomeIcon icon={faExclamationTriangle} color="#FFA000" size={12} />
            <Text style={styles.modelWarningText}>Model not loaded</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.fullscreenButton}
          onPress={() => setIsFullscreen(true)}
        >
          <FontAwesomeIcon icon={faExpand} color="#FFF" size={16} />
        </TouchableOpacity>
      </View>
    );
  };

  // Get status style including At Risk and Tracking
  const getStatusStyle = (status) => {
    switch (status) {
      case 'Fall':
      case 'Fallen':
        return { bg: '#FFEBEE', text: '#D32F2F' }; // Red
      case 'Abnormal Gait':
        return { bg: '#FFF8E1', text: '#F57F17' }; // Amber/Yellow
      case 'At Risk':
        return { bg: '#FFF3E0', text: '#FF9800' }; // Orange
      case 'Tracking':
        return { bg: '#F5F5F5', text: '#757575' }; // Grey
      case 'Standing':
      case 'Sitting':
      case 'Normal':
      default:
        return { bg: '#E8F5E9', text: '#4CAF50' }; // Green
    }
  };

  // Fullscreen modal
  const renderFullscreenModal = () => {
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
          <View style={styles.fullscreenStreamContainer}>
            <View style={[styles.fullscreenFrame, fullscreenFrameStyle]}>
              <WebView
                key={`fs-${streamKey}`}
                source={{ uri: api.getCameraStreamUrl() }}
                style={styles.fullscreenStream}
                javaScriptEnabled={false}
                scrollEnabled={false}
                bounces={false}
                onError={(e) => console.log('Fullscreen WebView error:', e.nativeEvent)}
              />
            </View>
            <View style={styles.fullscreenTopBar}>
              <View style={styles.fullscreenLiveBadge}>
                <View style={[styles.innerDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.fullscreenLiveText}>LIVE</Text>
              </View>
              <Text style={styles.fullscreenRoomText}>ROOM {monitoringRoom}</Text>
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

  return (
    <View>
      {renderFullscreenModal()}
      <View style={styles.liveMetaRow}>
        <View style={styles.liveBadge}>
          <View style={[styles.innerDot, { backgroundColor: cameraStatus?.camera_running ? '#4CAF50' : '#F44336' }]} />
          <Text style={styles.liveBadgeText}>{cameraStatus?.camera_running ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
        <View style={styles.metaBadge}>
          <Text style={styles.metaText}>ROOM {monitoringRoom}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBadge} onPress={refreshStream}>
          <FontAwesomeIcon icon={faRefresh} color="#1E3A5F" size={12} />
        </TouchableOpacity>
        <View style={styles.metaBadge}>
          <Text style={styles.metaText}>FPS: {liveFps}</Text>
        </View>
      </View>

      {renderCameraFeed()}

      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>LIVE MONITORING</Text>
        <FontAwesomeIcon icon={faCamera} color="#1E3A5F" size={16} />
      </View>

      {/* Room Activity Table - ID, Status, Date, Time */}
      <View style={styles.activitySection}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityHeaderText}>ROOM {monitoringRoom} ACTIVITY</Text>
          <FontAwesomeIcon icon={faChartBar} color="#FFF" size={14} />
        </View>

        <View style={styles.activityTable}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.columnSmall}>
              <Text style={styles.tableHeaderText}>ID</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.tableHeaderText}>Status</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.tableHeaderText}>Date</Text>
            </View>
            <View style={styles.columnCenter}>
              <Text style={styles.tableHeaderText}>Time</Text>
            </View>
          </View>

          {/* Table Rows */}
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {activityData.length > 0 ? (
              activityData.map((item, index) => {
                const statusStyle = getStatusStyle(item.status);
                return (
                  <View key={`${item.trackId}-${item.id}-${index}`} style={styles.tableRow}>
                    <View style={styles.columnSmall}>
                      <Text style={styles.idText}>{item.trackId}</Text>
                    </View>
                    <View style={styles.columnCenter}>
                      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{item.status}</Text>
                      </View>
                    </View>
                    <View style={styles.columnCenter}>
                      <Text style={styles.tableText}>{item.date}</Text>
                    </View>
                    <View style={styles.columnCenter}>
                      <Text style={styles.tableText}>{item.time}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>No activity detected</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      <View style={styles.paginationRow}>
        <TouchableOpacity style={styles.circleArrow} onPress={() => setMonitoringRoom(monitoringRoom <= 1 ? 3 : monitoringRoom - 1)}>
          <FontAwesomeIcon icon={faChevronLeft} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.circleArrow} onPress={() => setMonitoringRoom(monitoringRoom >= 3 ? 1 : monitoringRoom + 1)}>
          <FontAwesomeIcon icon={faChevronRight} color="#FFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  videoPlaceholder: { width: '100%', height: 220, backgroundColor: '#1a1a1a', borderRadius: 20, marginBottom: 15, justifyContent: 'center', alignItems: 'center' },
  videoContainer: { width: '100%', height: 220, borderRadius: 20, marginBottom: 15, overflow: 'hidden', backgroundColor: '#000' },
  videoStream: { flex: 1, backgroundColor: '#000' },
  statusText: { color: '#999', marginTop: 10, fontSize: 14 },
  comingSoonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 8 },
  expansionText: { color: '#666', fontSize: 12, marginTop: 4 },
  startButton: { marginTop: 15, backgroundColor: '#1E3A5F', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  startButtonText: { color: '#FFF', fontWeight: 'bold' },
  modelWarning: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  modelWarningText: { color: '#FFA000', fontSize: 10, marginLeft: 5 },
  fullscreenButton: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 12 },
  fullscreenOverlay: { flex: 1, backgroundColor: '#000' },
  fullscreenStreamContainer: { position: 'relative', flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  fullscreenFrame: { backgroundColor: '#000', overflow: 'hidden' },
  fullscreenStream: { flex: 1, backgroundColor: '#000' },
  fullscreenTopBar: { position: 'absolute', top: 15, left: 15, flexDirection: 'row', alignItems: 'center' },
  fullscreenLiveBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  fullscreenLiveText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  fullscreenRoomText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  fullscreenCloseButton: { position: 'absolute', bottom: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 14 },
  liveMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, alignItems: 'center' },
  liveBadge: { backgroundColor: '#1E3A5F', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
  innerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  liveBadgeText: { color: '#FFF', fontWeight: 'bold', fontSize: 10 },
  metaBadge: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
  refreshBadge: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  metaText: { color: '#1E3A5F', fontWeight: 'bold', fontSize: 10 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  circleArrow: { backgroundColor: '#1E3A5F', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
  // Activity Table
  activitySection: { marginBottom: 15 },
  activityHeader: { backgroundColor: '#1E3A5F', padding: 12, borderTopLeftRadius: 15, borderTopRightRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  activityHeaderText: { color: '#FFF', fontWeight: 'bold', marginRight: 8, fontSize: 12 },
  activityTable: { backgroundColor: '#FFF', borderBottomLeftRadius: 15, borderBottomRightRadius: 15, padding: 15 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1E3A5F', padding: 10, borderRadius: 8, marginBottom: 5 },
  tableHeaderText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', alignItems: 'center' },
  liveRow: { backgroundColor: '#E8F5E9' },
  tableText: { fontSize: 12, color: '#1E3A5F' },
  columnSmall: { width: 50, alignItems: 'center', justifyContent: 'center' },
  columnCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  idText: { fontSize: 12, color: '#1E3A5F', fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 10, fontWeight: 'bold' },
  emptyRow: { padding: 20, alignItems: 'center' },
  emptyText: { color: '#999', fontStyle: 'italic' },
});