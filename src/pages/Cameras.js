import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, StatusBar, useWindowDimensions } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faCirclePlay, faChevronLeft, faChevronRight, faArrowLeft, faRefresh, faVideoCamera, faExpand, faCompress } from '@fortawesome/free-solid-svg-icons';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const CAMERA_ASPECT_RATIO = 16 / 9;

export default function Cameras({ setScreen, setMonitoringRoom }) {
  const { theme, isDarkMode } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [cameraStatus, setCameraStatus] = useState(null);
  const [streamKey, setStreamKey] = useState(0);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Poll camera status when a room is selected
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

  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    cameraCard: { height: 130, backgroundColor: isDarkMode ? '#1a2a3a' : '#0D1B2E', borderRadius: 20, marginBottom: 15, padding: 15 },
    circleArrow: { backgroundColor: theme.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginHorizontal: 10 },
    // Inline camera feed dynamic styles
    backBadge: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    liveBadge: { backgroundColor: theme.primary, paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
    metaBadge: { backgroundColor: theme.card, paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20 },
    refreshBadge: { backgroundColor: theme.card, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    metaText: { color: theme.text, fontWeight: 'bold', fontSize: 10 },
    navArrow: { backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginHorizontal: 10 },
  };

  return (
    <View>
      {renderFullscreenModal()}
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>{selectedRoom ? 'LIVE MONITORING' : 'ACTIVE CAMERAS'}</Text>
        <FontAwesomeIcon icon={faCamera} color={theme.text} size={16} />
      </View>

      {selectedRoom === null ? (
        /* Camera selection cards */
        <>
          {[1, 2, 3, 4].map(r => (
            <View key={r} style={dynamicStyles.cameraCard}>
              <Text style={styles.cameraCardTitle}>ROOM #{r}</Text>
              <TouchableOpacity style={styles.playBtn} onPress={() => { setSelectedRoom(r); setMonitoringRoom(r); }}>
                <FontAwesomeIcon icon={faCirclePlay} color="rgba(255,255,255,0.4)" size={60} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.paginationRow}>
            <TouchableOpacity style={dynamicStyles.circleArrow}><FontAwesomeIcon icon={faChevronLeft} color="#FFF" /></TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.circleArrow}><FontAwesomeIcon icon={faChevronRight} color="#FFF" /></TouchableOpacity>
          </View>
        </>
      ) : (
        /* Inline camera feed */
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
              <Text style={dynamicStyles.metaText}>FPS: {liveFps}</Text>
            </View>
          </View>
          {renderInlineCameraFeed()}
          <View style={styles.paginationRow}>
            <TouchableOpacity style={dynamicStyles.navArrow} onPress={() => { const prev = selectedRoom <= 1 ? 4 : selectedRoom - 1; setSelectedRoom(prev); setMonitoringRoom(prev); setStreamKey(k => k + 1); }}>
              <FontAwesomeIcon icon={faChevronLeft} color="#FFF" size={12} />
              <Text style={styles.navArrowText}>Prev</Text>
            </TouchableOpacity>
            <TouchableOpacity style={dynamicStyles.navArrow} onPress={() => { const next = selectedRoom >= 4 ? 1 : selectedRoom + 1; setSelectedRoom(next); setMonitoringRoom(next); setStreamKey(k => k + 1); }}>
              <Text style={styles.navArrowText}>Next</Text>
              <FontAwesomeIcon icon={faChevronRight} color="#FFF" size={12} />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraCardTitle: { color: '#FFF', fontWeight: 'bold' },
  playBtn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15 },
  navArrowText: { color: '#FFF', fontWeight: 'bold', fontSize: 12, marginHorizontal: 4 },
  // Inline camera feed styles
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
  fullscreenOverlay: { flex: 1, backgroundColor: '#000' },
  fullscreenStreamContainer: { position: 'relative', flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  fullscreenFrame: { backgroundColor: '#000', overflow: 'hidden' },
  fullscreenStream: { flex: 1, backgroundColor: '#000' },
  fullscreenTopBar: { position: 'absolute', top: 15, left: 15, flexDirection: 'row', alignItems: 'center' },
  fullscreenLiveBadge: { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginRight: 10 },
  fullscreenLiveText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  fullscreenRoomText: { color: '#FFF', fontWeight: 'bold', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  fullscreenCloseButton: { position: 'absolute', bottom: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 14 },
});