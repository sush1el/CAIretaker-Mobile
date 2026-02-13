import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import api from '../services/api';

export default function Logs() {
  const [allLogs, setAllLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roomFilter, setRoomFilter] = useState(null); // null = all rooms, 1/2/3 = specific room
  const [sortType, setSortType] = useState('latestDate'); // latestDate, latestTime, oldestDate, oldestTime
  const [showSortDropdown, setShowSortDropdown] = useState(false);

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
        
        // Transform fall events to log format - only falls
        // Columns: Room No, Status, Date, Time
        const transformedLogs = fallEvents
          .filter(event => event.type === 'fall')
          .map((event, index) => {
            const roomNum = event.location ? event.location.replace(/\D/g, '') || '1' : '1';
            const eventDate = event.timestamp ? new Date(event.timestamp * 1000) : new Date();
            
            return {
              id: event.id || index,
              roomNo: `Room ${roomNum}`,
              roomNum: parseInt(roomNum),
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
      setRoomFilter(null);
    } else {
      setRoomFilter(room);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E3A5F" />
        <Text style={styles.loadingText}>Loading logs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>FULL SYSTEM LOGS</Text>
      </View>

      {/* Filter Bar: Pagination on left, Sort dropdown on right */}
      <View style={styles.filterBar}>
        {/* Room Pagination */}
        <View style={styles.pagination}>
          {[1, 2, 3].map((room) => (
            <TouchableOpacity 
              key={room} 
              style={[
                styles.paginationItem,
                room === 1 && styles.paginationFirst,
                room === 3 && styles.paginationLast,
                roomFilter === room && styles.paginationActive
              ]}
              onPress={() => handleRoomFilter(room)}
            >
              <Text style={[
                styles.paginationText,
                roomFilter === room && styles.paginationTextActive
              ]}>Room {room}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Sort Dropdown */}
        <View style={styles.sortDropdownContainer}>
          <TouchableOpacity 
            style={styles.sortDropdown}
            onPress={() => setShowSortDropdown(!showSortDropdown)}
          >
            <Text style={styles.sortDropdownText}>{currentSortLabel}</Text>
            <FontAwesomeIcon icon={faChevronDown} size={12} color="#1E3A5F" />
          </TouchableOpacity>
          
          {showSortDropdown && (
            <View style={styles.sortDropdownMenu}>
              {sortOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sortDropdownItem,
                    sortType === option.value && styles.sortDropdownItemActive
                  ]}
                  onPress={() => {
                    setSortType(option.value);
                    setShowSortDropdown(false);
                  }}
                >
                  <Text style={[
                    styles.sortDropdownItemText,
                    sortType === option.value && styles.sortDropdownItemTextActive
                  ]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Table */}
      <View style={styles.tableContainer}>
        {/* Header Row */}
        <View style={styles.headerRow}>
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
        </View>

        {/* Log Rows */}
        <ScrollView style={styles.scrollContainer}>
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <View key={index} style={[styles.row, index % 2 === 0 && styles.rowEven]}>
                <View style={styles.columnCenter}>
                  <Text style={styles.cellText}>{log.roomNo}</Text>
                </View>
                <View style={styles.columnCenter}>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{log.status}</Text>
                  </View>
                </View>
                <View style={styles.columnCenter}>
                  <Text style={styles.cellText}>{log.date}</Text>
                </View>
                <View style={styles.columnCenter}>
                  <Text style={styles.cellText}>{log.time}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No fall events logged</Text>
              <Text style={styles.emptySubtext}>Fall events will appear here when detected</Text>
            </View>
          )}
        </ScrollView>
      </View>
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
  titleContainer: {
    backgroundColor: '#1E3A5F',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 15,
    alignItems: 'center',
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
});