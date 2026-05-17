import React, { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, AppState } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import * as ScreenCapture from 'expo-screen-capture';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppStore } from '../store/appStore';
import { getCachedSupabaseClient } from '../services/supabase';
import { Toast } from '../components/toast';
import { AnimatedSplashOverlay } from '../components/animated-icon';

// Create a singleton instance of QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <SafeAreaProvider>
            <AppContent />
            <Toast />
            <StatusBar style="auto" />
          </SafeAreaProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const router = useRouter();
  const segments = useSegments();

  // Zustand State
  const initStore = useAppStore((state) => state.initStore);
  const supabaseConfigured = useAppStore((state) => state.supabaseConfigured);
  const session = useAppStore((state) => state.session);
  const setSession = useAppStore((state) => state.setSession);
  const vaultUnlocked = useAppStore((state) => state.vaultUnlocked);
  const supabaseUrl = useAppStore((state) => state.supabaseUrl);
  const supabaseAnonKey = useAppStore((state) => state.supabaseAnonKey);

  // 1. Initialize store from SecureStore on startup
  useEffect(() => {
    initStore();
  }, []);

  // 2. Setup Supabase authentication change listeners
  useEffect(() => {
    const supabase = getCachedSupabaseClient();
    if (!supabase) return;

    // Fetch active session immediately
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
    });

    // Sub to subsequent events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabaseUrl, supabaseAnonKey]);

  // 3. Centralized Routing State Controller (Redirect Manager)
  useEffect(() => {
    // Determine current route context
    const currentGroup = segments[0];
    const inSetupGroup = currentGroup === '(setup)';
    const inAuthGroup = currentGroup === '(auth)';
    const inUnlockGroup = currentGroup === '(unlock)';
    const inTabsGroup = currentGroup === '(tabs)';

    // Step A: No Supabase Credentials configured
    if (!supabaseConfigured) {
      if (!inSetupGroup) {
        router.replace('/(setup)/setup');
      }
      return;
    }

    // Step B: Configured but no Authenticated Supabase User Session
    if (!session?.user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/auth');
      }
      return;
    }

    // Step C: Authenticated but Vault is Local/Locked
    if (!vaultUnlocked) {
      if (!inUnlockGroup) {
        router.replace('/(unlock)/unlock');
      }
      return;
    }

    // Step D: Unlocked & Authenticated - Navigate to Main App Tabs
    if (!inTabsGroup) {
      router.replace('/(tabs)');
    }
  }, [supabaseConfigured, session, vaultUnlocked, segments]);

  // 4. Auto Lock: immediately lock the vault when the app goes background or inactive
  const lockVault = useAppStore((state) => state.lockVault);
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lockVault();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [lockVault]);

  // 5. Screenshot Protection: block screenshots and screen recordings on sensitive screens when unlocked
  useEffect(() => {
    if (vaultUnlocked) {
      ScreenCapture.preventScreenCaptureAsync();
    } else {
      ScreenCapture.allowScreenCaptureAsync();
    }
  }, [vaultUnlocked]);

  return (
    <>
      <AnimatedSplashOverlay />
      <Slot />
    </>
  );
}
