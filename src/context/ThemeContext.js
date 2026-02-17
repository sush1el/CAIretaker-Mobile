import React, { createContext, useContext, useState, useMemo } from 'react';

// Define color themes with both full and shorthand property names
export const lightTheme = {
  mode: 'light',
  // Main colors
  primary: '#1E3A5F',
  secondary: '#A8D5E2',
  background: '#E8F4F8',
  surface: '#FFFFFF',
  // Shorthand aliases for components
  card: '#FFFFFF',
  text: '#1E3A5F',
  textSecondary: '#666666',
  // Text colors (full names)
  textPrimary: '#1E3A5F',
  textMuted: '#999999',
  textInverse: '#FFFFFF',
  // Status colors
  success: '#7CB342',
  warning: '#FBC02D',
  danger: '#D32F2F',
  // Specific UI colors
  headerBg: '#FFFFFF',
  headerBorder: '#EEEEEE',
  cardBg: '#FFFFFF',
  inputBg: '#F9F9F9',
  inputBorder: '#EEEEEE',
  pillBg: '#FFFFFF',
  sidebarBg: '#1E3A5F',
  // Shadows
  shadowColor: '#000000',
};

export const darkTheme = {
  mode: 'dark',
  // Main colors - Adaptive dark palette
  primary: '#5BA3E6',
  secondary: '#2A4060',
  background: '#0F1825',
  surface: '#172435',
  // Shorthand aliases for components
  card: '#1E3145',
  text: '#F0F4F8',
  textSecondary: '#9EB3C8',
  // Text colors (full names)
  textPrimary: '#F0F4F8',
  textMuted: '#7A8FA8',
  textInverse: '#0F1825',
  // Status colors
  success: '#66D9A0',
  warning: '#FFB84D',
  danger: '#FF6B6B',
  // Specific UI colors
  headerBg: '#0F1825',
  headerBorder: '#2A4060',
  cardBg: '#1E3145',
  inputBg: '#172435',
  inputBorder: '#2A4060',
  pillBg: '#1E3145',
  sidebarBg: '#0F1825',
  // Shadows
  shadowColor: '#000000',
};

const ThemeContext = createContext({
  theme: lightTheme,
  isDarkMode: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  const value = useMemo(() => ({
    theme: isDarkMode ? darkTheme : lightTheme,
    isDarkMode,
    toggleTheme,
  }), [isDarkMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
