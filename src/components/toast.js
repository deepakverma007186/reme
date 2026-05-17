import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './themed-text';
import { useAppStore } from '../store/appStore';
import { Spacing } from '@/constants/theme';

export function Toast() {
  const toast = useAppStore((state) => state.toast);
  const insets = useSafeAreaInsets();

  if (!toast) return null;

  const { message, type } = toast;

  // Choose styling colors based on notification type
  const typeStyles = styles[type] || styles.info;

  return (
    <Animated.View
      entering={FadeInUp.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={[
        styles.container,
        { top: insets.top + Spacing.two },
        typeStyles.border,
      ]}
    >
      <View style={[styles.indicator, typeStyles.bg]} />
      <View style={styles.textContainer}>
        <ThemedText type="smallBold" style={styles.messageText}>
          {message}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.four,
    right: Spacing.four,
    backgroundColor: 'rgba(28, 28, 30, 0.95)', // Sleek premium glass-like dark card
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    borderWidth: 1.5,
    zIndex: 99999,
  },
  indicator: {
    width: 6,
    height: 18,
    borderRadius: 3,
    marginRight: Spacing.two,
  },
  textContainer: {
    flex: 1,
  },
  messageText: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 18,
  },
  success: {
    border: {
      borderColor: 'rgba(52, 199, 89, 0.3)', // Emerald Accent
    },
    bg: {
      backgroundColor: '#34C759',
    },
  },
  error: {
    border: {
      borderColor: 'rgba(255, 69, 58, 0.3)', // Rose Accent
    },
    bg: {
      backgroundColor: '#FF453A',
    },
  },
  info: {
    border: {
      borderColor: 'rgba(10, 132, 255, 0.3)', // Blue/Slate Accent
    },
    bg: {
      backgroundColor: '#0A84FF',
    },
  },
});
