import { isBrowser } from './discovery';

/** Identifiers persisted so a wallet can be re-matched on reload. */
export interface StoredWallet {
  account: string;
  uuid: string;
  name: string;
  rdns: string;
}

/**
 * Minimal synchronous key/value store. The browser `localStorage` satisfies
 * this; consumers can pass their own (e.g. a cookie- or memory-backed store).
 */
export interface ConnectorStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/** A no-op store used during SSR or when persistence is disabled. */
export const noopStorage: ConnectorStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Returns `localStorage` when usable, otherwise the no-op store. */
export const defaultStorage = (): ConnectorStorage => {
  if (!isBrowser()) return noopStorage;
  try {
    const test = '__eip6963_test__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    // localStorage can throw in private mode / when blocked.
    return noopStorage;
  }
};

export const readStoredWallet = (
  storage: ConnectorStorage,
  key: string
): StoredWallet | null => {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredWallet>;
    if (parsed && typeof parsed.account === 'string') {
      return parsed as StoredWallet;
    }
  } catch {
    // Corrupt entry — treat as absent.
  }
  return null;
};

export const writeStoredWallet = (
  storage: ConnectorStorage,
  key: string,
  value: StoredWallet
): void => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / availability errors.
  }
};

export const clearStoredWallet = (
  storage: ConnectorStorage,
  key: string
): void => {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore.
  }
};
