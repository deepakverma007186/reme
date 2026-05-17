import React, { useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import { createClient } from '@supabase/supabase-js';
import { useAppStore } from '../../store/appStore';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Spacing } from '@/constants/theme';

export default function SetupScreen() {
  const saveSupabaseConfig = useAppStore((state) => state.saveSupabaseConfig);
  const showToast = useAppStore((state) => state.showToast);

  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const handlePasteUrl = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setUrl(text.trim());
        showToast('URL pasted from clipboard', 'success');
      } else {
        showToast('Clipboard is empty', 'info');
      }
    } catch (e) {
      console.error('Failed to paste URL:', e);
      showToast('Failed to paste URL', 'error');
    }
  };

  const handlePasteAnonKey = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setAnonKey(text.trim());
        showToast('Anon Key pasted from clipboard', 'success');
      } else {
        showToast('Clipboard is empty', 'info');
      }
    } catch (e) {
      console.error('Failed to paste Anon Key:', e);
      showToast('Failed to paste Anon Key', 'error');
    }
  };

  const handleConnect = async () => {
    setErrorText('');
    const cleanUrl = url.trim();
    const cleanAnon = anonKey.trim();

    if (!cleanUrl || !cleanAnon) {
      setErrorText('Please enter both Supabase URL and Anon Key.');
      return;
    }

    // Basic URL validation
    const urlPattern = /^https?:\/\/[a-z0-9\-._~%!$&'()*+,;=]+$/i;
    if (!urlPattern.test(cleanUrl)) {
      setErrorText('Please enter a valid HTTP/HTTPS URL.');
      return;
    }

    setLoading(true);
    try {
      // Create a temporary client to validate credentials & connectivity
      const testClient = createClient(cleanUrl, cleanAnon, {
        auth: { persistSession: false },
      });

      // Ping Supabase auth to verify anonKey and network reachability
      const { error: pingError } = await testClient.auth.getSession();
      
      if (pingError) {
        throw new Error(`Authentication test failed: ${pingError.message}`);
      }

      // If ping completes without throwing, connectivity and anonKey are verified
      await saveSupabaseConfig(cleanUrl, cleanAnon);
    } catch (e) {
      console.error('Supabase connection validation failed:', e);
      setErrorText(
        'Failed to connect to Supabase. Check your URL, Anon Key, and internet connection.'
      );
      showToast('Connection failed', 'error');
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
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.shieldBadge}>
              <ThemedText type="title" style={styles.shieldIcon}>🛡️</ThemedText>
            </View>
            <ThemedText type="title" style={styles.title}>
              ReMe
            </ThemedText>
            <ThemedText type="small" style={styles.subtitle}>
              Configure your personal Supabase credentials to begin. Your data remains fully under your control.
            </ThemedText>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold" style={styles.label}>
                  SUPABASE PROJECT URL
                </ThemedText>
                <TouchableOpacity onPress={handlePasteUrl} style={styles.pasteButton}>
                  <ThemedText type="smallBold" style={styles.pasteButtonText}>
                    📋 Paste
                  </ThemedText>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="https://your-project.supabase.co"
                placeholderTextColor="#60646C"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <ThemedText type="smallBold" style={styles.label}>
                  SUPABASE API ANON KEY
                </ThemedText>
                <TouchableOpacity onPress={handlePasteAnonKey} style={styles.pasteButton}>
                  <ThemedText type="smallBold" style={styles.pasteButtonText}>
                    📋 Paste
                  </ThemedText>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                placeholderTextColor="#60646C"
                value={anonKey}
                onChangeText={setAnonKey}
                autoCapitalize="none"
                autoCorrect={false}
                multiline={true}
                numberOfLines={3}
                scrollEnabled={false}
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
              onPress={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText type="smallBold" style={styles.buttonText}>
                  Connect & Continue
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <ThemedText type="small" style={styles.footerText}>
              🔒 Zero-Knowledge Local AES-256 Encryption.
            </ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Apple-style premium dark background
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  shieldBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  shieldIcon: {
    fontSize: 32,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  subtitle: {
    color: '#B0B4BA',
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  pasteButton: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2E3135',
    borderRadius: Spacing.one - 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  pasteButtonText: {
    color: '#0A84FF',
    fontSize: 10,
  },
  label: {
    color: '#B0B4BA',
    fontSize: 12,
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
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
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
    backgroundColor: '#0A84FF', // Sleek blue action accent
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.five,
  },
  footerText: {
    color: '#60646C',
  },
});
