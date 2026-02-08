import React, { useState } from "react";
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
  ScrollView,
  Alert
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from '@expo/vector-icons'; // Import Icon

const darkBlue = "#142237";
const lightGreyInput = "#E5E7EB";
const { height } = Dimensions.get("window");

export default function Register() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // --- PASSWORD STRENGTH STATE ---
  const [strength, setStrength] = useState("Weak");
  const [strengthColor, setStrengthColor] = useState("red");

  const checkStrength = (pass) => {
    setPassword(pass);
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    if (score <= 2) {
      setStrength("Weak");
      setStrengthColor("red");
    } else if (score === 3) {
      setStrength("Medium");
      setStrengthColor("#FFC107"); // Yellow
    } else {
      setStrength("Strong");
      setStrengthColor("green");
    }
  };

  const handleRegister = () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match!");
      return;
    }
    if (strength === "Weak") {
        Alert.alert("Error", "Password is too weak.");
        return;
    }
    Alert.alert("Success", "Account created successfully!", [
      { text: "Log In Now", onPress: () => router.back() }
    ]);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={darkBlue} />

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.container}>
        <View style={styles.staticContainer}>
          
          <View style={styles.headerContainer}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Image source={require("../../assets/login_header_v2.png")} style={styles.headerImage} resizeMode="contain" />
          </View>

          <View style={styles.formSection}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 20}}>
              
              <Text style={styles.heading}>Create Account</Text>
              <Text style={styles.subHeading}>Sign up to get started.</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>FULL NAME</Text>
                <TextInput style={styles.inputField} placeholder="John Doe" placeholderTextColor="#9CA3AF" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>EMAIL ADDRESS</Text>
                <TextInput style={styles.inputField} placeholder="name@example.com" placeholderTextColor="#9CA3AF" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.label}>PASSWORD</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="******"
                    placeholderTextColor="#9CA3AF"
                    value={password}
                    onChangeText={checkStrength}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? "eye-off" : "eye"} size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                {password.length > 0 && (
                  <View style={styles.strengthContainer}>
                      <Text style={{color: strengthColor, fontWeight:'bold', fontSize: 12}}>Strength: {strength}</Text>
                      <View style={[styles.strengthBar, {backgroundColor: strengthColor, width: strength === 'Weak' ? '33%' : strength === 'Medium' ? '66%' : '100%'}]} />
                  </View>
                )}
              </View>

              {/* Confirm Password Input */}
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

              <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
                <Text style={styles.registerButtonText}>Sign Up</Text>
              </TouchableOpacity>

              <View style={styles.footerContainer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.back()}>
                  <Text style={styles.footerLink}>Log in</Text>
                </TouchableOpacity>
              </View>

            </ScrollView>
          </View>

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
  formSection: { flex: 1, backgroundColor: "#FFFFFF", borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 30, paddingTop: 30 },
  heading: { fontSize: 28, fontWeight: "bold", color: darkBlue, textAlign: "center", marginBottom: 5 },
  subHeading: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 25 },
  inputContainer: { marginBottom: 15 },
  label: { fontSize: 12, fontWeight: "bold", color: "#000", marginBottom: 6, letterSpacing: 1 },
  inputField: { backgroundColor: lightGreyInput, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 15, fontSize: 16, color: darkBlue, fontWeight: "500" },
  
  // PASSWORD STYLES
  passwordWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: lightGreyInput, borderRadius: 10, paddingHorizontal: 15 },
  passwordInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: darkBlue, fontWeight: "500" },

  registerButton: { backgroundColor: darkBlue, borderRadius: 10, paddingVertical: 15, alignItems: "center", marginTop: 5, marginBottom: 20 },
  registerButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  footerContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  footerText: { fontSize: 14, color: '#666' },
  footerLink: { fontSize: 14, color: darkBlue, fontWeight: 'bold' },
  strengthContainer: { marginTop: 8 },
  strengthBar: { height: 4, borderRadius: 2, marginTop: 4 },
  requirementsContainer: { marginBottom: 20, marginTop: 5 },
  reqTitle: { fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  reqItem: { fontSize: 12, color: '#666', marginLeft: 5 }
});