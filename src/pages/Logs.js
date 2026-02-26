import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronDown, faChevronLeft, faChevronRight, faTrash, faFileExport } from '@fortawesome/free-solid-svg-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function Logs() {
  const { theme, isDarkMode } = useTheme();
  const [allLogs, setAllLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState(null); // null = all rooms, 1/2/3 = specific room
  const [sortType, setSortType] = useState('latestDate'); // latestDate, latestTime, oldestDate, oldestTime
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const ROWS_PER_PAGE = 10;

  useEffect(() => {
    fetchData();
    // Poll for updates every 3 seconds
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch fall events 
      const eventsResult = await api.getFallEvents();
      if (eventsResult.ok) {
        const fallEvents = eventsResult.data.events || [];

        // Transform fall events to log format — falls and gait alerts
        // Columns: Room No, Status, Date, Time
        const transformedLogs = fallEvents
          .filter(event => event.type === 'fall' || event.type === 'at_risk')
          .map((event, index) => {
            const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
            const eventDate = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
            const isGait = event.type === 'at_risk';

            return {
              id: event.id ?? event.incident_id ?? null,
              key: `${event.id ?? event.incident_id ?? index}-${event.timestamp ?? Date.now()}-${index}`,
              roomNo: `Room ${roomNum}`,
              roomNum: parseInt(roomNum),
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
          });

        setAllLogs(transformedLogs);
      }
    } catch (error) {
      console.log('Error fetching logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filtering and sorting
  const logs = allLogs
    .filter(log => roomFilter === null || log.roomNum === roomFilter)
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

  const totalPages = Math.max(1, Math.ceil(logs.length / ROWS_PER_PAGE));
  const paginatedLogs = logs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

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
    setCurrentPage(1);
    if (roomFilter === room) {
      setRoomFilter(null);
    } else {
      setRoomFilter(room);
    }
  };

  useEffect(() => {
    setCurrentPage(prev => Math.min(prev, totalPages));
  }, [totalPages]);

  const handleExportCSV = async () => {
    if (logs.length === 0) {
      Alert.alert('No Data', 'There are no logs to export.');
      return;
    }

    try {
      const header = 'Room No,Status,Date,Time\n';
      const rows = logs
        .map(log => `"${log.roomNo}","${log.status}","${log.date}","${log.time}"`)
        .join('\n');
      const csvContent = header + rows;

      const fileName = `fall_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      const fileUri = FileSystem.cacheDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: 'utf8',
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Not Available', 'Sharing is not supported on this device.');
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Fall Logs CSV',
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('CSV export error:', error);
      Alert.alert('Export Failed', 'An error occurred while exporting the logs.');
    }
  };

  const handleDeleteLog = (log) => {
    if (!log.id) {
      Alert.alert('Unable to Delete', 'This log does not have a valid incident ID.');
      return;
    }

    Alert.alert(
      'Delete Log',
      `Delete ${log.roomNo} fall log from ${log.date} ${log.time}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await api.deleteFallEvent(log.id);
            if (result.ok) {
              setAllLogs(prev => prev.filter(item => item.id !== log.id));
            } else {
              Alert.alert('Delete Failed', result.data?.error || 'Failed to delete log.');
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading logs...</Text>
      </View>
    );
  }

  // Dynamic styles based on theme
  const dynamicStyles = {
    titleContainer: {
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 25,
      marginBottom: 15,
      alignItems: 'center',
    },
    pagination: {
      flexDirection: 'row',
      backgroundColor: isDarkMode ? theme.card : '#E0E0E0',
      borderRadius: 8,
      overflow: 'hidden',
    },
    paginationText: {
      color: theme.text,
      fontWeight: '600',
      fontSize: 11,
    },
    sortDropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDarkMode ? theme.card : '#E0E0E0',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
    },
    sortDropdownText: {
      color: theme.primary,
      fontWeight: '600',
      fontSize: 11,
      marginRight: 6,
    },
    sortDropdownMenu: {
      position: 'absolute',
      top: '100%',
      right: 0,
      backgroundColor: theme.card,
      borderRadius: 8,
      marginTop: 4,
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      minWidth: 140,
    },
    sortDropdownItemText: {
      color: theme.text,
      fontSize: 11,
    },
    tableContainer: {
      backgroundColor: theme.card,
      borderRadius: 12,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    headerRow: {
      flexDirection: 'row',
      backgroundColor: theme.primary,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    row: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDarkMode ? '#3a4a5a' : '#E0E0E0',
      alignItems: 'center',
    },
    rowEven: {
      backgroundColor: isDarkMode ? '#1a2a3a' : '#F8F9FA',
    },
    cellText: {
      fontSize: 12,
      color: theme.text,
    },
  };

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={dynamicStyles.titleContainer}>
        <Text style={styles.title}>FULL SYSTEM LOGS</Text>
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
                    setCurrentPage(1);
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

      {/* Table */}
      <View style={dynamicStyles.tableContainer}>
        {/* Header Row */}
        <View style={dynamicStyles.headerRow}>
          <View style={styles.columnCenter}>
            <Text style={styles.headerText}>Room No</Text>
          </View>
          <View style={styles.columnCenter}>
            <Text style={styles.headerText}>Status</Text>
          </View>
          <View style={styles.columnCenter}>
            <Text style={styles.headerText}>Date</Text>
          </View>
          <View style={styles.columnCenter}>
            <Text style={styles.headerText}>Time</Text>
          </View>
          <View style={styles.columnAction}>
            <Text style={styles.headerText}>Action</Text>
          </View>
        </View>

        {/* Log Rows */}
        <ScrollView style={styles.scrollContainer}>
          {paginatedLogs.length > 0 ? (
            paginatedLogs.map((log, index) => (
              <View key={log.key} style={[dynamicStyles.row, index % 2 === 0 && dynamicStyles.rowEven]}>
                <View style={styles.columnCenter}>
                  <Text style={dynamicStyles.cellText}>{log.roomNo}</Text>
                </View>
                <View style={styles.columnCenter}>
                  <View style={[styles.statusBadge, log.eventType === 'at_risk' && styles.statusBadgeGait]}>
                    <Text style={styles.statusText}>{log.status}</Text>
                  </View>
                </View>
                <View style={styles.columnCenter}>
                  <Text style={dynamicStyles.cellText}>{log.date}</Text>
                </View>
                <View style={styles.columnCenter}>
                  <Text style={dynamicStyles.cellText}>{log.time}</Text>
                </View>
                <View style={styles.columnAction}>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteLog(log)}>
                    <FontAwesomeIcon icon={faTrash} size={12} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No events logged</Text>
              <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>Fall and gait events will appear here when detected</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Export CSV — compact, bottom right, above pagination */}
      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportButton, { backgroundColor: theme.primary }]}
          onPress={handleExportCSV}
        >
          <FontAwesomeIcon icon={faFileExport} size={13} color="#FFF" />
          <Text style={styles.exportButtonText}>Export CSV</Text>
        </TouchableOpacity>
      </View>

      {logs.length > 0 && (
        <View style={styles.paginationFooter}>
          <TouchableOpacity
            style={[styles.pageArrowButton, currentPage === 1 && styles.pageArrowDisabled]}
            disabled={currentPage === 1}
            onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          >
            <FontAwesomeIcon icon={faChevronLeft} size={12} color={currentPage === 1 ? theme.textSecondary : theme.primary} />
          </TouchableOpacity>

          <Text style={[styles.pageText, { color: theme.textSecondary }]}>
            Page {currentPage} of {totalPages}
          </Text>

          <TouchableOpacity
            style={[styles.pageArrowButton, currentPage === totalPages && styles.pageArrowDisabled]}
            disabled={currentPage === totalPages}
            onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          >
            <FontAwesomeIcon icon={faChevronRight} size={12} color={currentPage === totalPages ? theme.textSecondary : theme.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 50,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
  exportRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    marginBottom: 4,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  exportButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  titleContainer: {
    backgroundColor: '#1E3A5F',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 15,
    alignItems: 'center',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  exportButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Filter Bar
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  // Pagination Style
  pagination: {
    flexDirection: 'row',
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  paginationItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#CCC',
  },
  paginationFirst: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  paginationLast: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderRightWidth: 0,
  },
  paginationActive: {
    backgroundColor: '#1E3A5F',
  },
  paginationText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 11,
  },
  paginationTextActive: {
    color: '#FFF',
  },
  // Sort Dropdown
  sortDropdownContainer: {
    position: 'relative',
    zIndex: 100,
  },
  sortDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sortDropdownText: {
    color: '#1E3A5F',
    fontWeight: '600',
    fontSize: 11,
    marginRight: 6,
  },
  sortDropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginTop: 4,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    minWidth: 140,
  },
  sortDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  sortDropdownItemActive: {
    backgroundColor: '#E8F4FD',
  },
  sortDropdownItemText: {
    color: '#333',
    fontSize: 11,
  },
  sortDropdownItemTextActive: {
    color: '#1E3A5F',
    fontWeight: '600',
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  headerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  columnCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columnAction: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    maxHeight: 400,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    alignItems: 'center',
  },
  rowEven: {
    backgroundColor: '#F8F9FA',
  },
  cellText: {
    fontSize: 12,
    color: '#333',
  },
  statusBadge: {
    backgroundColor: '#D32F2F',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  statusBadgeGait: {
    backgroundColor: '#F57C00',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  deleteButton: {
    padding: 8,
  },
  paginationFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageArrowButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,58,95,0.08)',
  },
  pageArrowDisabled: {
    opacity: 0.45,
  },
  pageText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
  },
});