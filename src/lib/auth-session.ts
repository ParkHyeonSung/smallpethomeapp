import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { supabase, supabaseAuthStorageKey } from '@/src/lib/supabase';

function isInvalidRefreshTokenError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh token already used')
  );
}

async function clearPersistedAuthSession() {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(supabaseAuthStorageKey);
    }

    return;
  }

  await AsyncStorage.removeItem(supabaseAuthStorageKey);
}

export async function getSessionOrClearInvalidToken(): Promise<Session | null> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await clearPersistedAuthSession();
        return null;
      }

      throw error;
    }

    return session;
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      await clearPersistedAuthSession();
      return null;
    }

    throw error;
  }
}
