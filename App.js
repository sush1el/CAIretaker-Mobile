import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
// 1. Import from the new library
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Dashboard from './src/pages/Dashboard';
import Monitoring from './src/pages/Monitoring';
import Logs from './src/pages/Logs';

const App = () => {
  const [currentTab, setCurrentTab] = useState('dashboard');

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard': return <Dashboard />;
      case 'monitoring': return <Monitoring />;
      case 'logs': return <Logs />;
      default: return <Dashboard />;
    }
  };

  return (
    // 2. Wrap the entire app in SafeAreaProvider
    <SafeAreaProvider>
      {/* 3. Use the new SafeAreaView. 'edges' ensures we only pad the top/sides, not the bottom navigation */}
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>

        {/* 4. Fix status bar color so text is dark (visible on light backgrounds) */}
        <StatusBar barStyle="light-content" backgroundColor="#2c3e50" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>CAIretaker</Text>
        </View>

        {/* Main Content Area */}
        <View style={styles.content}>
          {renderContent()}
        </View>

        {/* Bottom Navigation Tab */}
        <View style={styles.tabBar}>
          <TabButton
            title="Dashboard"
            isActive={currentTab === 'dashboard'}
            onPress={() => setCurrentTab('dashboard')}
          />
          <TabButton
            title="Monitoring"
            isActive={currentTab === 'monitoring'}
            onPress={() => setCurrentTab('monitoring')}
          />
          <TabButton
            title="Logs"
            isActive={currentTab === 'logs'}
            onPress={() => setCurrentTab('logs')}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
};

const TabButton = ({ title, isActive, onPress }) => (
  <TouchableOpacity
    style={[styles.tabItem, isActive && styles.activeTab]}
    onPress={onPress}
  >
    <Text style={[styles.tabText, isActive && styles.activeTabText]}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2c3e50' // Matches header color to blend with status bar
  },
  header: {
    height: 60,
    backgroundColor: '#2c3e50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  content: {
    flex: 1,
    backgroundColor: '#f0f2f5' // Content background
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  tabItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  activeTab: { borderTopWidth: 3, borderTopColor: '#1890ff' },
  tabText: { color: '#666' },
  activeTabText: { color: '#1890ff', fontWeight: 'bold' },
});

export default App;