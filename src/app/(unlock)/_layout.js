import React from 'react';
import { Stack } from 'expo-router';

export default function UnlockLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="unlock" />
    </Stack>
  );
}
