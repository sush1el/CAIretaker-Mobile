import React, { useState } from "react";
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router"; 
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get("window");
const darkBlue = "#142237";
const lightGreyInput = "#E5E7EB";

export default function Login() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
    console.log("Login attempt:", { name, password });
    
    if (!name || !password) {
      Alert.alert("Error", "Please enter both username and password");
      return;
    }

    // Simple validation - accept any credentials for development
    Alert.alert(
      "Login Successful", 
      `Welcome ${name}!`,
      [
        {
          text: "Continue",
          onPress: () => router.replace('/(tabs)')
        }
      ]
    );
  };

  // Direct navigation bypass for developers
  const handleDevBypass = () => {
    console.log("🚀 Developer bypass - navigating to main app");
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={darkBlue} />

      {/* DEVELOPER BYPASS BUTTON - Top Right */}
      <TouchableOpacity 
        style={styles.devBypassButton}
        onPress={handleDevBypass}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-forward-circle" size={50} color="#FFD700" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.staticContainer}>
          
          <View style={styles.headerContainer}>
            <Image
              source={require("../../assets/login_header_v2.png")}
              style={styles.headerImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.loginHeading}>Login</Text>
            <Text style={styles.loginSubHeading}>Sign in to continue.</Text>

            {/* Name Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>NAME</Text>
              <TextInput
                style={styles.inputField}
                placeholder="USERNAME OR EMAIL"
                placeholderTextColor="#9CA3AF"
                value={name}
                onChangeText={setName}
                autoCapitalize="none"
              />
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
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons 
                    name={showPassword ? "eye-off" : "eye"} 
                    size={24} 
                    color="#6B7280" 
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
              <Text style={styles.loginButtonText}>Log in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => router.push("/forgot-password")}
            >
              <Text style={styles.forgotButtonText}>Forgot Password?</Text>
            </TouchableOpacity>

            <View style={styles.footerContainer}>
                <Text style={styles.footerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => router.push("/register")}>
                  <Text style={styles.footerLink}>Sign up</Text>
                </TouchableOpacity>
            </View>

            {/* Developer Note */}
            <View style={styles.devNoteContainer}>
              <Ionicons name="information-circle" size={16} color="#999" />
              <Text style={styles.devNoteText}>
                Tap the golden arrow (→) to skip login
              </Text>
            </View>

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
  
  // Developer Bypass Button
  devBypassButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 20,
    right: 20,
    zIndex: 9999,
    backgroundColor: darkBlue,
    borderRadius: 25,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  
  headerContainer: {
    height: height * 0.35,
    width: "100%",
    backgroundColor: darkBlue,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
  },
  headerImage: { width: "240%", height: "165%" },
  formSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 40,
  },
  loginHeading: {
    fontSize: 32,
    fontWeight: "bold",
    color: darkBlue,
    textAlign: 'center',
    marginBottom: 5,
  },
  loginSubHeading: {
    fontSize: 16,
    color: "#000",
    textAlign: 'center',
    fontWeight: "600",
    marginBottom: 30,
  },
  inputContainer: { marginBottom: 15 },
  label: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 8,
    letterSpacing: 1,
  },
  inputField: {
    backgroundColor: lightGreyInput,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    color: darkBlue,
    fontWeight: "500",
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightGreyInput,
    borderRadius: 10,
    paddingHorizontal: 15,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: darkBlue,
    fontWeight: "500",
  },
  loginButton: {
    backgroundColor: darkBlue,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 15,
    marginBottom: 20,
  },
  loginButtonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  forgotButton: { alignItems: "center" },
  forgotButtonText: { color: darkBlue, fontSize: 16, fontWeight: "600" },
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20, 
  },
  footerText: { fontSize: 14, color: '#666' },
  footerLink: { fontSize: 14, color: darkBlue, fontWeight: 'bold' },
  
  // Developer Note
  devNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 30,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  devNoteText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 6,
    fontStyle: 'italic',
  },
});