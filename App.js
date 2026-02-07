import React, { useState } from 'react';
import {
  View,

  TouchableOpacity,
  ScrollView,
  StyleSheet,
  
  Image,
  
  StatusBar,
  
} from 'react-native';

import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';

import { 
  

  faRightFromBracket, 
  faBars,
  
} from '@fortawesome/free-solid-svg-icons';



// Components
import SidebarMenu from './src/components/SidebarMenu';
import ConfirmModal from './src/components/ConfirmModal';

// Pages
import Home from './src/pages/Home';
import Cameras from './src/pages/Cameras';
import Resident from './src/pages/Resident';
import Gait from './src/pages/Gait';
import FAQs from './src/pages/FAQs';
import Settings from './src/pages/Settings';
import LiveView from './src/pages/LiveView';
import Logs from './src/pages/Logs';

export default function App() {
  // Navigation State
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // Global App Data & State
  const [monitoringRoom, setMonitoringRoom] = useState(1);
  const [highSensitivity, setHighSensitivity] = useState(true);
  const [privacyMask, setPrivacyMask] = useState(false);
  
  // Modals
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);

  // Data
  const [logs, setLogs] = useState([
    { id: 1, residentId: 'R-001', time: '12:45', location: 'ROOM 1' },
    { id: 2, residentId: 'R-005', time: '1:05', location: 'ROOM 2' },
    { id: 3, residentId: 'R-012', time: '1:20', location: 'ROOM 1' },
    { id: 4, residentId: 'R-009', time: '1:35', location: 'ROOM 3' },
  ]);

  const residents = [
    { id: 'R-001', name: 'Juan Dela Cruz', age: 78, room: '1', risk: 'High' },
    { id: 'R-005', name: 'Maria Santos', age: 82, room: '2', risk: 'Medium' },
    { id: 'R-012', name: 'Antonio Luna', age: 75, room: '1', risk: 'Low' },
  ];

  const faqs = [
    { q: "How does the AI detect falls?", a: "CAIretaker uses computer vision to track body skeleton points locally on the Raspberry Pi." },
    { q: "Is the video data private?", a: "Yes. All processing happens on the edge. No cloud uploads occur by default." },
  ];

  // Actions
  const handleDeleteLog = () => {
    setLogs(logs.filter(log => log.id !== logToDelete));
    setShowDeleteConfirm(false);
  };

  const requestDeleteLog = (id) => {
    setLogToDelete(id);
    setShowDeleteConfirm(true);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Home': 
        return <Home 
          logs={logs} 
          setScreen={setCurrentScreen} 
          setMonitoringRoom={setMonitoringRoom} 
          requestDeleteLog={requestDeleteLog}
          setLogs={setLogs} // For clearing logs
        />;
      case 'Cameras': 
        return <Cameras setScreen={setCurrentScreen} setMonitoringRoom={setMonitoringRoom} />;
      case 'Resident': 
        return <Resident residents={residents} />;
      case 'Gait': 
        return <Gait monitoringRoom={monitoringRoom} />;
      case 'FAQs': 
        return <FAQs faqs={faqs} />;
      case 'Settings': 
        return <Settings 
          highSensitivity={highSensitivity} setHighSensitivity={setHighSensitivity}
          privacyMask={privacyMask} setPrivacyMask={setPrivacyMask}
        />;
      case 'LiveView': 
        return <LiveView 
          monitoringRoom={monitoringRoom} 
          setMonitoringRoom={setMonitoringRoom}
          logs={logs}
          requestDeleteLog={requestDeleteLog}
          setLogs={setLogs}
        />;
      case 'Logs': 
        return <Logs logs={logs} requestDeleteLog={requestDeleteLog} setLogs={setLogs} />;
      default: 
        return <Home logs={logs} setScreen={setCurrentScreen} setMonitoringRoom={setMonitoringRoom} requestDeleteLog={requestDeleteLog} setLogs={setLogs} />;
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSidebarOpen(true)} style={styles.navIcon}>
            <FontAwesomeIcon icon={faBars} color="#1E3A5F" size={24} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCurrentScreen('Home')} activeOpacity={0.8} style={styles.logoContainer}>
            <Image source={require('./assets/LANDSCAPE_LOGO.png')} style={styles.headerLogo} resizeMode="contain" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowLogoutConfirm(true)} style={styles.navIcon}>
            <FontAwesomeIcon icon={faRightFromBracket} color="#1E3A5F" size={24} />
          </TouchableOpacity>
        </View>

        {/* Main Content */}
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderScreen()}
        </ScrollView>

        {/* Global Components */}
        <SidebarMenu 
          isOpen={isSidebarOpen} 
          onClose={() => setSidebarOpen(false)} 
          setScreen={setCurrentScreen} 
          onLogoutPress={() => setShowLogoutConfirm(true)} 
        />
        <ConfirmModal 
          isOpen={showLogoutConfirm} 
          title="Logout of CAIretaker?" 
          onCancel={() => setShowLogoutConfirm(false)} 
          onConfirm={() => setShowLogoutConfirm(false)} 
        />
        <ConfirmModal 
          isOpen={showDeleteConfirm} 
          title="Delete this log entry?" 
          onCancel={() => setShowDeleteConfirm(false)} 
          onConfirm={handleDeleteLog} 
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F4F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', height: 80, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerLogo: { height: 150, width: 150 },
  logoContainer: { flex: 1, alignItems: 'center' },
  navIcon: { width: 40, alignItems: 'center' },
  scrollContent: { padding: 20 },
});