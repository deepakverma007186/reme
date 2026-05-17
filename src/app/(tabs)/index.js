import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { decryptEntry } from '../../encryption/crypto';
import { getCachedSupabaseClient } from '../../services/supabase';
import { useAppStore } from '../../store/appStore';

export default function HomeScreen() {
  const masterKey = useAppStore((state) => state.masterKey);
  const showToast = useAppStore((state) => state.showToast);

  const handleNavigateToVault = (category) => {
    router.push({
      pathname: '/vault',
      params: { category },
    });
  };

  // Password Generator State
  const [length, setLength] = useState(16);
  const [useUppercase, setUseUppercase] = useState(true);
  const [useLowercase, setUseLowercase] = useState(true);
  const [useNumbers, setUseNumbers] = useState(true);
  const [useSymbols, setUseSymbols] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState('');

  // Fetch encrypted vault entries
  const { data: encryptedEntries = [], isLoading } = useQuery({
    queryKey: ['vault_entries'],
    queryFn: async () => {
      const supabase = getCachedSupabaseClient();
      if (!supabase) return [];
      const { data, error } = await supabase
        .from('vault_entries')
        .select('*')
        .eq('is_deleted', false)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Decrypt entries locally in-memory
  const decryptedEntries = useMemo(() => {
    return encryptedEntries.map((entry) => decryptEntry(entry, masterKey));
  }, [encryptedEntries, masterKey]);

  // Statistics calculation
  const stats = useMemo(() => {
    const counts = { password: 0, card: 0, document: 0 };
    decryptedEntries.forEach((entry) => {
      if (counts[entry.entry_type] !== undefined && !entry.is_archived) {
        counts[entry.entry_type]++;
      }
    });
    return counts;
  }, [decryptedEntries]);



  // Local Password Generator logic
  const generatePassword = () => {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let pool = '';
    if (useUppercase) pool += upper;
    if (useLowercase) pool += lower;
    if (useNumbers) pool += numbers;
    if (useSymbols) pool += symbols;

    if (!pool) {
      showToast('Please enable at least one character class', 'error');
      setGeneratedPassword('');
      return;
    }

    let password = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      password += pool[randomIndex];
    }
    setGeneratedPassword(password);
  };

  // Run generator once if empty
  React.useEffect(() => {
    generatePassword();
  }, [length, useUppercase, useLowercase, useNumbers, useSymbols]);

  const handleCopyPassword = async () => {
    if (!generatedPassword) return;

    await Clipboard.setStringAsync(generatedPassword);
    showToast('Password copied to clipboard', 'success');

    // Clipboard Protection: auto clear clipboard after 45 seconds
    setTimeout(async () => {
      const currentVal = await Clipboard.getStringAsync();
      if (currentVal === generatedPassword) {
        await Clipboard.setStringAsync('');
        showToast('Clipboard cleared automatically', 'info');
      }
    }, 45000);
  };

  // Password strength checker helper
  const getPasswordStrength = () => {
    if (!generatedPassword) return { label: 'Empty', color: '#60646C', width: '0%' };
    
    let score = 0;
    if (generatedPassword.length >= 8) score++;
    if (generatedPassword.length >= 12) score++;
    if (generatedPassword.length >= 16) score++;
    
    let classes = 0;
    if (/[A-Z]/.test(generatedPassword)) classes++;
    if (/[a-z]/.test(generatedPassword)) classes++;
    if (/[0-9]/.test(generatedPassword)) classes++;
    if (/[^A-Za-z0-9]/.test(generatedPassword)) classes++;
    
    if (classes >= 2) score++;
    if (classes >= 4) score++;

    if (score <= 1) return { label: 'Weak 🔴', color: '#FF453A', width: '25%' };
    if (score <= 3) return { label: 'Medium 🟡', color: '#FFD60A', width: '50%' };
    if (score === 4) return { label: 'Strong 🟢', color: '#30D158', width: '75%' };
    return { label: 'Very Strong 💪', color: '#34C759', width: '100%' };
  };

  const strength = getPasswordStrength();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* Header */}
        <View style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            ReMe Vault
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            Your zero-knowledge encrypted vault.
          </ThemedText>
        </View>



        {/* Vault Summary Stats */}
        <View style={styles.statsContainer}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            MY VAULT SUMMARY
          </ThemedText>
          {isLoading ? (
            <ActivityIndicator size="small" color="#0A84FF" />
          ) : (
            <View style={styles.statsRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.statCard}
                onPress={() => handleNavigateToVault('password')}
              >
                <ThemedText style={styles.statIcon}>🔑</ThemedText>
                <ThemedText type="title" style={styles.statCount}>
                  {stats.password}
                </ThemedText>
                <ThemedText type="small" style={styles.statLabel}>
                  Passwords
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.statCard}
                onPress={() => handleNavigateToVault('card')}
              >
                <ThemedText style={styles.statIcon}>💳</ThemedText>
                <ThemedText type="title" style={styles.statCount}>
                  {stats.card}
                </ThemedText>
                <ThemedText type="small" style={styles.statLabel}>
                  Cards
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.statCard}
                onPress={() => handleNavigateToVault('document')}
              >
                <ThemedText style={styles.statIcon}>📄</ThemedText>
                <ThemedText type="title" style={styles.statCount}>
                  {stats.document}
                </ThemedText>
                <ThemedText type="small" style={styles.statLabel}>
                  Documents
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Local Password Generator */}
        <View style={styles.generatorContainer}>
          <ThemedText type="smallBold" style={styles.sectionLabel}>
            🔑 LOCAL PASSWORD GENERATOR
          </ThemedText>

          <View style={styles.passwordDisplayContainer}>
            <TextInput
              style={styles.passwordDisplay}
              value={generatedPassword}
              editable={false}
              selectTextOnFocus={true}
            />
            <TouchableOpacity style={styles.copyButton} onPress={handleCopyPassword}>
              <ThemedText type="smallBold" style={styles.copyButtonText}>
                COPY
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* Strength Bar */}
          <View style={styles.strengthRow}>
            <ThemedText type="small" style={styles.strengthText}>
              Strength: <ThemedText type="smallBold" style={{ color: strength.color }}>{strength.label}</ThemedText>
            </ThemedText>
            <View style={styles.strengthBarBg}>
              <View style={[styles.strengthBarFill, { backgroundColor: strength.color, width: strength.width }]} />
            </View>
          </View>

          {/* Generator Controls */}
          <View style={styles.controlRow}>
            <ThemedText type="smallBold" style={styles.controlLabel}>
              Length: {length}
            </ThemedText>
            <View style={styles.lengthButtons}>
              <TouchableOpacity
                style={styles.lengthBtn}
                onPress={() => setLength(Math.max(8, length - 1))}
              >
                <ThemedText style={styles.lengthBtnText}>-</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.lengthBtn}
                onPress={() => setLength(Math.min(64, length + 1))}
              >
                <ThemedText style={styles.lengthBtnText}>+</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.toggleRow}>
            <ThemedText type="small" style={styles.toggleLabel}>
              Uppercase Letters (A-Z)
            </ThemedText>
            <Switch
              value={useUppercase}
              onValueChange={setUseUppercase}
              trackColor={{ false: '#2C2C2E', true: '#30D158' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>

          <View style={styles.toggleRow}>
            <ThemedText type="small" style={styles.toggleLabel}>
              Lowercase Letters (a-z)
            </ThemedText>
            <Switch
              value={useLowercase}
              onValueChange={setUseLowercase}
              trackColor={{ false: '#2C2C2E', true: '#30D158' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>

          <View style={styles.toggleRow}>
            <ThemedText type="small" style={styles.toggleLabel}>
              Numbers (0-9)
            </ThemedText>
            <Switch
              value={useNumbers}
              onValueChange={setUseNumbers}
              trackColor={{ false: '#2C2C2E', true: '#30D158' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>

          <View style={styles.toggleRow}>
            <ThemedText type="small" style={styles.toggleLabel}>
              Symbols (!@#$)
            </ThemedText>
            <Switch
              value={useSymbols}
              onValueChange={setUseSymbols}
              trackColor={{ false: '#2C2C2E', true: '#30D158' }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>

          <TouchableOpacity style={styles.regenerateButton} onPress={generatePassword}>
            <ThemedText type="smallBold" style={styles.regenerateText}>
              ↻ Regenerate
            </ThemedText>
          </TouchableOpacity>
        </View>

      </ScrollView>
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
    marginBottom: Spacing.four,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
  },
  subtitle: {
    color: '#60646C',
  },
  sectionLabel: {
    color: '#B0B4BA',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing.two,
  },
  statsContainer: {
    marginBottom: Spacing.four,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0C0C0E',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: Spacing.one,
  },
  statCount: {
    color: '#FFFFFF',
    fontSize: 22,
    marginBottom: Spacing.half,
  },
  statLabel: {
    color: '#60646C',
  },
  generatorContainer: {
    backgroundColor: '#0C0C0E',
    padding: Spacing.four,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  passwordDisplayContainer: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#2E3135',
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  passwordDisplay: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontWeight: 'bold',
  },
  copyButton: {
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  strengthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  strengthText: {
    color: '#B0B4BA',
  },
  strengthBarBg: {
    height: 6,
    width: '45%',
    backgroundColor: '#1C1C1E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  strengthBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  controlLabel: {
    color: '#FFFFFF',
  },
  lengthButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  lengthBtn: {
    backgroundColor: '#1C1C1E',
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  lengthBtnText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two + 2,
  },
  toggleLabel: {
    color: '#B0B4BA',
  },
  regenerateButton: {
    backgroundColor: '#2E3135',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  regenerateText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
});
