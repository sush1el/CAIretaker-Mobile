import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPersonWalking, faMagnifyingGlass, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { faCircleUser } from '@fortawesome/free-regular-svg-icons';

export default function Gait({ monitoringRoom }) {
  return (
    <View>
      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>GAIT PERFORMANCE</Text>
        <FontAwesomeIcon icon={faPersonWalking} color="#1E3A5F" size={18}/>
      </View>

      <View style={styles.gaitSearchCard}>
        <View style={styles.searchBar}>
            <FontAwesomeIcon icon={faMagnifyingGlass} color="#999" size={14} style={{marginRight: 8}}/>
            <TextInput style={styles.searchInput} placeholder="Search Resident ID..." placeholderTextColor="#999" />
        </View>
        <View style={styles.dateSelectorRow}>
            <Text style={styles.dateLabel}>Analysis Date: </Text>
            <TouchableOpacity style={styles.datePickerBtn}>
                <Text style={styles.dateText}>Feb 07, 2026</Text>
                <FontAwesomeIcon icon={faRotateRight} color="#1E3A5F" size={12} style={{marginLeft: 5}}/>
            </TouchableOpacity>
        </View>
      </View>

      <View style={styles.residentGaitHeader}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <FontAwesomeIcon icon={faCircleUser} color="#1E3A5F" size={35}/>
            <View style={{marginLeft: 12}}>
                <Text style={styles.residentIdLabel}>ANALYZING</Text>
                <Text style={styles.residentIdValue}>{monitoringRoom === 1 ? 'R-001' : monitoringRoom === 2 ? 'R-005' : 'R-012'}</Text>
            </View>
        </View>
        <View style={styles.stabilityBadge}>
            <Text style={styles.stabilityText}>STABLE</Text>
        </View>
      </View>

      <View style={styles.analyticsRow}>
        <View style={styles.statBox}>
            <Text style={styles.statLabel}>Avg Speed</Text>
            <Text style={styles.statValue}>0.92</Text>
            <Text style={styles.statSubText}>m/s (Normal)</Text>
        </View>
        <View style={styles.statBox}>
            <Text style={styles.statLabel}>Stability</Text>
            <Text style={styles.statValue}>88%</Text>
            <Text style={styles.statSubText}>Symmetry Match</Text>
        </View>
      </View>

      <View style={styles.chartPlaceholder}>
        <Text style={styles.chartTitle}>Step Symmetry Tracking</Text>
        <View style={styles.symmetryItem}>
            <Text style={styles.symLabel}>Left Foot Swing</Text>
            <View style={styles.symBarBackground}><View style={[styles.symBarFill, {width: '85%'}]}/></View>
        </View>
        <View style={styles.symmetryItem}>
            <Text style={styles.symLabel}>Right Foot Swing</Text>
            <View style={styles.symBarBackground}><View style={[styles.symBarFill, {width: '70%', backgroundColor: '#FBC02D'}]}/></View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  gaitSearchCard: { backgroundColor: '#FFF', padding: 15, borderRadius: 20, marginBottom: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 8, borderRadius: 10, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 12, color: '#333' },
  dateSelectorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dateLabel: { fontSize: 12, color: '#666', fontWeight: 'bold' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4F7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  dateText: { fontSize: 12, color: '#1E3A5F', fontWeight: 'bold' },
  residentGaitHeader: { backgroundColor: '#FFF', padding: 15, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#1E3A5F' },
  residentIdLabel: { fontSize: 10, color: '#666', fontWeight: 'bold' },
  residentIdValue: { fontSize: 18, fontWeight: '900', color: '#1E3A5F' },
  stabilityBadge: { backgroundColor: '#C8E6C9', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15 },
  stabilityText: { color: '#2E7D32', fontSize: 10, fontWeight: 'bold' },
  analyticsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  statBox: { backgroundColor: '#FFF', flex: 1, marginHorizontal: 5, padding: 15, borderRadius: 15, alignItems: 'center' },
  statLabel: { fontSize: 10, color: '#666', fontWeight: 'bold' },
  statValue: { fontSize: 24, fontWeight: '900', color: '#1E3A5F', marginVertical: 4 },
  statSubText: { fontSize: 10, color: '#777' },
  chartPlaceholder: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, marginBottom: 15 },
  chartTitle: { fontWeight: 'bold', color: '#1E3A5F', fontSize: 14, marginBottom: 10 },
  symmetryItem: { marginBottom: 15 },
  symLabel: { fontSize: 11, color: '#1E3A5F', marginBottom: 5, fontWeight: '600' },
  symBarBackground: { height: 10, backgroundColor: '#F5F5F5', borderRadius: 5, overflow: 'hidden' },
  symBarFill: { height: '100%', backgroundColor: '#7CB342' },
});