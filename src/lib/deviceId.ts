import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = '@battle4gmp/device-id';

// A simple, non-cryptographic unique-enough ID: device_id is an anonymous,
// non-secret identifier, so no crypto/uuid package is needed for it.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// AsyncStorage is wiped on app uninstall, so a reinstall used to always mint a
// brand-new device_id and orphan the player's existing row (and score history).
// When AsyncStorage has nothing cached — a fresh install OR a reinstall — fall
// back to a platform store that outlives an uninstall, so a reinstall recovers
// the same id instead of minting a new one:
//   - Android: Settings.Secure.ANDROID_ID is stable across reinstall (same
//     signing key, no factory reset), so it can be used directly.
//   - iOS: the Keychain (unlike UserDefaults/AsyncStorage) is not cleared on
//     uninstall when the app is reinstalled with the same bundle ID, so a
//     self-generated id stashed there survives a reinstall.
// Any failure here just falls through to generating a fresh random id, same
// as before this existed.
async function recoverOrMintDurableId(): Promise<string> {
  if (Platform.OS === 'android') {
    try {
      const androidId = Application.getAndroidId();
      if (androidId) return androidId;
    } catch {
      // fall through to random id
    }
    return generateId();
  }

  if (Platform.OS === 'ios') {
    try {
      const recovered = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (recovered) return recovered;
    } catch {
      // fall through to minting + best-effort storing a new one
    }
    const id = generateId();
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    } catch {
      // no durable store available; id still works for this install
    }
    return id;
  }

  return generateId();
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = await recoverOrMintDurableId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
