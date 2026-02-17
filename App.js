import React, { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
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
  faSun,
  faMoon,

} from '@fortawesome/free-solid-svg-icons';

// Context
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// Components
import SidebarMenu from './src/components/SidebarMenu';
import ConfirmModal from './src/components/ConfirmModal';

// Pages
import Home from './src/pages/Home';
import Cameras from './src/pages/Cameras';
import FAQs from './src/pages/FAQs';
import Settings from './src/pages/Settings';
import LiveView from './src/pages/LiveView';
import Logs from './src/pages/Logs';
import UserManagement from './src/pages/UserManagement';

// Services
import api from './src/services/api';

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

function MainApp() {
  const router = useRouter();
  const { theme, isDarkMode, toggleTheme } = useTheme();

  // Navigation State
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  // User State (role will be set after login)
  const [userRole, setUserRole] = useState('user'); // Default role

  // Read user role from api service on mount
  useEffect(() => {
    const role = api.getUserRole();
    setUserRole(role);
  }, []);

  // Global App Data & State
  const [monitoringRoom, setMonitoringRoom] = useState(1);

  // Modals
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const faqs = [
    // Fall Detection
    { q: "How does the AI detect falls?", a: "CAIretaker uses computer vision to track body skeleton points locally on the Raspberry Pi." },
    { q: "What happens when a fall is detected?", a: "The system immediately logs the event, captures the moment, and sends an alert notification to all connected caretakers." },
    { q: "How accurate is the fall detection?", a: "Our AI model is trained on thousands of fall scenarios with high accuracy. False positives are minimized through pose estimation algorithms." },
    
    // Gait Analysis
    { q: "What is Gait Analysis?", a: "Gait Analysis monitors and analyzes walking patterns to detect irregularities that may indicate health concerns or fall risks." },
    { q: "How does bad gait detection work?", a: "The system tracks body posture, stride length, and balance while walking. Unusual patterns trigger a gait alert for review." },
    
    // Monitoring
    { q: "Can I monitor multiple rooms?", a: "Yes! CAIretaker supports multiple camera feeds. This feature is designed for future expansion to cover more areas." },
    
    // System & Hardware
    { q: "What hardware do I need?", a: "CAIretaker runs on a Raspberry Pi 5 with compatible USB or CSI cameras. A stable network connection is required." },
    { q: "How do I reboot the system?", a: "Go to Settings from the sidebar menu, then tap 'Reboot Hub' under the Hardware section." },
    
    // Privacy & Security
    { q: "Is the video data private?", a: "Yes. All processing happens on the edge. No cloud uploads occur by default." },
    { q: "How do I reset my password?", a: "On the login screen, tap 'Forgot Password', enter your registered email, and follow the OTP verification process." },
    { q: "Who can create new accounts?", a: "Only Super Admin users can create and manage accounts through the User Management feature in the sidebar." },
    
    // App Usage
    { q: "How do I view live camera feeds?", a: "Select a room from the home screen and tap on it to open the LiveView with real-time monitoring." },
    { q: "Where can I see past fall alerts?", a: "Check the Recent Logs section on the home screen or access the full history through the Logs feature." },
  ];

  // Actions
  const handleLogout = () => {
    console.log('🚪 Logging out...');
    setShowLogoutConfirm(false);
    setUserRole('user'); // Reset role on logout
    api.clearToken(); // Clear API token and user data
    router.replace('/login');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Home':
        return <Home
          setScreen={setCurrentScreen}
          setMonitoringRoom={setMonitoringRoom}
        />;
      case 'Cameras':
        return <Cameras setScreen={setCurrentScreen} setMonitoringRoom={setMonitoringRoom} />;
      case 'FAQs':
        return <FAQs faqs={faqs} />;
      case 'Settings':
        return <Settings />;
      case 'LiveView':
        return <LiveView
          monitoringRoom={monitoringRoom}
          setMonitoringRoom={setMonitoringRoom}
        />;
      case 'Logs':
        return <Logs />;
      case 'UserManagement':
        return <UserManagement />;
      default:
        return <Home setScreen={setCurrentScreen} setMonitoringRoom={setMonitoringRoom} />;
    }
  };

  // Dynamic styles based on theme
  const dynamicStyles = {
    container: { flex: 1, backgroundColor: theme.background },
    header: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      backgroundColor: theme.headerBg, 
      height: 80, 
      paddingHorizontal: 15, 
      borderBottomWidth: 1, 
      borderBottomColor: theme.headerBorder 
    },
    // Logo size - same for both modes
    headerLogo: { height: 200, width: 200 },
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={dynamicStyles.container} edges={['top']}>
        <StatusBar 
          barStyle={isDarkMode ? "light-content" : "dark-content"} 
          backgroundColor={theme.headerBg} 
        />

        {/* Header */}
        <View style={dynamicStyles.header}>
          <View style={styles.leftHeaderActions}>
            <TouchableOpacity onPress={() => setSidebarOpen(true)} style={styles.navIcon}>
              <FontAwesomeIcon icon={faBars} color={theme.textPrimary} size={24} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setCurrentScreen('Home')} activeOpacity={0.8} style={styles.logoContainer}>
            <Image 
              source={isDarkMode ? require('./assets/P1.png') : require('./assets/P2.png')} 
              style={dynamicStyles.headerLogo} 
              resizeMode="contain" 
            />
          </TouchableOpacity>
          <View style={styles.rightHeaderActions}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
              <FontAwesomeIcon 
                icon={isDarkMode ? faSun : faMoon} 
                color={isDarkMode ? '#FFD700' : theme.textPrimary} 
                size={20} 
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLogoutConfirm(true)} style={styles.navIcon}>
              <FontAwesomeIcon icon={faRightFromBracket} color={theme.textPrimary} size={24} />
            </TouchableOpacity>
          </View>
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
          userRole={userRole}
        />
        <ConfirmModal
          isOpen={showLogoutConfirm}
          title="Logout of CAIretaker?"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={handleLogout}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8F4F8' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', height: 80, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerLogo: { height: 180, width: 180 },
  logoContainer: { flex: 1, alignItems: 'center' },
  navIcon: { width: 40, alignItems: 'center' },
  leftHeaderActions: { flexDirection: 'row', alignItems: 'center', width: 80, marginTop: 2 },
  rightHeaderActions: { flexDirection: 'row', alignItems: 'center', width: 80, justifyContent: 'flex-end', marginTop: 2 },
  themeToggle: { marginRight: 10, padding: 5 },
  scrollContent: { padding: 20 },
});