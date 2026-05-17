import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { ThemedText } from '../themed-text';

export default function VaultErrorState({
  error,
  isTableVerified,
  onCopySchema,
  onVerifyDb,
  onRetry,
}) {
  const isTableMissing =
    error &&
    !isTableVerified &&
    (error.code === 'PGRST205' || String(error.message).includes('vault_entries'));

  if (isTableMissing) {
    return (
      <View style={styles.errorContainer}>
        <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
        <ThemedText type="title" style={styles.errorTitle}>
          Database Table Missing
        </ThemedText>
        <ThemedText type="small" style={styles.errorSubtitle}>
          Your Supabase project is configured, but the database table 'vault_entries' does not exist yet.
        </ThemedText>
        <TouchableOpacity style={styles.copySqlBtn} onPress={onCopySchema}>
          <ThemedText type="smallBold" style={styles.copySqlBtnText}>
            📋 Copy SQL Schema Script
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity style={styles.verifyBtn} onPress={onVerifyDb}>
          <ThemedText type="smallBold" style={styles.verifyBtnText}>
            🔄 Verify & Sync
          </ThemedText>
        </TouchableOpacity>

        <ThemedText type="small" style={styles.errorHelpText}>
          Copy the script, open your Supabase Dashboard SQL Editor, paste it, and click "Run" before verifying.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.errorContainer}>
      <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
      <ThemedText type="title" style={styles.errorTitle}>
        Sync Failed
      </ThemedText>
      <ThemedText type="small" style={styles.errorSubtitle}>
        {error?.message || 'An error occurred while connecting to Supabase.'}
      </ThemedText>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <ThemedText type="smallBold" style={styles.retryBtnText}>
          🔄 Retry Connection
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
  },
  errorIcon: {
    fontSize: 54,
    marginBottom: Spacing.two,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  errorSubtitle: {
    color: '#B0B4BA',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
  copySqlBtn: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#0A84FF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
    width: '85%',
    alignItems: 'center',
  },
  copySqlBtnText: {
    color: '#0A84FF',
    fontSize: 13,
  },
  verifyBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
    width: '85%',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  errorHelpText: {
    color: '#60646C',
    textAlign: 'center',
    fontSize: 11,
    paddingHorizontal: Spacing.three,
    lineHeight: 15,
  },
  retryBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
});
