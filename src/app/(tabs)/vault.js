import React, { useState, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Clipboard from 'expo-clipboard';
import { z } from 'zod';

import { useAppStore } from '../../store/appStore';
import { getCachedSupabaseClient } from '../../services/supabase';
import { decryptEntry, encryptEntry } from '../../encryption/crypto';
import { ThemedText } from '../../components/themed-text';
import { ThemedView } from '../../components/themed-view';
import { Spacing } from '@/constants/theme';

const SQL_SCHEMA = `-- ReMe (BYOB Encrypted Password Vault) SQL Schema Definition
-- Run this in your Supabase SQL Editor to prepare your database.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create vault_entries table
CREATE TABLE IF NOT EXISTS vault_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('password', 'card', 'document')),
    
    -- Encrypted sensitive data (stored as "iv:ciphertext" strings)
    -- Password entry fields
    login_username TEXT,
    login_email TEXT,
    login_phone TEXT,
    login_password TEXT,
    
    -- Card entry fields
    card_name TEXT,
    card_number TEXT,
    card_expiry TEXT,
    card_cvv TEXT,
    card_pin TEXT,
    
    -- Document entry fields
    doc_full_name TEXT,
    doc_number TEXT,
    doc_issue_date TEXT,
    doc_expiry_date TEXT,
    
    -- Common fields
    notes TEXT,
    website TEXT, -- Plaintext website metadata for convenient launching
    
    -- Searchable/Metadata fields
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;

-- Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_id ON vault_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted ON vault_entries(is_deleted);
CREATE INDEX IF NOT EXISTS idx_archived ON vault_entries(is_archived);
CREATE INDEX IF NOT EXISTS idx_updated_at ON vault_entries(updated_at DESC);

-- RLS Policies: Ensure users can ONLY interact with their own rows
CREATE POLICY "Users can only SELECT their own vault entries"
ON vault_entries FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only INSERT their own vault entries"
ON vault_entries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only UPDATE their own vault entries"
ON vault_entries FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only DELETE their own vault entries"
ON vault_entries FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Update Trigger: Auto-update the updated_at timestamp when a row is edited
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_vault_entries_updated_at ON vault_entries;
CREATE TRIGGER trigger_update_vault_entries_updated_at
BEFORE UPDATE ON vault_entries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();`;

// --- ZOD SCHEMAS FOR VAULT VALIDATION ---
const passwordSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  login_username: z.string().optional(),
  login_email: z.string().email('Invalid email address').or(z.string().length(0)),
  login_phone: z.string().optional(),
  login_password: z.string().min(1, 'Password is required'),
  website: z.string().url('Invalid website URL').or(z.string().length(0)),
  notes: z.string().optional(),
});

const cardSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  card_name: z.string().min(1, 'Cardholder name is required'),
  card_number: z.string().min(12, 'Card number must be valid'),
  card_expiry: z.string().regex(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/, 'Expiry must be MM/YY'),
  card_cvv: z.string().min(3, 'CVV must be 3 or 4 digits').max(4),
  card_pin: z.string().optional(),
  notes: z.string().optional(),
});

const docSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  doc_full_name: z.string().min(1, 'Full name is required'),
  doc_number: z.string().min(1, 'Document number is required'),
  doc_issue_date: z.string().optional(),
  doc_expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

// Formatting Helpers for Credit Card Inputs
const formatCardNumber = (text) => {
  const digits = text.replace(/\D/g, '');
  const formatted = digits.match(/.{1,4}/g)?.join(' ') || digits;
  return formatted.slice(0, 19); // 16 digits + 3 spaces
};

const formatCardExpiry = (text) => {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`.slice(0, 5);
};

// Check if user has an active internet connection
const checkOnline = async () => {
  try {
    const res = await fetch('https://www.google.com', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch (e) {
    return false;
  }
};

export default function VaultScreen() {
  const queryClient = useQueryClient();
  
  // Zustand State
  const masterKey = useAppStore((state) => state.masterKey);
  const showToast = useAppStore((state) => state.showToast);

  // Local UI States
  const [selectedCategory, setSelectedCategory] = useState('all'); // all, password, card, document, archived
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal Controllers
  const [showFABSheet, setShowFABSheet] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  
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
          .insert({ ...encryptedPayload, user_id: supabase.auth.user?.id });
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

  // --- SWIPE ACTION RENDERING ---
  const renderLeftActions = (entry) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteRow(entry.id)}
      >
        <ThemedText style={styles.actionIcon}>🗑️</ThemedText>
        <ThemedText type="smallBold" style={styles.actionLabelText}>Delete</ThemedText>
      </TouchableOpacity>
    );
  };

  const renderRightActions = (entry) => {
    const isArchived = entry.is_archived;
    return (
      <TouchableOpacity
        style={[styles.archiveAction, isArchived && styles.restoreAction]}
        onPress={() => handleArchiveRow(entry.id, !isArchived)}
      >
        <ThemedText style={styles.actionIcon}>{isArchived ? '📥' : '📤'}</ThemedText>
        <ThemedText type="smallBold" style={styles.actionLabelText}>
          {isArchived ? 'Restore' : 'Archive'}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Search Header */}
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

      {/* Category Slider Tabs */}
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

      {/* Primary FlashList Container */}
      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator color="#0A84FF" size="large" />
        </View>
      ) : error && (error.code === 'PGRST205' || String(error.message).includes('vault_entries')) ? (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
          <ThemedText type="title" style={styles.errorTitle}>
            Database Table Missing
          </ThemedText>
          <ThemedText type="small" style={styles.errorSubtitle}>
            Your Supabase project is configured, but the database table 'vault_entries' does not exist yet.
          </ThemedText>
          <TouchableOpacity
            style={styles.copySqlBtn}
            onPress={async () => {
              try {
                await Clipboard.setStringAsync(SQL_SCHEMA);
                showToast('SQL Schema copied to clipboard!', 'success');
              } catch (err) {
                showToast('Failed to copy', 'error');
              }
            }}
          >
            <ThemedText type="smallBold" style={styles.copySqlBtnText}>
              📋 Copy SQL Schema Script
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={async () => {
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
                  // Reset query state immediately to clear the table error and show the loader
                  queryClient.resetQueries({ queryKey: ['vault_entries'] });
                }
              } catch (err) {
                console.error('Verification query failed:', err);
                showToast('Failed to check database', 'error');
              }
            }}
          >
            <ThemedText type="smallBold" style={styles.verifyBtnText}>
              🔄 Verify & Sync
            </ThemedText>
          </TouchableOpacity>

          <ThemedText type="small" style={styles.errorHelpText}>
            Copy the script, open your Supabase Dashboard SQL Editor, paste it, and click "Run" before verifying.
          </ThemedText>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
          <ThemedText type="title" style={styles.errorTitle}>
            Sync Failed
          </ThemedText>
          <ThemedText type="small" style={styles.errorSubtitle}>
            {error.message || 'An error occurred while connecting to Supabase.'}
          </ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={refetch}>
            <ThemedText type="smallBold" style={styles.retryBtnText}>
              🔄 Retry Connection
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : filteredEntries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ThemedText style={styles.emptyIcon}>📂</ThemedText>
          <ThemedText type="title" style={styles.emptyTitle}>
            No entries found
          </ThemedText>
          <ThemedText type="small" style={styles.emptySubtitle}>
            Configure entries in your personal supabase database.
          </ThemedText>
        </View>
      ) : (
        <FlashList
          data={filteredEntries}
          estimatedItemSize={72}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Swipeable
              ref={(ref) => {
                if (ref) swipeableRefs.current.set(item.id, ref);
                else swipeableRefs.current.delete(item.id);
              }}
              renderLeftActions={() => renderLeftActions(item)}
              renderRightActions={() => renderRightActions(item)}
              friction={2}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.entryCard, item.is_archived && styles.archivedCard]}
                onPress={() => handleOpenEditForm(item)}
              >
                <View style={styles.cardHeader}>
                  <ThemedText style={styles.cardIcon}>
                    {item.entry_type === 'password' ? '🔑' : item.entry_type === 'card' ? '💳' : '📄'}
                  </ThemedText>
                  <View style={styles.cardInfo}>
                    <ThemedText type="smallBold" style={styles.cardTitle}>
                      {item.title}
                    </ThemedText>
                    <ThemedText type="small" style={styles.cardSubtitle}>
                      {item.entry_type === 'password' 
                        ? item.login_username || item.login_email || 'No Username'
                        : item.entry_type === 'card'
                          ? `•••• •••• •••• ${item.card_number?.slice(-4) || ''}`
                          : item.doc_number || 'No Doc Number'}
                    </ThemedText>
                  </View>
                </View>
                {item.is_archived && (
                  <View style={styles.archiveTag}>
                    <ThemedText type="small" style={styles.archiveTagText}>Archived</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            </Swipeable>
          )}
        />
      )}

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowFABSheet(true)}>
        <ThemedText style={styles.fabText}>+</ThemedText>
      </TouchableOpacity>

      {/* FAB Options Bottom Sheet (Modal wrapper) */}
      <Modal
        visible={showFABSheet}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFABSheet(false)}
      >
        <TouchableOpacity 
          style={styles.sheetOverlay} 
          activeOpacity={1} 
          onPress={() => setShowFABSheet(false)}
        >
          <ThemedView style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <ThemedText type="smallBold" style={styles.sheetTitle}>ADD NEW RECORD</ThemedText>
            </View>

            <TouchableOpacity 
              style={styles.sheetButton} 
              onPress={() => handleOpenCreateForm('password')}
            >
              <ThemedText style={styles.sheetBtnIcon}>🔑</ThemedText>
              <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Password Record</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.sheetButton} 
              onPress={() => handleOpenCreateForm('card')}
            >
              <ThemedText style={styles.sheetBtnIcon}>💳</ThemedText>
              <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Credit Card Record</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.sheetButton} 
              onPress={() => handleOpenCreateForm('document')}
            >
              <ThemedText style={styles.sheetBtnIcon}>📄</ThemedText>
              <ThemedText type="smallBold" style={styles.sheetBtnText}>Add Secure Document Record</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </TouchableOpacity>
      </Modal>

      {/* Entry Forms Modal (Create & Edit) */}
      <Modal
        visible={showFormModal}
        animationType="slide"
        onRequestClose={() => setShowFormModal(false)}
      >
        <ThemedView style={styles.formContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.formNavbar}>
              <TouchableOpacity onPress={() => setShowFormModal(false)}>
                <ThemedText type="smallBold" style={styles.navCloseBtn}>Cancel</ThemedText>
              </TouchableOpacity>
              <ThemedText type="smallBold" style={styles.navTitle}>
                {editEntryId ? 'EDIT RECORD' : `NEW ${formType?.toUpperCase()}`}
              </ThemedText>
              <TouchableOpacity onPress={handleSaveForm}>
                <ThemedText type="smallBold" style={styles.navSaveBtn}>Save</ThemedText>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              {/* Form Title (Common for all types) */}
              <View style={styles.formInputGroup}>
                <ThemedText type="smallBold" style={styles.formLabel}>RECORD TITLE</ThemedText>
                <TextInput
                  style={[styles.formInput, formErrors.title && styles.formInputError]}
                  value={formData.title || ''}
                  onChangeText={(val) => handleFieldChange('title', val)}
                  placeholder="e.g. Personal Gmail"
                  placeholderTextColor="#60646C"
                />
                {formErrors.title && <ThemedText type="small" style={styles.formErrorText}>{formErrors.title}</ThemedText>}
              </View>

              {/* Form Type 1: Passwords */}
              {formType === 'password' && (
                <>
                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>USERNAME</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={formData.login_username || ''}
                      onChangeText={(val) => handleFieldChange('login_username', val)}
                      placeholder="Username"
                      placeholderTextColor="#60646C"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>EMAIL ADDRESS</ThemedText>
                    <TextInput
                      style={[styles.formInput, formErrors.login_email && styles.formInputError]}
                      value={formData.login_email || ''}
                      onChangeText={(val) => handleFieldChange('login_email', val)}
                      placeholder="email@example.com"
                      placeholderTextColor="#60646C"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {formErrors.login_email && <ThemedText type="small" style={styles.formErrorText}>{formErrors.login_email}</ThemedText>}
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>PHONE NUMBER</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={formData.login_phone || ''}
                      onChangeText={(val) => handleFieldChange('login_phone', val)}
                      placeholder="Phone"
                      placeholderTextColor="#60646C"
                      keyboardType="phone-pad"
                    />
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>PASSWORD</ThemedText>
                    <View style={styles.secureInputWrapper}>
                      <TextInput
                        style={[styles.secureTextInput, formErrors.login_password && styles.formInputError]}
                        value={formData.login_password || ''}
                        onChangeText={(val) => handleFieldChange('login_password', val)}
                        secureTextEntry={isSecurePass}
                        placeholder="Password"
                        placeholderTextColor="#60646C"
                        autoCapitalize="none"
                      />
                      <TouchableOpacity 
                        style={styles.secureToggle} 
                        onPress={() => setIsSecurePass(!isSecurePass)}
                      >
                        <ThemedText style={{ fontSize: 16 }}>{isSecurePass ? '👁️' : '🕶️'}</ThemedText>
                      </TouchableOpacity>
                      {formData.login_password ? (
                        <TouchableOpacity 
                          style={styles.secureCopy} 
                          onPress={() => handleCopySecureValue(formData.login_password, 'Password')}
                        >
                          <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {formErrors.login_password && <ThemedText type="small" style={styles.formErrorText}>{formErrors.login_password}</ThemedText>}
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>WEBSITE URL</ThemedText>
                    <TextInput
                      style={[styles.formInput, formErrors.website && styles.formInputError]}
                      value={formData.website || ''}
                      onChangeText={(val) => handleFieldChange('website', val)}
                      placeholder="https://example.com"
                      placeholderTextColor="#60646C"
                      keyboardType="url"
                      autoCapitalize="none"
                    />
                    {formErrors.website && <ThemedText type="small" style={styles.formErrorText}>{formErrors.website}</ThemedText>}
                  </View>
                </>
              )}

              {/* Form Type 2: Credit Cards */}
              {formType === 'card' && (
                <>
                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>CARDHOLDER NAME</ThemedText>
                    <TextInput
                      style={[styles.formInput, formErrors.card_name && styles.formInputError]}
                      value={formData.card_name || ''}
                      onChangeText={(val) => handleFieldChange('card_name', val)}
                      placeholder="Full Name"
                      placeholderTextColor="#60646C"
                    />
                    {formErrors.card_name && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_name}</ThemedText>}
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>CARD NUMBER</ThemedText>
                    <View style={styles.secureInputWrapper}>
                      <TextInput
                        style={[styles.secureTextInput, formErrors.card_number && styles.formInputError]}
                        value={formData.card_number || ''}
                        onChangeText={(val) => handleFieldChange('card_number', val)}
                        placeholder="0000 0000 0000 0000"
                        placeholderTextColor="#60646C"
                        keyboardType="numeric"
                      />
                      {formData.card_number ? (
                        <TouchableOpacity 
                          style={styles.secureCopy} 
                          onPress={() => handleCopySecureValue(formData.card_number.replace(/\s/g, ''), 'Card number')}
                        >
                          <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {formErrors.card_number && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_number}</ThemedText>}
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.formInputGroup, { flex: 1 }]}>
                      <ThemedText type="smallBold" style={styles.formLabel}>EXPIRY DATE</ThemedText>
                      <TextInput
                        style={[styles.formInput, formErrors.card_expiry && styles.formInputError]}
                        value={formData.card_expiry || ''}
                        onChangeText={(val) => handleFieldChange('card_expiry', val)}
                        placeholder="MM/YY"
                        placeholderTextColor="#60646C"
                        keyboardType="numeric"
                        maxLength={5}
                      />
                      {formErrors.card_expiry && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_expiry}</ThemedText>}
                    </View>

                    <View style={[styles.formInputGroup, { flex: 1, marginLeft: Spacing.three }]}>
                      <ThemedText type="smallBold" style={styles.formLabel}>CVV SECURITY CODE</ThemedText>
                      <View style={styles.secureInputWrapper}>
                        <TextInput
                          style={[styles.secureTextInput, formErrors.card_cvv && styles.formInputError]}
                          value={formData.card_cvv || ''}
                          onChangeText={(val) => handleFieldChange('card_cvv', val)}
                          secureTextEntry={isSecureCVV}
                          placeholder="123"
                          placeholderTextColor="#60646C"
                          keyboardType="numeric"
                          maxLength={4}
                        />
                        <TouchableOpacity 
                          style={styles.secureToggle} 
                          onPress={() => setIsSecureCVV(!isSecureCVV)}
                        >
                          <ThemedText style={{ fontSize: 16 }}>{isSecureCVV ? '👁️' : '🕶️'}</ThemedText>
                        </TouchableOpacity>
                      </View>
                      {formErrors.card_cvv && <ThemedText type="small" style={styles.formErrorText}>{formErrors.card_cvv}</ThemedText>}
                    </View>
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>CARD PIN (OPTIONAL)</ThemedText>
                    <TextInput
                      style={styles.formInput}
                      value={formData.card_pin || ''}
                      onChangeText={(val) => handleFieldChange('card_pin', val)}
                      placeholder="PIN code"
                      placeholderTextColor="#60646C"
                      keyboardType="numeric"
                      secureTextEntry
                      maxLength={6}
                    />
                  </View>
                </>
              )}

              {/* Form Type 3: Secure Documents */}
              {formType === 'document' && (
                <>
                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>FULL NAME ON DOCUMENT</ThemedText>
                    <TextInput
                      style={[styles.formInput, formErrors.doc_full_name && styles.formInputError]}
                      value={formData.doc_full_name || ''}
                      onChangeText={(val) => handleFieldChange('doc_full_name', val)}
                      placeholder="Full name"
                      placeholderTextColor="#60646C"
                    />
                    {formErrors.doc_full_name && <ThemedText type="small" style={styles.formErrorText}>{formErrors.doc_full_name}</ThemedText>}
                  </View>

                  <View style={styles.formInputGroup}>
                    <ThemedText type="smallBold" style={styles.formLabel}>DOCUMENT NUMBER</ThemedText>
                    <View style={styles.secureInputWrapper}>
                      <TextInput
                        style={[styles.secureTextInput, formErrors.doc_number && styles.formInputError]}
                        value={formData.doc_number || ''}
                        onChangeText={(val) => handleFieldChange('doc_number', val)}
                        placeholder="ID or passport number"
                        placeholderTextColor="#60646C"
                        autoCapitalize="characters"
                      />
                      {formData.doc_number ? (
                        <TouchableOpacity 
                          style={styles.secureCopy} 
                          onPress={() => handleCopySecureValue(formData.doc_number, 'Document number')}
                        >
                          <ThemedText type="smallBold" style={{ color: '#0A84FF' }}>COPY</ThemedText>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {formErrors.doc_number && <ThemedText type="small" style={styles.formErrorText}>{formErrors.doc_number}</ThemedText>}
                  </View>

                  <View style={styles.formRow}>
                    <View style={[styles.formInputGroup, { flex: 1 }]}>
                      <ThemedText type="smallBold" style={styles.formLabel}>ISSUE DATE</ThemedText>
                      <TextInput
                        style={styles.formInput}
                        value={formData.doc_issue_date || ''}
                        onChangeText={(val) => handleFieldChange('doc_issue_date', val)}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#60646C"
                      />
                    </View>

                    <View style={[styles.formInputGroup, { flex: 1, marginLeft: Spacing.three }]}>
                      <ThemedText type="smallBold" style={styles.formLabel}>EXPIRATION DATE</ThemedText>
                      <TextInput
                        style={styles.formInput}
                        value={formData.doc_expiry_date || ''}
                        onChangeText={(val) => handleFieldChange('doc_expiry_date', val)}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#60646C"
                      />
                    </View>
                  </View>
                </>
              )}

              {/* Common: Notes */}
              <View style={styles.formInputGroup}>
                <ThemedText type="smallBold" style={styles.formLabel}>NOTES / SECURE REMARKS</ThemedText>
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={formData.notes || ''}
                  onChangeText={(val) => handleFieldChange('notes', val)}
                  placeholder="Add details, backup recovery phrases, security questions..."
                  placeholderTextColor="#60646C"
                  multiline={true}
                  numberOfLines={4}
                  scrollEnabled={false}
                />
              </View>

              {/* Form Actions (Only visible in edit mode) */}
              {editEntryId && (
                <TouchableOpacity 
                  style={styles.formDeleteBtn} 
                  onPress={() => {
                    setShowFormModal(false);
                    handleDeleteRow(editEntryId);
                  }}
                >
                  <ThemedText type="smallBold" style={styles.formDeleteBtnText}>
                    Delete Record
                  </ThemedText>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
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
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  entryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  archivedCard: {
    opacity: 0.45, // Faded archived opacity
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 24,
    marginRight: Spacing.three,
  },
  cardInfo: {
    justifyContent: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  cardSubtitle: {
    color: '#60646C',
    fontSize: 12,
    marginTop: 2,
  },
  archiveTag: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2E3135',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.one,
  },
  archiveTagText: {
    color: '#B0B4BA',
    fontSize: 10,
  },
  // Swipeable Action Styles
  deleteAction: {
    backgroundColor: '#FF453A',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archiveAction: {
    backgroundColor: '#0A84FF',
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restoreAction: {
    backgroundColor: '#30D158',
  },
  actionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  actionLabelText: {
    color: '#FFFFFF',
    fontSize: 11,
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
  // Bottom Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five + 10,
    borderTopWidth: 1.5,
    borderTopColor: '#2E3135',
  },
  sheetHeader: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  sheetHandle: {
    width: 36,
    height: 5,
    backgroundColor: '#60646C',
    borderRadius: 2.5,
    marginBottom: Spacing.two,
  },
  sheetTitle: {
    color: '#60646C',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    marginTop: Spacing.two,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  sheetBtnIcon: {
    fontSize: 22,
    marginRight: Spacing.three,
  },
  sheetBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  // Form Styles
  formContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  formNavbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  navCloseBtn: {
    color: '#FF453A',
    fontSize: 15,
  },
  navSaveBtn: {
    color: '#0A84FF',
    fontSize: 15,
  },
  navTitle: {
    color: '#FFFFFF',
    fontSize: 15,
  },
  formScroll: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  formInputGroup: {
    marginBottom: Spacing.four,
  },
  formLabel: {
    color: '#60646C',
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: Spacing.one,
  },
  formInput: {
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E3135',
  },
  formInputError: {
    borderColor: '#FF453A',
  },
  formErrorText: {
    color: '#FF453A',
    fontSize: 12,
    marginTop: 4,
  },
  secureInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#2E3135',
    overflow: 'hidden',
  },
  secureTextInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 15,
  },
  secureToggle: {
    paddingHorizontal: Spacing.two + 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secureCopy: {
    backgroundColor: '#2C2C2E',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    justifyContent: 'center',
  },
  formRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: Spacing.two,
  },
  formDeleteBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.3)',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
  formDeleteBtnText: {
    color: '#FF453A',
    fontSize: 15,
  },
});
