import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '../context/ThemeContext';

export default function FAQs({ faqs }) {
  const { theme } = useTheme();
  
  const dynamicStyles = {
    pillHeader: { backgroundColor: theme.card, padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    pillHeaderText: { fontWeight: '800', color: theme.text, marginRight: 10, fontSize: 15 },
    faqCard: { backgroundColor: theme.card, borderRadius: 15, padding: 15, marginBottom: 12 },
    faqQuestion: { fontWeight: 'bold', color: theme.text, marginBottom: 5 },
    faqAnswer: { color: theme.textSecondary, fontSize: 12, lineHeight: 18 },
  };

  return (
    <View>
      <View style={dynamicStyles.pillHeader}>
        <Text style={dynamicStyles.pillHeaderText}>HELP & FAQS</Text>
        <FontAwesomeIcon icon={faCircleQuestion} color={theme.text} size={18}/>
      </View>
      {faqs.map((f, i) => (
          <View key={i} style={dynamicStyles.faqCard}>
            <Text style={dynamicStyles.faqQuestion}>{f.q}</Text>
            <Text style={dynamicStyles.faqAnswer}>{f.a}</Text>
          </View>
      ))}
    </View>
  );
}