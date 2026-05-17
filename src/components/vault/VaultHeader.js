import { View, TextInput, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';

export default function VaultHeader({ searchQuery, setSearchQuery }) {
  return (
    <View style={styles.header}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search items..."
        placeholderTextColor="#60646C"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.two,
  },
  searchInput: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
});
