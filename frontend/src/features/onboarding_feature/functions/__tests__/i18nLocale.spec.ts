// Import lifecycle and assertion utilities for locale-precedence scenarios.
import { afterEach, describe, expect, it, vi } from 'vitest';

// Create an isolated fake browser storage implementation before modules load.
const { storage } = vi.hoisted(() => {
  // Keep key/value state local to this suite instead of using real user settings.
  const values = new Map<string, string>();
  // Implement the storage operations consumed by locale resolution.
  const mockStorage = {
    // Return the stored preference or null when no preference exists.
    getItem: (key: string) => values.get(key) ?? null,
    // Save a preference exactly as a browser storage implementation would.
    setItem: (key: string, value: string) => values.set(key, value),
    // Remove all preferences to isolate the next test case.
    clear: () => values.clear(),
  };
  // Replace global localStorage so locale code can run under the test environment.
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mockStorage });
  // Expose the mock for direct setup and cleanup in each case.
  return { storage: mockStorage };
});
// Import locale helpers after the test storage mock has been established.
import {
  applyInitialInterfaceLocale,
  i18n,
  resolveInterfaceLocale,
  toSupportedLocale,
} from '@/i18n';

afterEach(() => {
  // Remove persisted test preferences so they cannot affect later cases.
  storage.clear();
  // Restore English as the shared translator's initial locale.
  i18n.global.locale.value = 'english';
});

describe('interface locale precedence', () => {
  it('uses a valid database preference first', () => {
    // Store a supported locale that conflicts with the onboarding preference.
    storage.setItem('lingolearn_interface_language', 'english');

    // A valid saved setup value takes precedence over browser storage.
    expect(resolveInterfaceLocale('Zulu')).toBe('zulu');
    // Applying the preference should return the chosen supported locale.
    expect(applyInitialInterfaceLocale('Zulu')).toBe('zulu');
    // Synchronize vue-i18n's active locale with the resolved preference.
    expect(i18n.global.locale.value).toBe('zulu');
  });

  it('falls back to the onboarding choice when the database has no preference', () => {
    // Store a previous preference while omitting a saved database setting.
    storage.setItem('lingolearn_interface_language', 'zulu');

    // Use the browser preference when the backend has no value yet.
    expect(resolveInterfaceLocale(undefined)).toBe('zulu');
    // Apply that fallback to the initial interface locale.
    expect(applyInitialInterfaceLocale(undefined)).toBe('zulu');
  });

  it('defaults to English when neither source provides a supported locale', () => {
    // Store an unsupported browser value to exercise the final fallback.
    storage.setItem('lingolearn_interface_language', 'isiXhosa');

    // Ignore unsupported database input and choose the supported default.
    expect(resolveInterfaceLocale('unsupported')).toBe('english');
    // Applying the same invalid input should also select English.
    expect(applyInitialInterfaceLocale('unsupported')).toBe('english');
    // Ensure the shared translation service follows the fallback result.
    expect(i18n.global.locale.value).toBe('english');
  });

  it('normalizes supported database values case-insensitively', () => {
    // Trim whitespace and normalize case for English.
    expect(toSupportedLocale(' ENGLISH ')).toBe('english');
    // Normalize a lowercase supported Zulu value without alteration.
    expect(toSupportedLocale('zulu')).toBe('zulu');
    // Reject non-string values rather than coercing them to a locale.
    expect(toSupportedLocale(15)).toBeNull();
  });
});
