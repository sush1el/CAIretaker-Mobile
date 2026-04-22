/**
 * Profiling.js — Resident Face Profile Enrollment
 *
 * Flow:
 *  1. Enter resident name
 *  2. Capture 3 photos (front, left, right) guided by animated prompts
 *  3. Progress bar tracks completion
 *  4. Send to /api/profiles/enroll-image/multi on the camera server
 *  5. List enrolled profiles with delete capability
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Animated,
  Modal, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {
  faUserPlus, faTrash, faCamera, faRotate,
  faCheckCircle, faChevronLeft, faFaceSmile,
  faArrowRight, faArrowLeft,
} from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

// ─── Angle steps config ───────────────────────────────────────────────────────
const ANGLE_STEPS = [
  {
    key: 'front',
    label: 'Front View',
    instruction: 'Look straight at the camera. Keep your face centred.',
    icon: faFaceSmile,
    iconColor: '#5BA3E6',
  },
  {
    key: 'left',
    label: 'Left Side',
    instruction: 'Turn your head slightly to the RIGHT so the camera sees your LEFT cheek.',
    icon: faArrowLeft,
    iconColor: '#66D9A0',
  },
  {
    key: 'right',
    label: 'Right Side',
    instruction: 'Turn your head slightly to the LEFT so the camera sees your RIGHT cheek.',
    icon: faArrowRight,
    iconColor: '#FFB84D',
  },
];

// ─── AnimatedProgress ─────────────────────────────────────────────────────────
function AnimatedProgress({ step, total }) {
  const pct = total > 0 ? step / total : 0;
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 350, useNativeDriver: false }).start();
  }, [pct]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={pStyles.progressTrack}>
      <Animated.View style={[pStyles.progressFill, { width }]} />
    </View>
  );
}

const pStyles = StyleSheet.create({
  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden', marginVertical: 10,
  },
  progressFill: {
    height: '100%', borderRadius: 4,
    backgroundColor: '#5BA3E6',
  },
});

// ─── ProfileCard ──────────────────────────────────────────────────────────────
function ProfileCard({ profile, onDelete, theme }) {
  const initials = (profile.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <View style={[pcStyles.card, { backgroundColor: theme.cardBg }]}>
      <View style={pcStyles.avatar}>
        <Text style={pcStyles.avatarText}>{initials}</Text>
      </View>
      <View style={pcStyles.info}>
        <Text style={[pcStyles.name, { color: theme.textPrimary }]}>{profile.name}</Text>
        <Text style={[pcStyles.sub, { color: theme.textMuted }]}>
          Added {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(profile.name)} style={pcStyles.del} accessibilityLabel={`Delete profile ${profile.name}`}>
        <FontAwesomeIcon icon={faTrash} color="#FF6B6B" size={18} />
      </TouchableOpacity>
    </View>
  );
}

const pcStyles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#1E3A5F', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  del: { padding: 8 },
});

// ─── CameraModal ──────────────────────────────────────────────────────────────
function CameraModal({ visible, step, onCapture, onClose }) {
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState('front');
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);

  const stepInfo = ANGLE_STEPS[step] || ANGLE_STEPS[0];

  const shoot = useCallback(async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7, base64: true, exif: false,
      });
      onCapture(photo.base64);
    } catch (e) {
      Alert.alert('Camera Error', e.message);
    } finally {
      setCapturing(false);
    }
  }, [capturing, onCapture]);

  if (!visible) return null;

  if (!permission) return null;
  if (!permission.granted) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={cmStyles.overlay}>
          <View style={cmStyles.permBox}>
            <Text style={cmStyles.permText}>Camera access is needed to capture face photos.</Text>
            <TouchableOpacity style={cmStyles.permBtn} onPress={requestPermission}>
              <Text style={cmStyles.permBtnTxt}>Grant Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={cmStyles.overlay}>
        <View style={cmStyles.sheet}>
          {/* Header */}
          <View style={cmStyles.header}>
            <TouchableOpacity onPress={onClose} style={cmStyles.backBtn} accessibilityLabel="Close camera">
              <FontAwesomeIcon icon={faChevronLeft} color="#FFF" size={18} />
            </TouchableOpacity>
            <Text style={cmStyles.headerTitle}>
              Photo {step + 1} / {ANGLE_STEPS.length} — {stepInfo.label}
            </Text>
            <TouchableOpacity
              onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
              style={cmStyles.flipBtn}
              accessibilityLabel="Flip camera"
            >
              <FontAwesomeIcon icon={faRotate} color="#FFF" size={18} />
            </TouchableOpacity>
          </View>

          {/* Progress */}
          <AnimatedProgress step={step} total={ANGLE_STEPS.length} />

          {/* Instruction */}
          <View style={[cmStyles.instructionBox, { borderLeftColor: stepInfo.iconColor }]}>
            <FontAwesomeIcon icon={stepInfo.icon} color={stepInfo.iconColor} size={22} style={{ marginRight: 10 }} />
            <Text style={cmStyles.instructionText}>{stepInfo.instruction}</Text>
          </View>

          {/* Camera */}
          <View style={cmStyles.cameraContainer}>
            <CameraView ref={cameraRef} style={cmStyles.camera} facing={facing}>
              {/* Face oval guide */}
              <View style={cmStyles.ovalGuide} />
            </CameraView>
          </View>

          {/* Shutter */}
          <TouchableOpacity
            style={[cmStyles.shutter, capturing && cmStyles.shutterDisabled]}
            onPress={shoot}
            disabled={capturing}
            accessibilityLabel="Take photo"
            accessibilityRole="button"
          >
            {capturing
              ? <ActivityIndicator color="#FFF" size="large" />
              : <View style={cmStyles.shutterInner} />
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const cmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#0F1825', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  backBtn: { padding: 8 },
  flipBtn: { padding: 8 },
  headerTitle: { flex: 1, color: '#FFF', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  instructionBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10,
    borderLeftWidth: 4, marginHorizontal: 16, marginBottom: 12, padding: 12,
  },
  instructionText: { color: '#E0E8F0', fontSize: 13, flex: 1, lineHeight: 20 },
  cameraContainer: {
    height: 340, marginHorizontal: 16, borderRadius: 18, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(91,163,230,0.4)',
  },
  camera: { flex: 1 },
  ovalGuide: {
    position: 'absolute', alignSelf: 'center', top: 30,
    width: 180, height: 220, borderRadius: 110,
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.45)',
    borderStyle: 'dashed',
  },
  shutter: {
    alignSelf: 'center', marginTop: 22,
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#5BA3E6', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5BA3E6', shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
  },
  shutterDisabled: { backgroundColor: '#2A4060' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },
  permBox: {
    margin: 40, backgroundColor: '#172435', borderRadius: 16, padding: 24, alignItems: 'center',
  },
  permText: { color: '#FFF', fontSize: 15, textAlign: 'center', marginBottom: 20 },
  permBtn: { backgroundColor: '#5BA3E6', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  permBtnTxt: { color: '#FFF', fontWeight: '700' },
});

// ─── Main Profiling Screen ────────────────────────────────────────────────────
export default function Profiling() {
  const { theme, isDarkMode } = useTheme();

  // Form state
  const [name, setName] = useState('');
  const [capturedImages, setCapturedImages] = useState([]); // base64 strings
  const [currentStep, setCurrentStep] = useState(0);       // 0-2
  const [showCamera, setShowCamera] = useState(false);

  // UI state
  const [enrolling, setEnrolling] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [showProfiles, setShowProfiles] = useState(false);

  // ── Fetch profiles ──────────────────────────────────────────────────────────
  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await api.getProfiles();
      if (res.ok) setProfiles(res.data.profiles || []);
      else Alert.alert('Error', res.data?.error || 'Could not load profiles');
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setLoadingProfiles(false);
    }
  }, []);

  const handleShowProfiles = useCallback(() => {
    setShowProfiles(true);
    fetchProfiles();
  }, [fetchProfiles]);

  // ── Capture a photo for the current angle step ──────────────────────────────
  const handleCapture = useCallback((b64) => {
    const updated = [...capturedImages];
    updated[currentStep] = b64;
    setCapturedImages(updated);
    setShowCamera(false);

    // Advance to the next uncaptured step
    const nextEmpty = updated.findIndex((img, i) => i > currentStep && !img);
    if (nextEmpty !== -1) setCurrentStep(nextEmpty);
    else {
      // Find any uncaptured step (wrap around)
      const anyEmpty = updated.findIndex(img => !img);
      if (anyEmpty !== -1) setCurrentStep(anyEmpty);
    }
  }, [capturedImages, currentStep]);

  const openCameraForStep = useCallback((stepIdx) => {
    setCurrentStep(stepIdx);
    setShowCamera(true);
  }, []);

  // ── Reset form ──────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setName('');
    setCapturedImages([]);
    setCurrentStep(0);
  }, []);

  // ── Enroll ──────────────────────────────────────────────────────────────────
  const handleEnroll = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Name required', 'Please enter the resident\'s name.'); return; }

    const filled = capturedImages.filter(Boolean);
    if (filled.length === 0) { Alert.alert('No photos', 'Please capture at least one face photo.'); return; }

    setEnrolling(true);
    try {
      let res;
      if (filled.length === 1) {
        res = await api.enrollProfileFromImage(trimmed, filled[0]);
      } else {
        res = await api.enrollProfileMultiAngle(trimmed, filled);
      }

      if (res.ok && res.data?.success) {
        Alert.alert(
          '✅ Profile Enrolled',
          `"${trimmed}" has been registered with ${filled.length} photo${filled.length > 1 ? 's' : ''}.`,
          [{ text: 'Great!', onPress: resetForm }]
        );
      } else {
        Alert.alert('Enrollment Failed', res.data?.error || 'Unknown error');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Network error');
    } finally {
      setEnrolling(false);
    }
  }, [name, capturedImages, resetForm]);

  // ── Delete profile ──────────────────────────────────────────────────────────
  const handleDelete = useCallback((profileName) => {
    Alert.alert(
      'Delete Profile',
      `Remove "${profileName}" from the system?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const res = await api.deleteProfile(profileName);
            if (res.ok) {
              setProfiles(prev => prev.filter(p => p.name !== profileName));
            } else {
              Alert.alert('Error', res.data?.error || 'Could not delete profile');
            }
          },
        },
      ]
    );
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filledCount = capturedImages.filter(Boolean).length;
  const allCaptured = filledCount === ANGLE_STEPS.length;
  const canEnroll   = name.trim().length > 0 && filledCount > 0;

  // ── Styles ──────────────────────────────────────────────────────────────────
  const s = getStyles(theme, isDarkMode);

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* Header card */}
      <View style={s.headerCard}>
        <View style={s.headerIconWrap}>
          <FontAwesomeIcon icon={faUserPlus} color="#5BA3E6" size={28} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Face Profiling</Text>
          <Text style={s.headerSub}>Register residents for automatic recognition</Text>
        </View>
        <TouchableOpacity
          style={s.profilesBtn}
          onPress={handleShowProfiles}
          accessibilityLabel="View enrolled profiles"
        >
          <Text style={s.profilesBtnTxt}>Profiles</Text>
        </TouchableOpacity>
      </View>

      {/* ── Enrollment form ───────────────────────────────────────────── */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>New Resident Profile</Text>

        {/* Name input */}
        <Text style={s.label}>Resident Name</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. Maria Santos"
          placeholderTextColor={theme.textMuted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Resident name input"
        />

        {/* Progress */}
        <View style={s.progressSection}>
          <Text style={s.label}>
            Face Angles — {filledCount} / {ANGLE_STEPS.length} captured
          </Text>
          <AnimatedProgress step={filledCount} total={ANGLE_STEPS.length} />
          {filledCount < ANGLE_STEPS.length && (
            <Text style={s.progressHint}>
              {allCaptured
                ? 'All angles captured! You can retake any photo.'
                : `Capture ${ANGLE_STEPS.length - filledCount} more angle${ANGLE_STEPS.length - filledCount > 1 ? 's' : ''} for best accuracy.`}
            </Text>
          )}
        </View>

        {/* Angle step cards */}
        <View style={s.stepsRow}>
          {ANGLE_STEPS.map((step, idx) => {
            const captured = !!capturedImages[idx];
            return (
              <TouchableOpacity
                key={step.key}
                style={[s.stepCard, captured && s.stepCardDone]}
                onPress={() => openCameraForStep(idx)}
                activeOpacity={0.75}
                accessibilityLabel={`Capture ${step.label}`}
              >
                {captured ? (
                  <>
                    <FontAwesomeIcon icon={faCheckCircle} color="#66D9A0" size={28} />
                    <Text style={[s.stepLabel, { color: '#66D9A0' }]}>{step.label}</Text>
                    <Text style={s.stepRetake}>Tap to retake</Text>
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faCamera} color={step.iconColor} size={24} />
                    <Text style={[s.stepLabel, { color: step.iconColor }]}>{step.label}</Text>
                    <Text style={s.stepInstruct} numberOfLines={2}>{step.instruction.split('.')[0]}.</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Quality tip */}
        {!allCaptured && filledCount === 0 && (
          <View style={s.tipBox}>
            <Text style={s.tipText}>
              💡 <Text style={{ fontWeight: '700' }}>Tip:</Text> More angles = better recognition. Ensure the face is well-lit and unobstructed.
            </Text>
          </View>
        )}

        {/* Enroll button */}
        <TouchableOpacity
          style={[s.enrollBtn, !canEnroll && s.enrollBtnDisabled]}
          onPress={handleEnroll}
          disabled={!canEnroll || enrolling}
          accessibilityLabel="Enroll profile"
          accessibilityRole="button"
        >
          {enrolling ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <FontAwesomeIcon icon={faUserPlus} color="#FFF" size={18} style={{ marginRight: 8 }} />
              <Text style={s.enrollBtnTxt}>
                {allCaptured ? 'Save Profile (3 Angles)' : filledCount > 0 ? `Save Profile (${filledCount} Photo${filledCount > 1 ? 's' : ''})` : 'Save Profile'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {filledCount > 0 && (
          <TouchableOpacity style={s.resetBtn} onPress={resetForm}>
            <Text style={s.resetBtnTxt}>Clear & Start Over</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Camera modal ──────────────────────────────────────────────── */}
      <CameraModal
        visible={showCamera}
        step={currentStep}
        onCapture={handleCapture}
        onClose={() => setShowCamera(false)}
      />

      {/* ── Enrolled Profiles modal ───────────────────────────────────── */}
      <Modal visible={showProfiles} animationType="slide" transparent onRequestClose={() => setShowProfiles(false)}>
        <View style={pmStyles.overlay}>
          <View style={[pmStyles.sheet, { backgroundColor: theme.background }]}>
            <View style={pmStyles.header}>
              <Text style={[pmStyles.title, { color: theme.textPrimary }]}>Enrolled Profiles</Text>
              <TouchableOpacity onPress={() => setShowProfiles(false)} accessibilityLabel="Close profiles">
                <Text style={pmStyles.close}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingProfiles ? (
              <ActivityIndicator style={{ marginTop: 30 }} color={theme.primary} size="large" />
            ) : profiles.length === 0 ? (
              <View style={pmStyles.empty}>
                <FontAwesomeIcon icon={faFaceSmile} color={theme.textMuted} size={44} />
                <Text style={[pmStyles.emptyText, { color: theme.textMuted }]}>No profiles enrolled yet.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                <Text style={[pmStyles.count, { color: theme.textSecondary }]}>
                  {profiles.length} profile{profiles.length !== 1 ? 's' : ''} registered
                </Text>
                {profiles.map(p => (
                  <ProfileCard key={p.id || p.name} profile={p} onDelete={handleDelete} theme={theme} />
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
}

// ── Stylesheet ────────────────────────────────────────────────────────────────
function getStyles(theme, isDark) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background },
    content: { padding: 16, paddingBottom: 40 },

    // Header card
    headerCard: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: isDark ? '#172435' : '#1E3A5F',
      borderRadius: 18, padding: 18, marginBottom: 16,
    },
    headerIconWrap: {
      width: 52, height: 52, borderRadius: 26,
      backgroundColor: 'rgba(91,163,230,0.18)',
      alignItems: 'center', justifyContent: 'center', marginRight: 14,
    },
    headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
    headerSub: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 3 },
    profilesBtn: {
      backgroundColor: 'rgba(91,163,230,0.3)', borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 8,
      borderWidth: 1, borderColor: 'rgba(91,163,230,0.5)',
    },
    profilesBtnTxt: { color: '#5BA3E6', fontWeight: '700', fontSize: 13 },

    // Section card
    sectionCard: {
      backgroundColor: theme.cardBg, borderRadius: 18, padding: 18,
      shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    },
    sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.textPrimary, marginBottom: 14 },

    // Label / input
    label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
    input: {
      backgroundColor: theme.inputBg, borderRadius: 12, borderWidth: 1,
      borderColor: theme.inputBorder, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: theme.textPrimary, marginBottom: 18,
    },

    // Progress
    progressSection: { marginBottom: 16 },
    progressHint: { color: theme.textMuted, fontSize: 12, marginTop: 6 },

    // Angle step cards
    stepsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    stepCard: {
      flex: 1, backgroundColor: theme.inputBg, borderRadius: 14,
      padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.inputBorder,
      minHeight: 110,
    },
    stepCardDone: { borderColor: '#66D9A0', backgroundColor: isDark ? 'rgba(102,217,160,0.08)' : 'rgba(102,217,160,0.1)' },
    stepLabel: { fontSize: 11, fontWeight: '700', marginTop: 8, textAlign: 'center' },
    stepRetake: { fontSize: 10, color: '#66D9A0', marginTop: 4, opacity: 0.8 },
    stepInstruct: { fontSize: 9, color: '#888', marginTop: 4, textAlign: 'center' },

    // Tip box
    tipBox: {
      backgroundColor: isDark ? 'rgba(91,163,230,0.1)' : 'rgba(30,58,95,0.07)',
      borderRadius: 10, padding: 12, marginBottom: 16,
      borderLeftWidth: 3, borderLeftColor: '#5BA3E6',
    },
    tipText: { color: theme.textSecondary, fontSize: 12, lineHeight: 18 },

    // Buttons
    enrollBtn: {
      flexDirection: 'row', backgroundColor: '#5BA3E6', borderRadius: 14,
      paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
      shadowColor: '#5BA3E6', shadowOpacity: 0.4, shadowRadius: 10, elevation: 4,
    },
    enrollBtnDisabled: { backgroundColor: isDark ? '#2A4060' : '#B0C4D8', shadowOpacity: 0 },
    enrollBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
    resetBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
    resetBtnTxt: { color: theme.textMuted, fontSize: 13 },
  });
}

const pmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', minHeight: 300 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  title: { fontSize: 18, fontWeight: '800' },
  close: { color: '#888', fontSize: 20, padding: 4 },
  count: { fontSize: 13, marginBottom: 12 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 50 },
  emptyText: { marginTop: 14, fontSize: 15 },
});
