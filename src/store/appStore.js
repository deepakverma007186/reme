import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { getSupabaseClient } from '../services/supabase';

// Keys used in SecureStore
const SUPABASE_URL_KEY = 'reme_supabase_url';
const SUPABASE_ANON_KEY = 'reme_supabase_anon_key';
const BIOMETRICS_ENABLED_KEY = 'reme_biometrics_enabled';

export const useAppStore = create((set, get) => ({
  // Supabase BYOB Credentials
  supabaseUrl: null,
  supabaseAnonKey: null,
  supabaseConfigured: false,

  // Auth Session
  session: null,

  // Vault Security States (NEVER persisted to disk in plain text!)
  vaultUnlocked: false,
  masterKey: null, // Hex string derived key in-memory
  isSystemPickerActive: false, // Flag to bypass auto-lock when using system camera/gallery

  // Settings & Preferences
  biometricsEnabled: false,

  // UI States
  toast: null, // { message, type: 'success' | 'error' | 'info' }

  // Custom Toast Helpers
  showToast: (message, type = 'info') => {
    // Clear previous timeout if any
    const currentToast = get().toast;
    if (currentToast?.timeoutId) {
      clearTimeout(currentToast.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      get().hideToast();
    }, 4000); // Auto hide after 4 seconds

    set({ toast: { message, type, timeoutId } });
  },

  hideToast: () => {
    const currentToast = get().toast;
    if (currentToast?.timeoutId) {
      clearTimeout(currentToast.timeoutId);
    }
    set({ toast: null });
  },

  // App Initialization
  initStore: async () => {
    try {
      const url = await SecureStore.getItemAsync(SUPABASE_URL_KEY);
      const anonKey = await SecureStore.getItemAsync(SUPABASE_ANON_KEY);
      const biometricsRaw = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);

      const hasCreds = !!(url && anonKey);
      
      if (hasCreds) {
        // Initialize dynamic client
        getSupabaseClient(url, anonKey);
      }

      set({
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        supabaseConfigured: hasCreds,
        biometricsEnabled: biometricsRaw === 'true',
      });
    } catch (e) {
      console.error('Failed to initialize app secure store:', e);
    }
  },

  // Supabase Configuration Management
  saveSupabaseConfig: async (url, anonKey) => {
    try {
      await SecureStore.setItemAsync(SUPABASE_URL_KEY, url);
      await SecureStore.setItemAsync(SUPABASE_ANON_KEY, anonKey);
      
      // Initialize/rebuild client
      getSupabaseClient(url, anonKey);

      set({
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        supabaseConfigured: true,
      });
      get().showToast('Supabase configured successfully', 'success');
    } catch (e) {
      console.error('Error saving Supabase config:', e);
      get().showToast('Failed to save configuration', 'error');
      throw e;
    }
  },

  clearSupabaseConfig: async () => {
    try {
      await SecureStore.deleteItemAsync(SUPABASE_URL_KEY);
      await SecureStore.deleteItemAsync(SUPABASE_ANON_KEY);
      await SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY);
      await SecureStore.deleteItemAsync('reme_master_key');

      set({
        supabaseUrl: null,
        supabaseAnonKey: null,
        supabaseConfigured: false,
        session: null,
        vaultUnlocked: false,
        masterKey: null,
        biometricsEnabled: false,
      });
      get().showToast('Configuration cleared', 'info');
    } catch (e) {
      console.error('Error clearing Supabase config:', e);
      get().showToast('Failed to clear configuration', 'error');
    }
  },

  // Auth Operations
  setSession: (session) => {
    set({ session });
  },

  // Vault Lock State Operations
  unlockVault: (derivedKey) => {
    set({
      vaultUnlocked: true,
      masterKey: derivedKey,
    });
  },

  lockVault: () => {
    set({
      vaultUnlocked: false,
      masterKey: null,
    });
  },

  setSystemPickerActive: (active) => {
    set({ isSystemPickerActive: active });
  },

  // Biometrics Preference Operations
  setBiometricsEnabled: async (enabled, activeMasterKey = null) => {
    try {
      await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, enabled ? 'true' : 'false');
      
      if (enabled && activeMasterKey) {
        // Securely store the in-memory master key for biometric recovery
        await SecureStore.setItemAsync('reme_master_key', activeMasterKey);
      } else {
        // Clear stored key if disabled
        await SecureStore.deleteItemAsync('reme_master_key');
      }

      set({ biometricsEnabled: enabled });
      get().showToast(enabled ? 'Biometrics enabled' : 'Biometrics disabled', 'success');
    } catch (e) {
      console.error('Error setting biometrics:', e);
      get().showToast('Failed to save biometric preference', 'error');
    }
  },
}));
