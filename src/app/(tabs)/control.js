import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getCachedSupabaseClient } from '../../services/supabase';
import { useAppStore } from '../../store/appStore';
import { deriveKey, decryptData, encryptData, decryptEntry, encryptEntry } from '../../encryption/crypto';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Spacing } from '@/constants/theme';

export default function ControlScreen() {
  const session = useAppStore((state) => state.session);
  const masterKey = useAppStore((state) => state.masterKey);
  const unlockVault = useAppStore((state) => state.unlockVault);
  const lockVault = useAppStore((state) => state.lockVault);
  const supabaseUrl = useAppStore((state) => state.supabaseUrl);
  const clearSupabaseConfig = useAppStore((state) => state.clearSupabaseConfig);
  
  const biometricsEnabled = useAppStore((state) => state.biometricsEnabled);
  const setBiometricsEnabled = useAppStore((state) => state.setBiometricsEnabled);
  const showToast = useAppStore((state) => state.showToast);

  // States
  const [dbConnected, setDbConnected] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // Password Migration Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationError, setMigrationError] = useState('');

  const user = session?.user;
  const verifyHash = user?.user_metadata?.reme_verify;

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setCheckingStatus(true);
    const supabase = getCachedSupabaseClient();
    if (!supabase) {
      setDbConnected(false);
      setCheckingStatus(false);
      return;
    }

    try {
      const { error } = await supabase.auth.getSession();
      setDbConnected(!error);
    } catch (e) {
      setDbConnected(false);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleToggleBiometrics = async (value) => {
    // If enabling, pass active master key to persist in SecureStore
    await setBiometricsEnabled(value, masterKey);
  };

  const handleImmediateLock = () => {
    lockVault();
    showToast('Vault locked immediately', 'info');
  };

  const handleLogout = async () => {
    Alert.alert(
      'Log Out?',
      'Are you sure you want to log out of your Supabase account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Log Out', 
          style: 'destructive',
          onPress: async () => {
            const supabase = getCachedSupabaseClient();
            if (supabase) {
              await supabase.auth.signOut();
            }
            lockVault();
            showToast('Logged out successfully', 'info');
          } 
        },
      ]
    );
  };

  const handleClearCredentials = () => {
    Alert.alert(
      'Reset ReMe?',
      'This will erase your Supabase credentials and biometric settings from this device. Your data inside Supabase remains safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset App', 
          style: 'destructive',
          onPress: () => {
            clearSupabaseConfig();
          } 
        },
      ]
    );
  };

  // --- PASSWORD MIGRATION & VAULT RE-ENCRYPTION ---
  const handleMigrateMasterPassword = async () => {
    setMigrationError('');
    const cleanCurrent = currentPassword.trim();
    const cleanNew = newPassword.trim();
    const cleanConfirm = confirmNewPassword.trim();

    if (!cleanCurrent || !cleanNew || !cleanConfirm) {
      setMigrationError('Please fill out all fields.');
      return;
    }

    if (cleanNew !== cleanConfirm) {
      setMigrationError('New passwords do not match.');
      return;
    }

    if (cleanNew.length < 8) {
      setMigrationError('New password must be at least 8 characters long.');
      return;
    }

    if (!user || !user.email || !verifyHash) {
      setMigrationError('Security verification metadata not found.');
      return;
    }

    setMigrationLoading(true);

    // Run PBKDF2 operations async to keep the main thread fluid
    setTimeout(async () => {
      try {
        const supabase = getCachedSupabaseClient();

        // 1. Verify current password
        const oldDerivedKey = deriveKey(cleanCurrent, user.email);
        const decryptedVerify = decryptData(verifyHash, oldDerivedKey);

        if (decryptedVerify !== 'ReMe-Verify') {
          setMigrationError('Incorrect Current Master Password.');
          setMigrationLoading(false);
          return;
        }

        // 2. Online verification check
        try {
          const res = await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-store' });
          if (!res.ok) throw new Error('Offline');
        } catch (e) {
          setMigrationError('Offline. Re-encryption requires database synchronization.');
          setMigrationLoading(false);
          return;
        }

        // 3. Fetch ALL user vault entries (even soft-deleted / archived ones to prevent loss)
        const { data: entries, error: fetchError } = await supabase
          .from('vault_entries')
          .select('*');

        if (fetchError) throw fetchError;

        // 4. Decrypt and re-encrypt every entry
        const newDerivedKey = deriveKey(cleanNew, user.email);
        const migrationPromises = entries.map(async (entry) => {
          // Decrypt sensitive fields using old key
          const decrypted = decryptEntry(entry, oldDerivedKey);
          
          // Re-encrypt using new key
          const reEncrypted = encryptEntry(decrypted, newDerivedKey);

          // Update on Supabase
          const { error: updateError } = await supabase
            .from('vault_entries')
            .update(reEncrypted)
            .eq('id', entry.id);

          if (updateError) throw updateError;
        });

        // Resolve all updates in parallel
        await Promise.all(migrationPromises);

        // 5. Encrypt new verification hash and update User Metadata
        const newVerifyHash = encryptData('ReMe-Verify', newDerivedKey);
        const { error: metaError } = await supabase.auth.updateUser({
          data: { reme_verify: newVerifyHash },
        });

        if (metaError) throw metaError;

        // 6. Update local biometric SecureStore key if active
        if (biometricsEnabled) {
          await SecureStore.setItemAsync('reme_master_key', newDerivedKey);
        }

        // 7. Success! Commit new key in Zustand
        unlockVault(newDerivedKey);
        showToast('Password updated. Vault successfully re-encrypted!', 'success');
        
        // Reset and close
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setShowPasswordModal(false);
      } catch (e) {
        console.error('Master password migration failed:', e);
        setMigrationError(e.message || 'Migration failed. Try again.');
        showToast('Re-encryption failed', 'error');
      } finally {
        setMigrationLoading(false);
      }
    }, 50);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Control Center
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            Manage vault credentials, keys, and session settings.
          </ThemedText>
        </View>

        {/* Database Status Section */}
        <View style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            SUPABASE BACKEND (BYOB)
          </ThemedText>
          
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <ThemedText type="small" style={styles.infoLabel}>
                Project URL
              </ThemedText>
              <ThemedText type="smallBold" style={styles.infoValue} numberOfLines={1}>
                {supabaseUrl}
              </ThemedText>
            </View>
            <TouchableOpacity onPress={checkConnectionStatus} disabled={checkingStatus}>
              {checkingStatus ? (
                <ActivityIndicator size="small" color="#0A84FF" />
              ) : (
                <View style={[styles.badge, dbConnected ? styles.badgeSuccess : styles.badgeDanger]}>
                  <ThemedText type="smallBold" style={styles.badgeText}>
                    {dbConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.resetButton} onPress={handleClearCredentials}>
            <ThemedText type="smallBold" style={styles.resetButtonText}>
              Erase Credentials & Disconnect
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Security & Access Keys */}
        <View style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            SECURITY PREFERENCES
          </ThemedText>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextCol}>
              <ThemedText type="smallBold" style={styles.toggleTitle}>
                Biometric Unlock
              </ThemedText>
              <ThemedText type="small" style={styles.toggleDescription}>
                Unlock vault using Face ID or Touch ID.
              </ThemedText>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={handleToggleBiometrics}
              trackColor={{ false: '#2C2C2E', true: '#30D158' }}
            />
          </View>

          <TouchableOpacity style={styles.actionRow} onPress={() => setShowPasswordModal(true)}>
            <View style={styles.actionTextCol}>
              <ThemedText type="smallBold" style={styles.actionTitle}>
                Change Master Password
              </ThemedText>
              <ThemedText type="small" style={styles.actionDescription}>
                Re-encrypts all database records with a new key.
              </ThemedText>
            </View>
            <ThemedText style={styles.chevron}>→</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionRow} onPress={handleImmediateLock}>
            <View style={styles.actionTextCol}>
              <ThemedText type="smallBold" style={[styles.actionTitle, { color: '#FFB000' }]}>
                Lock Vault Immediately
              </ThemedText>
              <ThemedText type="small" style={styles.actionDescription}>
                Lock access and clear keys from local memory.
              </ThemedText>
            </View>
            <ThemedText style={styles.chevron}>🔑</ThemedText>
          </TouchableOpacity>
        </View>

        {/* User Account Session */}
        <View style={styles.section}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            ACCOUNT SESSION
          </ThemedText>

          <View style={styles.accountRow}>
            <View style={styles.infoCol}>
              <ThemedText type="small" style={styles.infoLabel}>
                Logged in as
              </ThemedText>
              <ThemedText type="smallBold" style={styles.infoValue}>
                {user?.email || 'Unknown User'}
              </ThemedText>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
              <ThemedText type="smallBold" style={styles.logoutButtonText}>
                Log Out
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* Change Master Password Modal Wizard */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <ThemedView style={styles.modalContainer}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <ThemedText type="title" style={styles.modalTitle}>
                Key Rotation Wizard
              </ThemedText>
              <ThemedText type="small" style={styles.modalSubtitle}>
                This will batch decrypt your database entries in-memory and re-encrypt them under your new password derived key. Keep device active.
              </ThemedText>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <ThemedText type="smallBold" style={styles.label}>
                  CURRENT MASTER PASSWORD
                </ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#60646C"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="smallBold" style={styles.label}>
                  NEW MASTER PASSWORD (MIN 8 CHARS)
                </ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#60646C"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="smallBold" style={styles.label}>
                  CONFIRM NEW MASTER PASSWORD
                </ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#60646C"
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {migrationError ? (
                <View style={styles.errorContainer}>
                  <ThemedText type="smallBold" style={styles.errorText}>
                    ⚠️ {migrationError}
                  </ThemedText>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.migrateButton}
                onPress={handleMigrateMasterPassword}
                disabled={migrationLoading}
              >
                {migrationLoading ? (
                  <ActivityIndicator color="#000000" size="small" />
                ) : (
                  <ThemedText type="smallBold" style={styles.migrateButtonText}>
                    Rotate Keys & Re-Encrypt
                  </ThemedText>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowPasswordModal(false)}
                disabled={migrationLoading}
              >
                <ThemedText type="smallBold" style={styles.cancelButtonText}>
                  Cancel
                </ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </ThemedView>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
  header: {
    marginBottom: Spacing.five,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
  },
  subtitle: {
    color: '#60646C',
  },
  section: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  sectionLabel: {
    color: '#B0B4BA',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  infoCol: {
    flex: 1,
    paddingRight: Spacing.two,
  },
  infoLabel: {
    color: '#60646C',
    marginBottom: 4,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Spacing.one,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(48, 209, 88, 0.15)',
  },
  badgeDanger: {
    backgroundColor: 'rgba(255, 69, 58, 0.15)',
  },
  badgeText: {
    color: '#30D158',
    fontSize: 10,
  },
  resetButton: {
    marginTop: Spacing.three,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.2)',
  },
  resetButtonText: {
    color: '#FF453A',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    marginBottom: Spacing.three,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: Spacing.three,
  },
  toggleTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 2,
  },
  toggleDescription: {
    color: '#60646C',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two + 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  actionTextCol: {
    flex: 1,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    marginBottom: 2,
  },
  actionDescription: {
    color: '#60646C',
  },
  chevron: {
    color: '#60646C',
    fontSize: 18,
    paddingHorizontal: Spacing.two,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2E3135',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  logoutButtonText: {
    color: '#FF453A',
    fontSize: 14,
  },
  // Re-encryption Modal Wizard
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    marginBottom: Spacing.two,
  },
  modalSubtitle: {
    color: '#B0B4BA',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalForm: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    color: '#B0B4BA',
    fontSize: 11,
    marginBottom: Spacing.one,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 13,
  },
  migrateButton: {
    backgroundColor: '#FFB000',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  migrateButtonText: {
    color: '#000000',
    fontSize: 16,
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
  },
  cancelButtonText: {
    color: '#60646C',
    fontSize: 14,
  },
});
