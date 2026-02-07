import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faHouse, faChartBar, faCamera, faUserGear, faPersonWalking, faCircleQuestion, faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons';

const SidebarMenu = ({ isOpen, onClose, setScreen, onLogoutPress }) => {
  const menuItems = [
    { id: 1, icon: faHouse, label: 'Home', screen: 'Home' },
    { id: 2, icon: faChartBar, label: 'System Logs', screen: 'Logs' },
    { id: 3, icon: faCamera, label: 'Cameras', screen: 'Cameras' },
    { id: 4, icon: faUserGear, label: 'Resident Info', screen: 'Resident' },
    { id: 5, icon: faPersonWalking, label: 'Gait Analysis', screen: 'Gait' },
    { id: 6, icon: faCircleQuestion, label: 'FAQs', screen: 'FAQs' },
    { id: 7, icon: faGear, label: 'Settings', screen: 'Settings' },
  ];

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sidebar}>
          <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <View style={styles.sidebarHeader}>
               <Image source={require('../../assets/sidebarlogo.png')} style={styles.sidebarLogo} resizeMode="contain" fadeDuration={0} />
            </View>
            <ScrollView style={styles.menuContainer}>
              {menuItems.map((item) => (
                <TouchableOpacity key={item.id} style={styles.menuItem} onPress={() => { setScreen(item.screen); onClose(); }}>
                  <View style={styles.menuIconContainer}><FontAwesomeIcon icon={item.icon} color="#FFFFFF" size={18} /></View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.logoutButton} onPress={() => { onClose(); onLogoutPress(); }}>
              <Text style={styles.logoutText}>LOGOUT</Text>
              <FontAwesomeIcon icon={faRightFromBracket} color="#1E3A5F" size={16} />
            </TouchableOpacity>
          </SafeAreaView>
        </View>
        <TouchableOpacity style={{flex: 1}} activeOpacity={1} onPress={onClose} />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)' },
  sidebar: { width: 260, backgroundColor: '#1E3A5F' },
  sidebarHeader: { padding: 40, alignItems: 'center' },
  sidebarLogo: { width: 150, height: 150 },
  menuItem: { flexDirection: 'row', padding: 18, alignItems: 'center' },
  menuLabel: { color: '#FFF', marginLeft: 15, fontWeight: '600' },
  logoutButton: { backgroundColor: '#FFF', margin: 20, padding: 12, borderRadius: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  logoutText: { color: '#1E3A5F', fontWeight: 'bold', marginRight: 10 },
});

export default SidebarMenu;