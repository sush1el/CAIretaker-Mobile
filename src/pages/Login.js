import React, { useState, useRef, useEffect } from "react";
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
  TouchableWithoutFeedback,
  Keyboard,
  View,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router"; 
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const { height, width } = Dimensions.get("window");
const darkBlue = "#142237";
const lightGreyInput = "#E5E7EB";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const scrollViewRef = useRef(null);

  // Animation values for splash screen
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(height)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Splash screen animation sequence
  useEffect(() => {
    // Start splash animation sequence
    const startSplashAnimation = () => {
      // Phase 1: Fade in and scale up logo
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Phase 2: Show loader with pulse animation
        Animated.timing(loaderOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();

        // Start pulse animation for loader
        const pulseAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 800,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        pulseAnimation.start();

        // Phase 3: After loading delay, transition to login form
        setTimeout(() => {
          pulseAnimation.stop();
          
          // Fade out splash and slide in form
          Animated.parallel([
            Animated.timing(splashOpacity, {
              toValue: 0,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(formOpacity, {
              toValue: 1,
              duration: 500,
              delay: 200,
              useNativeDriver: true,
            }),
            Animated.spring(formTranslateY, {
              toValue: 0,
              friction: 8,
              tension: 40,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setSplashComplete(true);
          });
        }, 2000); // 2 second loading time
      });
    };

    startSplashAnimation();
  }, []);

  // Keyboard listeners to scroll form up/down
  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener('keyboardDidShow', () => {
      // Scroll to show the form at the top
      scrollViewRef.current?.scrollTo({ y: height * 0.25, animated: true });
    });
    
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', () => {
      // Scroll back to top when keyboard hides
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);

  const handleLogin = async () => {
    console.log("Login attempt:", { email, password });
    
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.login(email, password);
      
      if (result.ok && result.data.success) {
        Alert.alert(
          "Login Successful", 
          `Welcome ${result.data.user.full_name}!`,
          [
            {
              text: "Continue",
              onPress: () => router.replace('/(tabs)')
            }
          ]
        );
      } else {
        Alert.alert("Login Failed", result.data.error || "Invalid credentials");
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "Unable to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Direct navigation bypass for developers
  const handleDevBypass = () => {
    console.log("🚀 Developer bypass - navigating to main app");
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={darkBlue} />

      {/* Splash Screen Overlay */}
      {!splashComplete && (
        <Animated.View style={[styles.splashContainer, { opacity: splashOpacity }]}>
          <Animated.Image
            source={require("../../assets/login_header_v2.png")}
            style={[
              styles.splashLogo,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
            resizeMode="contain"
          />
          <Animated.View style={[styles.loaderContainer, { opacity: loaderOpacity }]}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <ActivityIndicator size="large" color="#FFFFFF" />
            </Animated.View>
            <Text style={styles.loadingText}>Loading...</Text>
          </Animated.View>
        </Animated.View>
      )}

      {/* Main Login Content - Animated */}
      <Animated.View 
        style={[
          styles.mainContent,
          {
            opacity: formOpacity,
            transform: [{ translateY: formTranslateY }],
          },
        ]}
      >
        {/* DEVELOPER BYPASS BUTTON - Top Right */}
        <TouchableOpacity 
          style={styles.devBypassButton}
          onPress={handleDevBypass}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-forward-circle" size={50} color="#FFD700" />
        </TouchableOpacity>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.inputField}
                placeholder="your@email.com"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
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

            <TouchableOpacity 
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]} 
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>Log in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => router.push("/forgot-password")}
            >
              <Text style={styles.forgotButtonText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Developer Note */}
            <View style={styles.devNoteContainer}>
              <Ionicons name="information-circle" size={16} color="#999" />
              <Text style={styles.devNoteText}>
                Tap the golden arrow (→) to skip login
              </Text>
            </View>

          </View>
        </View>
        </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: darkBlue },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  staticContainer: { flex: 1, justifyContent: "flex-start" },
  
  // Splash Screen Styles
  splashContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: darkBlue,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  splashLogo: {
    width: width * 2.4,
    height: height * 0.55,
  },
  loaderContainer: {
    alignItems: 'center',
    marginTop: 30,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 15,
    letterSpacing: 1,
  },
  mainContent: {
    flex: 1,
  },
  
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
  loginButtonDisabled: {
    opacity: 0.7,
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