import { View, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '../themed-text';

export default function VaultEmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <ThemedText style={styles.emptyIcon}>✨</ThemedText>
      <ThemedText type="title" style={styles.emptyTitle}>
        Your Vault is Ready!
      </ThemedText>
      <ThemedText type="small" style={styles.emptySubtitle}>
        Your zero-knowledge encrypted database is connected. Tap the "+" button in the corner to secure your first password, card, or document!
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.six,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.three,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    marginBottom: Spacing.one,
  },
  emptySubtitle: {
    color: '#60646C',
    textAlign: 'center',
  },
});
