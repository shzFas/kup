import * as SecureStore from 'expo-secure-store';

/** Tiny persisted flags (SecureStore is the only key-value storage the app uses). */
export async function getFlag(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(`kup.flag.${key}`)) === '1';
  } catch {
    return false;
  }
}

export async function setFlag(key: string, value = true) {
  try {
    if (value) await SecureStore.setItemAsync(`kup.flag.${key}`, '1');
    else await SecureStore.deleteItemAsync(`kup.flag.${key}`);
  } catch {
    // ignore storage errors
  }
}
