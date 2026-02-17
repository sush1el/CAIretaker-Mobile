import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCamera, faTriangleExclamation, faExclamationCircle, faChevronDown, faPersonWalking } from '@fortawesome/free-solid-svg-icons';
import { WebView } from 'react-native-webview';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function Home({ setScreen, setMonitoringRoom }) {
  const { theme, isDarkMode } = useTheme();
  const [hasActiveFall, setHasActiveFall] = useState(false);
  const [activeFallCount, setActiveFallCount] = useState(0);
  const [fallEvents, setFallEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState(null); // null = all rooms, 1/2/3 = specific room
  const [sortType, setSortType] = useState('latestDate'); // latestDate, latestTime, oldestDate, oldestTime
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now()); // Force re-render on updates
  const isPolling = useRef(false);

  // Fetch residents and fall events on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Poll for active falls every 500ms for real-time updates
  useEffect(() => {
    let mounted = true;
    
    const checkFalls = async () => {
      // Prevent overlapping requests
      if (isPolling.current) return;
      isPolling.current = true;
      
      try {
        let hasLiveFall = false;
        let liveFallCount = 0;
        
        // Check camera status for real-time detections - PRIMARY source for status
        const statusResult = await api.getCameraStatus();
        if (mounted && statusResult.ok) {
          const detections = statusResult.data.detections || [];
          // Check both is_fall and is_fallen for compatibility
          hasLiveFall = detections.some(d => d.is_fall || d.is_fallen);
          liveFallCount = detections.filter(d => d.is_fall || d.is_fallen).length;
          
          // Also check has_active_fall from status if available
          if (statusResult.data.has_active_fall) {
            hasLiveFall = true;
            liveFallCount = Math.max(liveFallCount, 1);
          }
        }
        
        // The status indicator should ONLY reflect current camera detections
        if (mounted) {
          setHasActiveFall(hasLiveFall);
          setActiveFallCount(liveFallCount);
          setLastUpdate(Date.now()); // Force re-render
        }
        
        // Refresh fall events for logs - this includes historical data from database
        const eventsResult = await api.getFallEvents();
        if (mounted && eventsResult.ok) {
          const events = eventsResult.data.events || eventsResult.data.incidents || [];
          setFallEvents([...events]); // Create new array to ensure state update
        }
      } catch (error) {
        console.log('Error checking falls:', error);
      } finally {
        isPolling.current = false;
      }
    };

    checkFalls();
    const interval = setInterval(checkFalls, 500); // Poll every 500ms for real-time updates
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch fall events
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

  // Create logs from fall events - ONLY include confirmed Fall events
  // Columns: ID, Room No, Status, Date, Time
  const recentLogs = fallEvents
    .filter(event => {
      // Filter to only include fall events (not at-risk/abnormal gait until gait analysis is implemented)
      const isFall = event.class?.toLowerCase().includes('fall') || event.class?.toLowerCase().includes('fallen') || event.type === 'fall' || event.status === 'active';
      if (!isFall) return false;
      
      // Apply room filter
      if (roomFilter !== null) {
        const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
        if (parseInt(roomNum) !== roomFilter) return false;
      }
      
      return true;
    })
    .map((event, index) => {
      // Extract room number from location (e.g., "Room 1" -> "1")
      const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
      const eventDate = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
      
      return {
        incidentId: event.id || index,
        roomNo: `Room ${roomNum}`,
        status: 'Fall',
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
      // Sort based on sortType
      const dateA = a.eventDate || new Date(0);
      const dateB = b.eventDate || new Date(0);
      
      switch (sortType) {
        case 'latestDate':
          // Sort by date descending (newest first), then by time descending
          return dateB - dateA;
        case 'latestTime':
          // Sort by time of day descending (latest time first)
          const timeA1 = dateA.getHours() * 60 + dateA.getMinutes();
          const timeB1 = dateB.getHours() * 60 + dateB.getMinutes();
          return timeB1 - timeA1;
        case 'oldestDate':
          // Sort by date ascending (oldest first)
          return dateA - dateB;
        case 'oldestTime':
          // Sort by time of day ascending (earliest time first)
          const timeA2 = dateA.getHours() * 60 + dateA.getMinutes();
          const timeB2 = dateB.getHours() * 60 + dateB.getMinutes();
          return timeA2 - timeB2;
        default:
          return dateB - dateA;
      }
    });

  // Sort options
  const sortOptions = [
    { value: 'latestDate', label: 'Latest by Date' },
    { value: 'latestTime', label: 'Latest by Time' },
    { value: 'oldestDate', label: 'Oldest by Date' },
    { value: 'oldestTime', label: 'Oldest by Time' },
  ];

  const currentSortLabel = sortOptions.find(opt => opt.value === sortType)?.label || 'Latest by Date';

  // Toggle room filter
  const handleRoomFilter = (room) => {
    if (roomFilter === room) {
      setRoomFilter(null); // Deselect if already selected
    } else {
      setRoomFilter(room);
    }
  };

  // Dynamic styles based on theme
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    roomGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.primary, padding: 12, borderRadius: 20, marginBottom: 20 },
    roomBtn: { backgroundColor: theme.card, padding: 15, borderRadius: 15, flex: 1, marginHorizontal: 5, alignItems: 'center' },
    roomBtnLabel: { fontSize: 10, color: theme.text, fontWeight: 'bold' },
    roomBtnNum: { fontSize: 24, fontWeight: '900', color: theme.text },
    statusCard: { backgroundColor: theme.card, padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    statusCardText: { fontSize: 18, fontWeight: '700', color: '#7CB342' },
    gaitStatusCard: { backgroundColor: theme.card, padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: isDarkMode ? '#3a4a5a' : '#E8F4F8', borderStyle: 'dashed' },
    pagination: { flexDirection: 'row', backgroundColor: isDarkMode ? theme.card : '#E0E0E0', borderRadius: 8, overflow: 'hidden' },
    paginationText: { color: theme.text, fontWeight: '600', fontSize: 11 },
    sortDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDarkMode ? theme.card : '#E0E0E0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    sortDropdownText: { color: theme.primary, fontWeight: '600', fontSize: 11, marginRight: 6 },
    sortDropdownMenu: { position: 'absolute', top: '100%', right: 0, backgroundColor: theme.card, borderRadius: 8, marginTop: 4, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, minWidth: 140 },
    sortDropdownItemText: { color: theme.text, fontSize: 11 },
    logsContainer: { backgroundColor: theme.card, borderRadius: 15, overflow: 'hidden' },
    logHeaderRow: { flexDirection: 'row', backgroundColor: theme.primary, padding: 12, alignItems: 'center' },
    logRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: isDarkMode ? '#3a4a5a' : '#EEE', alignItems: 'center' },
    logText: { color: theme.text, fontSize: 11 },
    loadingContainer: { backgroundColor: theme.card, padding: 20, borderRadius: 15, alignItems: 'center' },
    loadingText: { color: theme.textSecondary, marginTop: 10 },
    emptyState: { backgroundColor: theme.card, padding: 30, borderRadius: 15, alignItems: 'center' },
    emptyStateText: { color: theme.textSecondary, fontWeight: '600', fontSize: 16 },
    emptyStateSubtext: { color: theme.textSecondary, marginTop: 5, fontSize: 12 },
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>SELECT CAMERA</Text>
        <FontAwesomeIcon icon={faCamera} color={theme.text} size={16}/>
      </View>
      <View style={dynamicStyles.roomGrid}>
        {[1, 2, 3].map(r => (
          <TouchableOpacity key={r} style={dynamicStyles.roomBtn} onPress={() => { setMonitoringRoom(r); setScreen('LiveView'); }}>
            <Text style={dynamicStyles.roomBtnLabel}>ROOM</Text>
            <Text style={dynamicStyles.roomBtnNum}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>LIVE FALL ALERTS</Text>
        <FontAwesomeIcon icon={faTriangleExclamation} color={theme.text} size={16}/>
      </View>
      
      {/* Fall Alert Status Card */}
      <View style={[dynamicStyles.statusCard, hasActiveFall && styles.statusCardAlert]}>
        <View style={[styles.statusDot, hasActiveFall && styles.redDot]} />
        <Text style={[dynamicStyles.statusCardText, hasActiveFall && styles.statusCardTextAlert]}>
          {hasActiveFall ? `Active Fall${activeFallCount > 1 ? 's' : ''} Detected!` : 'No Active Falls'}
        </Text>
        {hasActiveFall && (
          <FontAwesomeIcon icon={faExclamationCircle} color="#D32F2F" size={20} style={{marginLeft: 10}} />
        )}
      </View>

      {/* Live Gait Alerts Placeholder */}
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>LIVE GAIT ALERTS</Text>
        <FontAwesomeIcon icon={faPersonWalking} color={theme.text} size={16}/>
      </View>
      
      {/* Gait Alert Status Card - Placeholder */}
      <View style={dynamicStyles.gaitStatusCard}>
        <View style={styles.gaitStatusDot} />
        <Text style={styles.gaitStatusCardText}>No Bad Gait Alerts</Text>
      </View>

      {/* Recent Logs Section */}
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>RECENT LOGS</Text>
      </View>
      
      {/* Filter Bar: Pagination on left, Sort dropdown on right */}
      <View style={styles.filterBar}>
        {/* Room Pagination */}
        <View style={dynamicStyles.pagination}>
          {[1, 2, 3].map((room) => (
            <TouchableOpacity 
              key={room} 
              style={[
                styles.paginationItem,
                room === 1 && styles.paginationFirst,
                room === 3 && styles.paginationLast,
                roomFilter === room && { backgroundColor: theme.primary }
              ]}
              onPress={() => handleRoomFilter(room)}
            >
              <Text style={[
                dynamicStyles.paginationText,
                roomFilter === room && styles.paginationTextActive
              ]}>Room {room}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort Dropdown */}
        <View style={styles.sortDropdownContainer}>
          <TouchableOpacity 
            style={dynamicStyles.sortDropdown}
            onPress={() => setShowSortDropdown(!showSortDropdown)}
          >
            <Text style={dynamicStyles.sortDropdownText}>{currentSortLabel}</Text>
            <FontAwesomeIcon icon={faChevronDown} size={12} color={theme.primary} />
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

      {/* Recent Logs List - Room No, Status, Date, Time */}
      {isLoading ? (
        <View style={dynamicStyles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={dynamicStyles.loadingText}>Loading logs...</Text>
        </View>
      ) : recentLogs.length > 0 ? (
        <View style={dynamicStyles.logsContainer}>
          {/* Header Row */}
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
          
          {/* Log Rows */}
          {recentLogs.slice(0, 10).map((log, index) => (
            <View key={`log-${index}-${log.incidentId || 'no-id'}-${log.date}-${log.time}`} style={dynamicStyles.logRow}>
              <View style={styles.columnCenter}>
                <Text style={dynamicStyles.logText}>{log.roomNo}</Text>
              </View>
              <View style={styles.columnCenter}>
                <View style={[styles.tagBadge, styles.tagFall]}>
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
          <Text style={dynamicStyles.emptyStateSubtext}>Fall events and Abnormal Gait will appear here</Text>
        </View>
      )}
      
      {/* Hidden WebView to keep camera stream active for real-time detection */}
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
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  roomGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#1E3A5F', padding: 12, borderRadius: 20, marginBottom: 20 },
  roomBtn: { backgroundColor: '#FFF', padding: 15, borderRadius: 15, flex: 1, marginHorizontal: 5, alignItems: 'center' },
  roomBtnLabel: { fontSize: 10, color: '#1E3A5F', fontWeight: 'bold' },
  roomBtnNum: { fontSize: 24, fontWeight: '900', color: '#1E3A5F' },
  statusCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  statusCardAlert: { backgroundColor: '#FFEBEE', borderWidth: 2, borderColor: '#D32F2F' },
  statusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#7CB342', marginRight: 10 },
  redDot: { backgroundColor: '#D32F2F' },
  statusCardText: { fontSize: 18, fontWeight: '700', color: '#7CB342' },
  statusCardTextAlert: { color: '#D32F2F' },
  // Gait Status Card (Placeholder)
  gaitStatusCard: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#E8F4F8', borderStyle: 'dashed' },
  gaitStatusDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#7CB342', marginRight: 10 },
  gaitStatusCardText: { fontSize: 18, fontWeight: '700', color: '#7CB342' },
  // Filter Bar
  filterBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
  // Pagination Style
  pagination: { flexDirection: 'row', backgroundColor: '#E0E0E0', borderRadius: 8, overflow: 'hidden' },
  paginationItem: { paddingHorizontal: 12, paddingVertical: 8, borderRightWidth: 1, borderRightColor: '#CCC' },
  paginationFirst: { borderTopLeftRadius: 8, borderBottomLeftRadius: 8 },
  paginationLast: { borderTopRightRadius: 8, borderBottomRightRadius: 8, borderRightWidth: 0 },
  paginationActive: { backgroundColor: '#1E3A5F' },
  paginationText: { color: '#333', fontWeight: '600', fontSize: 11 },
  paginationTextActive: { color: '#FFF' },
  // Sort Dropdown
  sortDropdownContainer: { position: 'relative', zIndex: 100 },
  sortDropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E0E0E0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  sortDropdownText: { color: '#1E3A5F', fontWeight: '600', fontSize: 11, marginRight: 6 },
  sortDropdownMenu: { position: 'absolute', top: '100%', right: 0, backgroundColor: '#FFF', borderRadius: 8, marginTop: 4, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, minWidth: 140 },
  sortDropdownItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  sortDropdownItemActive: { backgroundColor: '#E8F4FD' },
  sortDropdownItemText: { color: '#333', fontSize: 11 },
  sortDropdownItemTextActive: { color: '#1E3A5F', fontWeight: '600' },
  // Logs Container
  logsContainer: { backgroundColor: '#FFF', borderRadius: 15, overflow: 'hidden' },
  logHeaderRow: { flexDirection: 'row', backgroundColor: '#1E3A5F', padding: 12, alignItems: 'center' },
  logHeaderText: { color: '#FFF', fontWeight: 'bold', fontSize: 11 },
  logRow: { flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: '#EEE', alignItems: 'center' },
  logText: { color: '#333', fontSize: 11 },
  columnCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  timeText: { color: '#999' },
  // Tag Badges
  tagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#EEE' },
  tagFall: { backgroundColor: '#D32F2F' },
  tagGait: { backgroundColor: '#FFF8E1' },
  tagText: { fontSize: 10, fontWeight: '600', color: '#FFF' },
  // Loading & Empty States
  loadingContainer: { backgroundColor: '#FFF', padding: 20, borderRadius: 15, alignItems: 'center' },
  loadingText: { color: '#666', marginTop: 10 },
  emptyState: { backgroundColor: '#FFF', padding: 30, borderRadius: 15, alignItems: 'center' },
  emptyStateText: { color: '#666', fontWeight: '600', fontSize: 16 },
  emptyStateSubtext: { color: '#999', marginTop: 5, fontSize: 12 },
  // Hidden stream for keeping detection active
  hiddenStream: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
});