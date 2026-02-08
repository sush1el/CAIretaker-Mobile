import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from '@expo/vector-icons'; // Import Icon

const darkBlue = "#142237";
const lightGreyInput = "#E5E7EB";
const { width, height } = Dimensions.get("window");

export default function ForgotPassword() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [strength, setStrength] = useState("Weak");
  const [strengthColor, setStrengthColor] = useState("red");

  const handleSendOTP = () => {
    if (!email) { Alert.alert("Error", "Please enter your email address."); return; }
    setStep(2); setTimer(60); setCanResend(false);
  };

  const handleVerifyOTP = () => {
    if (otp.length < 4) { Alert.alert("Error", "Please enter a valid OTP."); return; }
    setStep(3);
  };

  const checkStrength = (pass) => {
    setNewPassword(pass);
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) { setStrength("Weak"); setStrengthColor("red"); } 
    else if (score === 3) { setStrength("Medium"); setStrengthColor("#FFC107"); } 
    else { setStrength("Strong"); setStrengthColor("green"); }
  };

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) { Alert.alert("Error", "Passwords do not match!"); return; }
    if (strength === "Weak") { Alert.alert("Error", "Password is too weak."); return; }
    Alert.alert("Success", "Change password success!", [{ text: "OK", onPress: () => router.back() }]);
  };

  useEffect(() => {
    let interval = null;
    if (step === 2 && timer > 0) {
      interval = setInterval(() => { setTimer((prev) => prev - 1); }, 1000);
    } else if (timer === 0) {
      setCanResend(true); clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={styles.heading}>Reset Password</Text>
            <Text style={styles.subHeading}>Enter your email to receive an OTP code.</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <TextInput style={styles.inputField} placeholder="name@example.com" placeholderTextColor="#9CA3AF" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <TouchableOpacity style={styles.mainButton} onPress={handleSendOTP}><Text style={styles.mainButtonText}>Send OTP Code</Text></TouchableOpacity>
          </>
        );
      case 2:
        return (
          <>
            <Text style={styles.heading}>Enter OTP</Text>
            <Text style={styles.subHeading}>We sent a code to {email}</Text>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>OTP CODE</Text>
              <TextInput style={styles.inputField} placeholder="123456" placeholderTextColor="#9CA3AF" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
            </View>
            <TouchableOpacity style={styles.mainButton} onPress={handleVerifyOTP}><Text style={styles.mainButtonText}>Verify OTP</Text></TouchableOpacity>
            <View style={styles.resendContainer}>
              {canResend ? (
                <TouchableOpacity onPress={() => { setTimer(60); setCanResend(false); }}><Text style={styles.resendLink}>Resend Code</Text></TouchableOpacity>
              ) : (
                <Text style={styles.timerText}>Resend in {timer}s</Text>
              )}
            </View>
          </>
        );
      case 3:
        return (
          <>
            <Text style={styles.heading}>New Password</Text>
            <Text style={styles.subHeading}>Create a strong password.</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>NEW PASSWORD</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="******"
                  placeholderTextColor="#9CA3AF"
                  value={newPassword}
                  onChangeText={checkStrength}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off" : "eye"} size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              {newPassword.length > 0 && (
                  <View style={styles.strengthContainer}>
                      <Text style={{color: strengthColor, fontWeight:'bold', fontSize: 12}}>Strength: {strength}</Text>
                      <View style={[styles.strengthBar, {backgroundColor: strengthColor, width: strength === 'Weak' ? '33%' : strength === 'Medium' ? '66%' : '100%'}]} />
                  </View>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>CONFIRM PASSWORD</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="******"
                  placeholderTextColor="#9CA3AF"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)}>
                  <Ionicons name={showConfirm ? "eye-off" : "eye"} size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.requirementsContainer}>
                <Text style={styles.reqTitle}>Password must contain:</Text>
                <Text style={styles.reqItem}>• At least 8 characters</Text>
                <Text style={styles.reqItem}>• A capital letter</Text>
                <Text style={styles.reqItem}>• A number</Text>
                <Text style={styles.reqItem}>• A special character</Text>
            </View>

            <TouchableOpacity style={styles.mainButton} onPress={handleChangePassword}><Text style={styles.mainButtonText}>Change Password</Text></TouchableOpacity>
          </>
        );
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={darkBlue} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <View style={styles.staticContainer}>
          <View style={styles.headerContainer}> 
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>← Back</Text></TouchableOpacity>
            <Image source={require("../../assets/login_header_v2.png")} style={styles.headerImage} resizeMode="contain" />
          </View>
          <View style={styles.formSection}>{renderContent()}</View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: darkBlue },
  container: { flex: 1 },
  staticContainer: { flex: 1, justifyContent: "flex-start" },
  headerContainer: { height: height * 0.25, width: "100%", backgroundColor: darkBlue, alignItems: "center", justifyContent: "center", position: 'relative' },
  backButton: { position: 'absolute', top: 20, left: 20, zIndex: 10, padding: 10 },
  backButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  headerImage: { width: "130%", height: "150%" },
  formSection: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 30, paddingTop: 30, paddingBottom: 40 },
  heading: { fontSize: 28, fontWeight: "bold", color: darkBlue, textAlign: "center", marginBottom: 10 },
  subHeading: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 25, paddingHorizontal: 10 },
  inputContainer: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: "bold", color: "#000", marginBottom: 6, letterSpacing: 1 },
  inputField: { backgroundColor: lightGreyInput, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 15, fontSize: 16, color: darkBlue, fontWeight: "500" },
  
  // PASSWORD STYLES
  passwordWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: lightGreyInput, borderRadius: 10, paddingHorizontal: 15 },
  passwordInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: darkBlue, fontWeight: "500" },

  mainButton: { backgroundColor: darkBlue, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 10 },
  mainButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  resendContainer: { marginTop: 20, alignItems: 'center' },
  timerText: { color: '#666', fontSize: 14 },
  resendLink: { color: darkBlue, fontWeight: 'bold', fontSize: 14, textDecorationLine: 'underline' },
  strengthContainer: { marginTop: 8 },
  strengthBar: { height: 4, borderRadius: 2, marginTop: 4 },
  requirementsContainer: { marginBottom: 20, marginTop: 5 },
  reqTitle: { fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  reqItem: { fontSize: 12, color: '#666', marginLeft: 5 }
});