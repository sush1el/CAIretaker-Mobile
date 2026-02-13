import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';

export default function FAQs({ faqs }) {
  return (
    <View>
      <View style={styles.pillHeader}>
        <Text style={styles.pillHeaderText}>HELP & FAQS</Text>
        <FontAwesomeIcon icon={faCircleQuestion} color="#1E3A5F" size={18}/>
      </View>
      {faqs.map((f, i) => (
          <View key={i} style={styles.faqCard}>
            <Text style={styles.faqQuestion}>{f.q}</Text>
            <Text style={styles.faqAnswer}>{f.a}</Text>
          </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pillHeader: { backgroundColor: '#FFF', padding: 12, borderRadius: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  pillHeaderText: { fontWeight: '800', color: '#1E3A5F', marginRight: 10, fontSize: 15 },
  faqCard: { backgroundColor: '#FFF', borderRadius: 15, padding: 15, marginBottom: 12 },
  faqQuestion: { fontWeight: 'bold', color: '#1E3A5F', marginBottom: 5 },
  faqAnswer: { color: '#666', fontSize: 12, lineHeight: 18 },
});