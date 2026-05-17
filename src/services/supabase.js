import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

/**
 * Custom Secure Storage adapter for Supabase client auth state.
 * Replaces standard AsyncStorage with high-security expo-secure-store.
 */
const secureStoreStorage = {
  getItem: async (key) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      console.warn('Error reading from SecureStore:', e);
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (e) {
      console.error('Error writing to SecureStore:', e);
    }
  },
  removeItem: async (key) => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      console.error('Error deleting from SecureStore:', e);
    }
  },
};

let supabaseInstance = null;
let cachedUrl = null;
let cachedAnonKey = null;

/**
 * Dynamically retrieves or creates a Supabase client.
 * If credentials are new, it tears down the old instance and constructs a new one.
 * @param {string} url - The Supabase project URL.
 * @param {string} anonKey - The Supabase anon key.
 * @returns {object|null} The Supabase client instance, or null if credentials are invalid.
 */
export function getSupabaseClient(url, anonKey) {
  if (!url || !anonKey) {
    return null;
  }

  // Use cached instance if credentials match
  if (supabaseInstance && url === cachedUrl && anonKey === cachedAnonKey) {
    return supabaseInstance;
  }

  // Construct new client instance
  cachedUrl = url;
  cachedAnonKey = anonKey;
  
  supabaseInstance = createClient(url, anonKey, {
    auth: {
      storage: secureStoreStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  return supabaseInstance;
}

/**
 * Convenience helper to get the currently cached Supabase client instance.
 * @returns {object|null}
 */
export function getCachedSupabaseClient() {
  return supabaseInstance;
}
