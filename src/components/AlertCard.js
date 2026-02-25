import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';

const AlertCard = ({ title, icon, mainValue, subText, isSafe, theme, isDarkMode }) => {
  const backgroundColor = theme.card; 
  const highlightColor = isSafe ? '#4CAF50' : '#FF3B30'; 
  const textColor = theme.text;
  const subTextColor = isDarkMode ? '#A0A0A0' : '#888888';

  // Animation for the "Live" dot
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isSafe) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSafe]);

  return (
    <View style={[
      styles.cardContainer, 
      { 
        backgroundColor, 
        borderColor: isSafe ? 'transparent' : 'rgba(255, 59, 48, 0.4)', 
        borderWidth: isSafe ? 0 : 1.5 
      }
    ]}>
      {/* 1. BACKGROUND WATERMARK (Opacity Increased Here) */}
      <View style={styles.watermarkContainer}>
        <FontAwesomeIcon 
          icon={icon} 
          size={110} 
          // Changed opacity: Green is now 0.15 (was 0.04), Red is now 0.25 (was 0.08)
          color={isSafe ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 59, 48, 0.25)'} 
        />
      </View>

      {/* 2. TOP ROW: Title & Status Pill */}
      <View style={styles.headerRow}>
        <Text style={[styles.cardTitle, { color: subTextColor }]}>{title.toUpperCase()}</Text>
        
        {/* Animated Status Pill */}
        <View style={[styles.statusPill, { backgroundColor: isSafe ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 59, 48, 0.12)' }]}>
          <Animated.View style={[
            styles.pulseDot, 
            { backgroundColor: highlightColor, transform: [{ scale: pulseAnim }] }
          ]} />
          <Text style={[styles.statusPillText, { color: highlightColor }]}>
            {isSafe ? 'Clear' : 'Alert'}
          </Text>
        </View>
      </View>

      {/* 3. BOTTOM CONTENT (Circle icon removed for a cleaner look) */}
      <View style={styles.dataContainer}>
        <View>
          <Text style={[styles.mainValueText, { color: highlightColor }]}>{mainValue}</Text>
          <Text style={[styles.subText, { color: subTextColor }]}>{subText}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
    borderRadius: 22,
    padding: 16,
    marginHorizontal: 6,
    elevation: 3, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    minHeight: 145,
    justifyContent: 'space-between',
    overflow: 'hidden', 
  },
  watermarkContainer: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    zIndex: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    flex: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dataContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 1,
    marginTop: 15,
  },
  mainValueText: {
    fontSize: 42, 
    fontWeight: '900',
    lineHeight: 48,
  },
  subText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  }
});

export default AlertCard;