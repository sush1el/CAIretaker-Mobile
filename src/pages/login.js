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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router"; 
import { Ionicons } from '@expo/vector-icons'; // Import Icon

const { height } = Dimensions.get("window");
const darkBlue = "#142237";
const lightGreyInput = "#E5E7EB";

export default function Login() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  
  // NEW: State to toggle password visibility
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = () => {
      console.log("Login Pressed");
      // router.replace('/(tabs)'); 
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={darkBlue} />

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
                autoCapitalize="words"
              />
            </View>

            {/* Password Input (Updated) */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput} // Changed style name
                  placeholder="******"
                  placeholderTextColor="#9CA3AF"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword} // Toggles visibility
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
  // NEW STYLES FOR PASSWORD ROW
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightGreyInput,
    borderRadius: 10,
    paddingHorizontal: 15,
  },
  passwordInput: {
    flex: 1, // Takes up remaining space
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
  footerLink: { fontSize: 14, color: darkBlue, fontWeight: 'bold' }
});