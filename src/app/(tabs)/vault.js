import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { decryptEntry, encryptEntry } from '../../encryption/crypto';
import { getCachedSupabaseClient } from '../../services/supabase';
import { useAppStore } from '../../store/appStore';

// Sub-components & helpers
import {
  SQL_SCHEMA,
  passwordSchema,
  cardSchema,
  docSchema,
  formatCardNumber,
  formatCardExpiry,
  checkOnline,
} from '../../components/vault/vault-constants';
import VaultHeader from '../../components/vault/VaultHeader';
import VaultCategoryTabs from '../../components/vault/VaultCategoryTabs';
import VaultEmptyState from '../../components/vault/VaultEmptyState';
import VaultErrorState from '../../components/vault/VaultErrorState';
import VaultFABSheet from '../../components/vault/VaultFABSheet';
import VaultEntryCard from '../../components/vault/VaultEntryCard';
import VaultFormModal from '../../components/vault/VaultFormModal';

export default function VaultScreen() {
  const queryClient = useQueryClient();
  const { category } = useLocalSearchParams();
  
  // Zustand State
  const masterKey = useAppStore((state) => state.masterKey);
  const showToast = useAppStore((state) => state.showToast);

  // Local UI States
  const [selectedCategory, setSelectedCategory] = useState('all'); // all, password, card, document, archived
  const [searchQuery, setSearchQuery] = useState('');
  const [isTableVerified, setIsTableVerified] = useState(false);
  
  // Modal Controllers
  const [showFABSheet, setShowFABSheet] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);

  // Sync category parameter from route navigation
  useEffect(() => {
    if (category && ['all', 'password', 'card', 'document', 'archived'].includes(category)) {
      setSelectedCategory(category);
    }
  }, [category]);
  
  // Form State
  const [formType, setFormType] = useState(null); // password, card, document
  const [editEntryId, setEditEntryId] = useState(null); // If editing existing
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [isSecurePass, setIsSecurePass] = useState(true);
  const [isSecureCVV, setIsSecureCVV] = useState(true);

  // Reference trackers for closing swiped rows
  const swipeableRefs = useRef(new Map());

  // Fetch encrypted entries from Supabase
  const { data: encryptedEntries = [], isLoading, error, refetch } = useQuery({
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

  // Apply Search and Category Filter locally
  const filteredEntries = useMemo(() => {
    return decryptedEntries.filter((entry) => {
      // Category filter
      if (selectedCategory === 'archived') {
        if (!entry.is_archived) return false;
      } else {
        if (entry.is_archived) return false;
        if (selectedCategory !== 'all' && entry.entry_type !== selectedCategory) return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.trim().toLowerCase();
        return (
          entry.title.toLowerCase().includes(query) ||
          entry.entry_type.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [decryptedEntries, selectedCategory, searchQuery]);

  // --- MUTATION GUARDS (OFFLINE PROTECTION) ---
  const executeWithOnlineGuard = async (callback) => {
    const isOnline = await checkOnline();
    if (!isOnline) {
      showToast('Offline. Save blocked to protect vault sync.', 'error');
      return false;
    }
    return callback();
  };

  // --- DB WRITE OPERATIONS (MUTATIONS) ---
  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const supabase = getCachedSupabaseClient();
      if (!supabase) throw new Error('Client uninitialized');
      
      const encryptedPayload = encryptEntry(payload, masterKey);
      
      if (editEntryId) {
        const { error } = await supabase
          .from('vault_entries')
          .update(encryptedPayload)
          .eq('id', editEntryId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('vault_entries')
          .insert({ ...encryptedPayload, user_id: useAppStore.getState().session?.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault_entries'] });
      showToast(editEntryId ? 'Entry updated successfully' : 'Entry saved successfully', 'success');
      setShowFormModal(false);
      resetForm();
    },
    onError: (e) => {
      console.error('Mutation save failed:', e);
      showToast('Failed to save vault record', 'error');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, isArchived }) => {
      const supabase = getCachedSupabaseClient();
      const { error } = await supabase
        .from('vault_entries')
        .update({ is_archived: isArchived })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vault_entries'] });
      showToast(variables.isArchived ? 'Entry archived' : 'Entry unarchived', 'success');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const supabase = getCachedSupabaseClient();
      // Soft Delete only! Set is_deleted to true.
      const { error } = await supabase
        .from('vault_entries')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault_entries'] });
      showToast('Entry soft-deleted successfully', 'success');
    },
  });

  // --- FORM MANAGEMENT ---
  const resetForm = () => {
    setFormData({});
    setFormErrors({});
    setFormType(null);
    setEditEntryId(null);
    setIsSecurePass(true);
    setIsSecureCVV(true);
  };

  const handleOpenCreateForm = (type) => {
    resetForm();
    setFormType(type);
    setFormData({ entry_type: type });
    setShowFABSheet(false);
    setShowFormModal(true);
  };

  const handleOpenEditForm = (entry) => {
    resetForm();
    setFormType(entry.entry_type);
    setEditEntryId(entry.id);
    setFormData(entry);
    setShowFormModal(true);
  };

  const handleFieldChange = (field, val) => {
    let formattedVal = val;
    if (formType === 'card') {
      if (field === 'card_number') formattedVal = formatCardNumber(val);
      if (field === 'card_expiry') formattedVal = formatCardExpiry(val);
    }
    setFormData({ ...formData, [field]: formattedVal });
    if (formErrors[field]) {
      setFormErrors({ ...formErrors, [field]: null });
    }
  };

  const handleSaveForm = async () => {
    // Validate schema
    let result;
    if (formType === 'password') result = passwordSchema.safeParse(formData);
    else if (formType === 'card') result = cardSchema.safeParse(formData);
    else result = docSchema.safeParse(formData);

    if (!result.success) {
      const errors = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0]] = issue.message;
      });
      setFormErrors(errors);
      showToast('Validation failed', 'error');
      return;
    }

    // Online check and perform write
    executeWithOnlineGuard(() => {
      saveMutation.mutate(formData);
    });
  };

  // --- SWIPE ACTIONS ---
  const handleArchiveRow = (id, isArchived) => {
    executeWithOnlineGuard(() => {
      Alert.alert(
        isArchived ? 'Archive Entry?' : 'Unarchive Entry?',
        isArchived 
          ? 'Are you sure you want to archive this entry? It will be greyed out in your listing.'
          : 'Are you sure you want to restore this entry from archive?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => closeSwipedRow(id) },
          { 
            text: isArchived ? 'Archive' : 'Restore', 
            onPress: () => {
              archiveMutation.mutate({ id, isArchived });
              closeSwipedRow(id);
            } 
          },
        ]
      );
    });
  };

  const handleDeleteRow = (id) => {
    executeWithOnlineGuard(() => {
      Alert.alert(
        'Delete Entry?',
        'Are you sure you want to delete this entry? This is a soft delete and can be restored later.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => closeSwipedRow(id) },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: () => {
              deleteMutation.mutate(id);
              closeSwipedRow(id);
            } 
          },
        ]
      );
    });
  };

  const closeSwipedRow = (id) => {
    const swipeable = swipeableRefs.current.get(id);
    if (swipeable) {
      swipeable.close();
    }
  };

  // --- CLIPBOARD ACTIONS ---
  const handleCopySecureValue = async (value, label) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    showToast(`${label} copied`, 'success');

    // Clear after 45 seconds
    setTimeout(async () => {
      const activeVal = await Clipboard.getStringAsync();
      if (activeVal === value) {
        await Clipboard.setStringAsync('');
        showToast('Clipboard cleared automatically', 'info');
      }
    }, 45000);
  };

  const handleCopySchema = async () => {
    try {
      await Clipboard.setStringAsync(SQL_SCHEMA);
      showToast('SQL Schema copied to clipboard!', 'success');
    } catch (err) {
      showToast('Failed to copy', 'error');
    }
  };

  const handleVerifyDb = async () => {
    showToast('Verifying database structure...', 'info');
    try {
      const supabase = getCachedSupabaseClient();
      if (!supabase) {
        showToast('Supabase client not initialized.', 'error');
        return;
      }

      // Force a direct, low-level Supabase query to bypass all React Query caches/retries
      const { error: testError } = await supabase
        .from('vault_entries')
        .select('id')
        .limit(1);

      if (testError && (testError.code === 'PGRST205' || String(testError.message).includes('vault_entries'))) {
        showToast("Table still missing. Please run the SQL script in Supabase first.", 'error');
      } else if (testError) {
        showToast(`Connection error: ${testError.message}`, 'error');
      } else {
        showToast('Database table verified and synced!', 'success');
        setIsTableVerified(true); // Set table as verified so the warning screen is permanently disabled
        // Immediately seed an empty array to clear the error state and show the welcoming empty state instantly
        queryClient.setQueryData(['vault_entries'], []);
        queryClient.invalidateQueries({ queryKey: ['vault_entries'] });
      }
    } catch (err) {
      console.error('Verification query failed:', err);
      showToast('Failed to check database', 'error');
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Search Header */}
      <VaultHeader searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {/* Category Slider Tabs */}
      <VaultCategoryTabs selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />

      {/* Primary FlashList Container */}
      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#0A84FF" size="large" />
        </View>
      ) : error ? (
        <VaultErrorState
          error={error}
          isTableVerified={isTableVerified}
          onCopySchema={handleCopySchema}
          onVerifyDb={handleVerifyDb}
          onRetry={refetch}
        />
      ) : filteredEntries.length === 0 ? (
        <VaultEmptyState />
      ) : (
        <FlashList
          data={filteredEntries}
          estimatedItemSize={72}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <VaultEntryCard
              item={item}
              onPress={() => handleOpenEditForm(item)}
              onDelete={() => handleDeleteRow(item.id)}
              onArchive={() => handleArchiveRow(item.id, !item.is_archived)}
              swipeRef={(ref) => {
                if (ref) swipeableRefs.current.set(item.id, ref);
                else swipeableRefs.current.delete(item.id);
              }}
            />
          )}
        />
      )}

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowFABSheet(true)}>
        <ThemedText style={styles.fabText}>+</ThemedText>
      </TouchableOpacity>

      {/* FAB Options Bottom Sheet */}
      <VaultFABSheet
        visible={showFABSheet}
        onClose={() => setShowFABSheet(false)}
        onSelectType={handleOpenCreateForm}
      />

      {/* Entry Forms Modal (Create & Edit) */}
      <VaultFormModal
        visible={showFormModal}
        formType={formType}
        editEntryId={editEntryId}
        formData={formData}
        formErrors={formErrors}
        isPending={saveMutation.isPending}
        isSecurePass={isSecurePass}
        isSecureCVV={isSecureCVV}
        setIsSecurePass={setIsSecurePass}
        setIsSecureCVV={setIsSecureCVV}
        onChangeField={handleFieldChange}
        onClose={() => setShowFormModal(false)}
        onSave={handleSaveForm}
        onDelete={handleDeleteRow}
        onCopySecureValue={handleCopySecureValue}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.four,
    backgroundColor: '#0A84FF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 9999,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
});
