/**
 * Expo Push Notification Service for CAIretaker
 * Includes continuous background alarm for fall detection
 * Vibration + Notifications (no audio)
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Map of available sounds
const SOUND_FILES = {
  sound1: require('../../assets/sounds/sound1.wav'),
};

// Global audio state
let currentSound = null;
let appSoundEnabled = true;
let appSelectedSound = 'sound1';

// Store interval ID for continuous alarm
let alarmIntervalId = null;
let isAlarmActive = false;

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Helper to load sound settings
 */
async function loadAppSettings() {
  try {
    const enabledStr = await AsyncStorage.getItem('soundEnabled');
    if (enabledStr !== null) {
      appSoundEnabled = enabledStr === 'true';
    }
    const soundStr = await AsyncStorage.getItem('selectedSound');
    if (soundStr !== null) {
      appSelectedSound = soundStr;
    }
  } catch (e) {
    console.log('Error loading sound settings in background service', e);
  }
}

/**
 * Helper to play repeating sound
 */
async function playAlarmAudio() {
  if (!appSoundEnabled) return;

  try {
    if (currentSound) {
      await currentSound.unloadAsync();
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const source = SOUND_FILES[appSelectedSound] || SOUND_FILES.sound1;
    const { sound } = await Audio.Sound.createAsync(source, { isLooping: true });
    currentSound = sound;
    await currentSound.playAsync();
  } catch (e) {
    console.log("Error playing alarm audio:", e);
  }
}

/**
 * Helper to stop repeating sound
 */
async function stopAlarmAudio() {
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
      currentSound = null;
    } catch (e) {
      console.log("Error stopping alarm audio:", e);
    }
  }
}

/**
 * Send a local notification (for continuous alarm)
 */
async function sendLocalFallNotification(personId, location) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚨 FALL ALERT - ONGOING',
      body: `Person ${personId} is still down at ${location}. Please respond!`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: [0, 500, 200, 500, 200, 500],
    },
    trigger: null,
  });

  // Trigger device vibration
  Vibration.vibrate([0, 500, 200, 500, 200, 500]);
}

/**
 * Start continuous alarm for an active fall
 * Sends notifications every 3 seconds until stopped
 */
export async function startFallAlarm(personId = 'Unknown', location = 'Unknown') {
  if (isAlarmActive) {
    console.log('🔔 Fall alarm already active');
    return;
  }

  isAlarmActive = true;
  console.log('🔔 Starting continuous fall alarm');

  // Load latest settings and optionally start playing audio
  await loadAppSettings();
  await playAlarmAudio();

  // Send first notification immediately
  sendLocalFallNotification(personId, location);

  // Then send every 3 seconds
  alarmIntervalId = setInterval(() => {
    if (isAlarmActive) {
      sendLocalFallNotification(personId, location);
      console.log('🔔 Fall alarm: notification sent');
    }
  }, 3000);
}

// Store gait alarm state separately
let gaitAlarmIntervalId = null;
let isGaitAlarmActive = false;

/**
 * Send a local notification for abnormal gait
 */
async function sendLocalGaitNotification(personId, location) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ ABNORMAL GAIT DETECTED',
      body: `Person ${personId} at ${location} shows abnormal walking pattern. Please check on them.`,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      vibrate: [0, 300, 200, 300],
    },
    trigger: null,
  });

  // Trigger device vibration
  Vibration.vibrate([0, 300, 200, 300]);
}

/**
 * Start continuous alarm for abnormal gait detection
 * Sends notifications every 5 seconds until stopped
 */
export async function startGaitAlarm(personId = 'Unknown', location = 'Unknown') {
  if (isGaitAlarmActive) {
    console.log('🔔 Gait alarm already active');
    return;
  }

  isGaitAlarmActive = true;
  console.log('🔔 Starting gait alarm');

  // Load latest settings and optionally start playing audio
  // Gait uses the same audio settings as fall
  await loadAppSettings();
  await playAlarmAudio();

  // Send first notification immediately
  sendLocalGaitNotification(personId, location);

  // Then send every 5 seconds (less aggressive than fall alarm)
  gaitAlarmIntervalId = setInterval(() => {
    if (isGaitAlarmActive) {
      sendLocalGaitNotification(personId, location);
      console.log('🔔 Gait alarm: notification sent');
    }
  }, 5000);
}

/**
 * Stop the gait alarm
 */
export function stopGaitAlarm() {
  if (!isGaitAlarmActive) return;

  isGaitAlarmActive = false;
  if (gaitAlarmIntervalId) {
    clearInterval(gaitAlarmIntervalId);
    gaitAlarmIntervalId = null;
  }
  // Only cancel vibration and sound if fall alarm is also not running
  if (!isAlarmActive) {
    Vibration.cancel();
    stopAlarmAudio();
  }
  console.log('🔕 Gait alarm stopped');
  Notifications.dismissAllNotificationsAsync();
}

/**
 * Check if gait alarm is currently active
 */
export function isGaitAlarmRunning() {
  return isGaitAlarmActive;
}

/**
 * Stop the continuous fall alarm
 */
export function stopFallAlarm() {
  if (!isAlarmActive) {
    console.log('🔕 No active alarm to stop');
    return;
  }

  isAlarmActive = false;

  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }

  // Stop vibration and sound
  Vibration.cancel();
  if (!isGaitAlarmActive) {
    stopAlarmAudio();
  }
  console.log('🔕 Fall alarm stopped');

  // Dismiss all notifications
  Notifications.dismissAllNotificationsAsync();
}

/**
 * Check if alarm is currently active
 */
export function isAlarmRunning() {
  return isAlarmActive;
}

/**
 * Register for push notifications and get the Expo Push Token
 * @returns {Promise<string|null>} The Expo Push Token or null if failed
 */
export async function registerForPushNotificationsAsync() {
  let token = null;

  // Check if physical device (not simulator/emulator)
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Android: Create HIGH PRIORITY notification channel for fall alerts
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('fall_alerts', {
      name: 'Fall Alerts',
      description: 'Urgent fall detection alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500], // Aggressive vibration
      lightColor: '#FF0000',
      sound: 'default', // Uses system notification sound
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true, // Bypass Do Not Disturb mode
    });
  }

  // Check and request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Get the Expo Push Token
  try {
    // Use the EAS projectId from app.json
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'a573b37d-1182-4654-8693-5acbee532cc9',
    });
    token = tokenData.data;
    console.log('Expo Push Token:', token);
  } catch (error) {
    // Push tokens not available - notifications will only work locally
    console.log('Push tokens unavailable:', error.message || error);
  }

  return token;
}

/**
 * Add listener for notifications received while app is foregrounded
 * @param {Function} callback - Function to call when notification is received
 * @returns {Object} Subscription object - call .remove() to unsubscribe
 */
export function addNotificationReceivedListener(callback) {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add listener for when user interacts with a notification
 * @param {Function} callback - Function to call when notification is tapped
 * @returns {Object} Subscription object - call .remove() to unsubscribe
 */
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export default {
  registerForPushNotificationsAsync,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  startFallAlarm,
  stopFallAlarm,
  isAlarmRunning,
  startGaitAlarm,
  stopGaitAlarm,
  isGaitAlarmRunning,
};
