import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getOrCreateDeviceId } from '../deviceId';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-application', () => ({ getAndroidId: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const DEVICE_ID_KEY = '@battle4gmp/device-id';

describe('getOrCreateDeviceId', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    Platform.OS = 'ios';
  });

  it('returns the cached AsyncStorage id without touching platform stores', async () => {
    await AsyncStorage.setItem(DEVICE_ID_KEY, 'cached-id');

    const id = await getOrCreateDeviceId();

    expect(id).toBe('cached-id');
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(Application.getAndroidId).not.toHaveBeenCalled();
  });

  describe('when AsyncStorage is empty (fresh install or reinstall)', () => {
    describe('on Android', () => {
      beforeEach(() => {
        Platform.OS = 'android';
      });

      it('uses the stable Android ID directly', async () => {
        (Application.getAndroidId as jest.Mock).mockReturnValue('android-hardware-id');

        const id = await getOrCreateDeviceId();

        expect(id).toBe('android-hardware-id');
        expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBe('android-hardware-id');
      });

      it('falls back to a generated id if the Android ID is empty', async () => {
        (Application.getAndroidId as jest.Mock).mockReturnValue('');

        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
        expect(id).not.toBe('');
      });

      it('falls back to a generated id if reading the Android ID throws', async () => {
        (Application.getAndroidId as jest.Mock).mockImplementation(() => {
          throw new Error('native module unavailable');
        });

        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
      });
    });

    describe('on iOS', () => {
      beforeEach(() => {
        Platform.OS = 'ios';
      });

      it('recovers the id from the Keychain when a reinstall left one behind', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('keychain-survivor-id');

        const id = await getOrCreateDeviceId();

        expect(id).toBe('keychain-survivor-id');
        expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBe('keychain-survivor-id');
      });

      it('mints and stores a new id in the Keychain on a genuine first install', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(DEVICE_ID_KEY, id);
        expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBe(id);
      });

      it('still returns a usable id if the Keychain read throws', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('keychain unavailable'));

        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
      });

      it('still returns a usable id if the Keychain write throws', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
        (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('keychain unavailable'));

        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
      });
    });

    describe('on web', () => {
      beforeEach(() => {
        Platform.OS = 'web';
      });

      it('generates a random id without touching any platform store', async () => {
        const id = await getOrCreateDeviceId();

        expect(id).toBeTruthy();
        expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
        expect(Application.getAndroidId).not.toHaveBeenCalled();
        expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBe(id);
      });
    });
  });
});
