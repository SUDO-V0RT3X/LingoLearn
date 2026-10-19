import { beforeEach } from 'vitest';
import { config } from '@vue/test-utils';
import { i18n } from '@/i18n';

const storageValues = new Map<string, string>();
const localStorageShim: Storage = {
  get length() {
    return storageValues.size;
  },
  clear() {
    storageValues.clear();
  },
  getItem(key: string) {
    return storageValues.get(String(key)) ?? null;
  },
  key(index: number) {
    return Array.from(storageValues.keys())[index] ?? null;
  },
  removeItem(key: string) {
    storageValues.delete(String(key));
  },
  setItem(key: string, value: string) {
    storageValues.set(String(key), String(value));
  },
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageShim,
});

// Every component can use translations in tests, and tests read English unless
// they switch the locale themselves.
config.global.plugins = [...(config.global.plugins ?? []), i18n];

beforeEach(() => {
  localStorageShim.clear();
  i18n.global.locale.value = 'english';
});
