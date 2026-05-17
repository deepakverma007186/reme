import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '../themed-text';

export default function VaultCategoryTabs({ selectedCategory, setSelectedCategory }) {
  return (
    <View style={styles.tabSlider}>
      {['all', 'password', 'card', 'document', 'archived'].map((cat) => (
        <TouchableOpacity
          key={cat}
          style={[styles.tabButton, selectedCategory === cat && styles.activeTabButton]}
          onPress={() => setSelectedCategory(cat)}
        >
          <ThemedText
            type="smallBold"
            style={[styles.tabButtonText, selectedCategory === cat && styles.activeTabButtonText]}
          >
            {cat.toUpperCase()}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabSlider: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    marginBottom: Spacing.two,
  },
  tabButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + 4,
    borderRadius: Spacing.three,
    marginRight: Spacing.two,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  activeTabButton: {
    backgroundColor: '#2E3135',
    borderColor: '#2E3135',
  },
  tabButtonText: {
    color: '#60646C',
    fontSize: 11,
  },
  activeTabButtonText: {
    color: '#FFFFFF',
  },
});
