import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { getCachedSupabaseClient } from '../../services/supabase';
import { useAppStore } from '../../store/appStore';
import { deriveKey, decryptData } from '../../encryption/crypto';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Spacing } from '@/constants/theme';

export default function UnlockScreen() {
  const session = useAppStore((state) => state.session);
  const unlockVault = useAppStore((state) => state.unlockVault);
  const lockVault = useAppStore((state) => state.lockVault);
  const showToast = useAppStore((state) => state.showToast);
  const biometricsEnabled = useAppStore((state) => state.biometricsEnabled);

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const user = session?.user;
  const verifyHash = user?.user_metadata?.reme_verify;

  // Check hardware and run biometric unlock on mount
  useEffect(() => {
    checkBiometrics();
  }, []);

  const checkBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;
      setBiometricAvailable(available);

      if (available && biometricsEnabled) {
        // Auto trigger on launch
        triggerBiometricUnlock();
      }
    } catch (e) {
      console.warn('Error checking biometrics:', e);
    }
  };

  const triggerBiometricUnlock = async () => {
    setErrorText('');
    setBiometricLoading(true);

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock your vault',
        fallbackLabel: 'Use Master Password',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const storedKey = await SecureStore.getItemAsync('reme_master_key');
        if (storedKey) {
          unlockVault(storedKey);
          showToast('Vault unlocked via biometrics', 'success');
        } else {
          setErrorText('Biometric key material not found. Please enter your Master Password.');
        }
      }
    } catch (e) {
      console.error('Biometric authentication failed:', e);
      setErrorText('Biometric authentication failed.');
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleUnlockWithPassword = async () => {
    setErrorText('');
    const cleanPass = password.trim();

    if (!cleanPass) {
      setErrorText('Please enter your Master Password.');
      return;
    }

    if (!user || !verifyHash) {
      setErrorText('Security verification metadata not found. Try logging out and signing up again.');
      return;
    }

    setLoading(true);

    // Give UI a millisecond to render spinner before heavy PBKDF2 calculation
    setTimeout(() => {
      try {
        // Derive key using typed Master Password and User's unique UUID
        const derivedHex = deriveKey(cleanPass, user.id);

        // Decrypt the verification hash stored in Supabase metadata
        const decryptedStr = decryptData(verifyHash, derivedHex);

        if (decryptedStr === 'ReMe-Verify') {
          // Password is correct!
          unlockVault(derivedHex);
          
          // If biometrics is active but key is not saved, save it now
          if (biometricsEnabled) {
            SecureStore.setItemAsync('reme_master_key', derivedHex).catch((err) => {
              console.error('Failed to update biometric key:', err);
            });
          }

          showToast('Vault unlocked', 'success');
        } else {
          setErrorText('Incorrect Master Password. Please try again.');
          showToast('Incorrect password', 'error');
        }
      } catch (e) {
        console.error('Key derivation or verification decryption failed:', e);
        setErrorText('Verification error. Please contact support.');
      } finally {
        setLoading(false);
      }
    }, 50);
  };

  const handleSignOut = async () => {
    const supabase = getCachedSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
      lockVault();
      showToast('Logged out successfully', 'info');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.lockBadge}>
              <ThemedText style={styles.lockIcon}>🔒</ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              Vault Locked
            </ThemedText>
            <ThemedText type="small" style={styles.subtitle}>
              Enter your Master Password to decrypt your credentials.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Master Password"
                placeholderTextColor="#60646C"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {errorText ? (
              <View style={styles.errorContainer}>
                <ThemedText type="smallBold" style={styles.errorText}>
                  ⚠️ {errorText}
                </ThemedText>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.button}
              onPress={handleUnlockWithPassword}
              disabled={loading || biometricLoading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText type="smallBold" style={styles.buttonText}>
                  Unlock Vault
                </ThemedText>
              )}
            </TouchableOpacity>

            {biometricAvailable && biometricsEnabled && (
              <TouchableOpacity
                style={[styles.button, styles.biometricButton]}
                onPress={triggerBiometricUnlock}
                disabled={loading || biometricLoading}
              >
                {biometricLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <ThemedText type="smallBold" style={styles.biometricButtonText}>
                    👋 Use Touch ID / Face ID
                  </ThemedText>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.footerActions}>
            <TouchableOpacity onPress={handleSignOut} style={styles.logoutButton}>
              <ThemedText type="smallBold" style={styles.logoutText}>
                Switch Account / Sign Out
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  lockBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  lockIcon: {
    fontSize: 36,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  subtitle: {
    color: '#B0B4BA',
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
    lineHeight: 18,
  },
  form: {
    width: '100%',
    backgroundColor: '#0C0C0E',
    padding: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2E3135',
    textAlign: 'center',
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
  button: {
    backgroundColor: '#FFB000', // Warning Gold color for vault unlocking action
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  buttonText: {
    color: '#000000', // High contrast dark text on gold button
    fontSize: 16,
  },
  biometricButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2E3135',
    marginTop: Spacing.three,
  },
  biometricButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  footerActions: {
    alignItems: 'center',
    marginTop: Spacing.five,
  },
  logoutButton: {
    padding: Spacing.two,
  },
  logoutText: {
    color: '#FF453A',
    fontSize: 14,
  },
});
