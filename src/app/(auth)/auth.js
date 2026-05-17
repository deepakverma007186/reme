import { Spacing } from '@/constants/theme';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { deriveKey, encryptData } from '../../encryption/crypto';
import { getCachedSupabaseClient } from '../../services/supabase';
import { useAppStore } from '../../store/appStore';

export default function AuthScreen() {
  const showToast = useAppStore((state) => state.showToast);
  const unlockVault = useAppStore((state) => state.unlockVault);

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handleAuth = async () => {
    setErrorText('');
    const cleanEmail = email.trim();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setErrorText('Please enter your email and password.');
      return;
    }

    const supabase = getCachedSupabaseClient();
    if (!supabase) {
      setErrorText('Supabase is not configured properly.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up Flow
        if (cleanPass !== confirmPassword.trim()) {
          setErrorText('Passwords do not match.');
          setLoading(false);
          return;
        }

        const cleanMaster = masterPassword.trim();
        if (!cleanMaster) {
          setErrorText('Please define a local Master Password.');
          setLoading(false);
          return;
        }

        if (cleanMaster.length < 8) {
          setErrorText('Master Password must be at least 8 characters long.');
          setLoading(false);
          return;
        }

        if (cleanMaster === confirmMasterPassword.trim()) {
          // Derive encryption key and create the verification hash using email as salt
          const derivedHex = deriveKey(cleanMaster, cleanEmail);
          const verifyHash = encryptData('ReMe-Verify', derivedHex);

          // Perform Sign Up in Supabase Auth, passing the verifyHash directly in options.data
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: cleanEmail,
            password: cleanPass,
            options: {
              data: { reme_verify: verifyHash },
            },
          });

          if (signUpError) throw signUpError;
          if (!signUpData.user) throw new Error('Account creation failed.');

          // Reset the password fields immediately for security
          setPassword('');
          setConfirmPassword('');
          setMasterPassword('');
          setConfirmMasterPassword('');

          if (signUpData.session) {
            // Email auto-confirm is active -> User is immediately logged in
            // Unlock the vault using the derived key so they seamlessly go to (tabs)
            unlockVault(derivedHex);
            setEmail(''); // Clear email too since they are logged in
            showToast('Account created and vault unlocked!', 'success');
          } else {
            // Email confirmation is required -> They must verify their email first
            showToast('Account created! Please check your email to verify your account.', 'info');
            setIsSignUp(false); // Toggle to Sign In screen
          }
        } else {
          setErrorText('Master Passwords do not match.');
        }
      } else {
        // Login Flow
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });

        if (loginError) throw loginError;
        
        // Reset the form on successful login
        setEmail('');
        setPassword('');
        showToast('Logged in successfully', 'success');
      }
    } catch (e) {
      console.error('Authentication process failed:', e);
      setErrorText(e.message || 'An error occurred during authentication.');
      showToast('Authentication failed', 'error');
    } finally {
      setLoading(false);
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <ThemedText type="title" style={styles.title}>
              {isSignUp ? 'Create Vault' : 'Unlock Access'}
            </ThemedText>
            <ThemedText type="small" style={styles.subtitle}>
              {isSignUp
                ? 'Create a cloud account and encrypt your local vault.'
                : 'Sign in to sync your encrypted vault data.'}
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText type="smallBold" style={styles.label}>
                EMAIL ADDRESS
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="email@example.com"
                placeholderTextColor="#60646C"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText type="smallBold" style={styles.label}>
                PASSWORD
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#60646C"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {isSignUp && (
              <>
                <View style={styles.inputGroup}>
                  <ThemedText type="smallBold" style={styles.label}>
                    CONFIRM PASSWORD
                  </ThemedText>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#60646C"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {/* Master Password - Zero Knowledge Local Key */}
                <View style={styles.masterSection}>
                  <ThemedText type="smallBold" style={styles.masterTitle}>
                    🔑 Local Master Password (Zero-Knowledge)
                  </ThemedText>
                  <ThemedText type="small" style={styles.masterDescription}>
                    This password is never sent to the cloud. It is used locally to encrypt and decrypt all your sensitive vault data. Don't lose it!
                  </ThemedText>

                  <View style={styles.inputGroup}>
                    <TextInput
                      style={styles.input}
                      placeholder="Master Password (min 8 chars)"
                      placeholderTextColor="#60646C"
                      value={masterPassword}
                      onChangeText={setMasterPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm Master Password"
                      placeholderTextColor="#60646C"
                      value={confirmMasterPassword}
                      onChangeText={setConfirmMasterPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>
              </>
            )}

            {errorText ? (
              <View style={styles.errorContainer}>
                <ThemedText type="smallBold" style={styles.errorText}>
                  ⚠️ {errorText}
                </ThemedText>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.button}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText type="smallBold" style={styles.buttonText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => {
              setIsSignUp(!isSignUp);
              setErrorText('');
            }}
          >
            <ThemedText type="smallBold" style={styles.toggleText}>
              {isSignUp
                ? 'Already have an account? Sign In'
                : 'Need a new vault? Create Account'}
            </ThemedText>
          </TouchableOpacity>
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
    marginBottom: Spacing.four,
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
    paddingHorizontal: Spacing.three,
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
  label: {
    color: '#B0B4BA',
    marginBottom: Spacing.one,
    fontSize: 11,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 1,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  masterSection: {
    marginTop: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    marginBottom: Spacing.two,
  },
  masterTitle: {
    color: '#FFB000', // Gold/Amber security warning color
    fontSize: 13,
    marginBottom: Spacing.one,
  },
  masterDescription: {
    color: '#B0B4BA',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.three,
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
    backgroundColor: '#0A84FF',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  toggleButton: {
    alignItems: 'center',
    marginTop: Spacing.four,
    paddingVertical: Spacing.two,
  },
  toggleText: {
    color: '#0A84FF',
    fontSize: 14,
  },
});
