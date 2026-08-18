import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = '@battle4gmp/device-id';

// A simple, non-cryptographic unique-enough ID: device_id is an anonymous,
// non-secret identifier, so no crypto/uuid package is needed for it.
function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = generateId();
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}
