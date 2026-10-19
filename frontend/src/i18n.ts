// Import the core function from vue-i18n to create the internationalization instance
import { createI18n } from 'vue-i18n';
import common from './locales/common';
import onboarding from './locales/onboarding';
import identity from './locales/identity';
import admin from './locales/admin';
import learner from './locales/learner';
import builder from './locales/builder';
import media from './locales/media';
import moderation from './locales/moderation';
import progress from './locales/progress';

// Define the supported languages as a constant array
// This prevents typos and allows us to derive a strict TypeScript type below
export const supportedLocales = ['english', 'zulu'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

// Use the local choice for the first render. Authenticated startup later
// replaces it with the database preference when one exists.
const initialLocale: SupportedLocale = readStoredLocale() ?? 'english';

// Every slice keeps its wording in its own file under src/locales/, each with an
// English and an isiZulu half. They are merged here, one namespace per file
// (onboarding's file holds the navigation, setup, auth and placement namespaces).
type LocaleModule = {
  english: Record<string, unknown>;
  zulu: Record<string, unknown>;
  serverMessages?: Record<string, string>;
};

export const localeModules: Record<string, LocaleModule> = {
  common, onboarding, identity, admin, learner, builder, media, moderation, progress,
};

const modules = Object.values(localeModules);

const messages = {
  english: Object.assign({}, ...modules.map((m) => m.english)),
  zulu: Object.assign({}, ...modules.map((m) => m.zulu)),
};

// Exact English error messages the server sends, with their isiZulu wording.
// common's shared wording is applied last, so it always wins over a slice's own.
const serverMessagesZulu: Record<string, string> = Object.assign(
  {}, ...modules.map((m) => m.serverMessages ?? {}), common.serverMessages,
); // 'as const' ensures TypeScript treats this as a deeply immutable, strongly-typed object

// Create and configure the i18n instance
export const i18n = createI18n({
  legacy: false, // Set to false to enable Vue 3 Composition API support (useI18n)
  locale: initialLocale, // Set the starting language calculated above
  fallbackLocale: 'english', // If a translation is missing in Zulu, fall back to English
  messages, // Load the translation dictionary
});

/**
 * Helper function to globally change the application's interface language.
 * It updates the reactive i18n state and persists the choice to localStorage.
 * 
 * @param locale - The new language to apply ('english' or 'zulu')
 */
export function setInterfaceLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  // Use optional chaining on globalThis.localStorage to ensure safety in non-browser environments (like SSR/testing)
  globalThis.localStorage?.setItem('lingolearn_interface_language', locale);
}

/**
 * Safely reads and validates the locally cached language preference from the browser.
 * 
 * @returns The supported locale if valid and present, otherwise null.
 */
function readStoredLocale(): SupportedLocale | null {
  const storedLocale = globalThis.localStorage?.getItem('lingolearn_interface_language')?.toLowerCase(); /* just in case it's spelt with a capital letter */
  return storedLocale === 'english' || storedLocale === 'zulu' ? storedLocale : null;
}

/**
 * Parses and validates an unknown input value against the list of supported locales.
 * Useful for validating raw data coming from APIs or untyped sources.
 * 
 * @param value - The raw value to check
 * @returns A strictly typed SupportedLocale if valid, otherwise null.
 */
export function toSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string') return null;
  const locale = value.trim().toLowerCase();
  return locale === 'english' || locale === 'zulu' ? locale : null;
}

/**
 * Determines the final interface language by following a strict priority fallback chain:
 * 1. Database preference (if provided and valid)
 * 2. Local storage preference (if previously set on this device)
 * 3. Default fallback ('english')
 * 
 * @param databaseLocale - The raw locale value fetched from the user's backend profile (optional)
 * @returns The computed SupportedLocale
 */
export function resolveInterfaceLocale(databaseLocale?: unknown): SupportedLocale {
  return toSupportedLocale(databaseLocale) ?? readStoredLocale() ?? 'english';
}

/**
 * Orchestrator function called during application bootstrap or user login.
 * Resolves the best available language preference and applies it globally to the app.
 * 
 * @param databaseLocale - The raw locale value fetched from the user's backend profile (optional)
 * @returns The resolved and newly applied SupportedLocale
 */
export function applyInitialInterfaceLocale(databaseLocale?: unknown): SupportedLocale {
  const resolvedLocale = resolveInterfaceLocale(databaseLocale);
  setInterfaceLocale(resolvedLocale);
  return resolvedLocale;
}

/** The locale tag for dates and numbers (Intl) in the current interface language. */
export function intlLocale(): string {
  return i18n.global.locale.value === 'zulu' ? 'zu-ZA' : 'en-ZA';
}

/**
 * A message from the server, in the interface language. Server errors are written
 * in English; known ones have isiZulu wording in their slice's serverMessages.
 * Anything unknown is shown as the server sent it.
 */
export function localizeServerMessage(message: string | null | undefined): string {
  if (!message) return '';
  if (i18n.global.locale.value !== 'zulu') return message;
  return serverMessagesZulu[message] ?? message;
}

/** The options for the one long form dates are shown in: "1 March 2010", "Mashi 1, 2010". */
const LONG_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** Reads an ISO time, or a date-only 'YYYY-MM-DD' as that calendar day wherever the browser is. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

/** A date in the interface language's long form; '' when the value is not a date. */
export function formatLongDate(value: string | Date): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(intlLocale(), LONG_DATE);
}

/** A date and time of day in the interface language's long form; '' when the value is not a date. */
export function formatLongDateTime(value: string | Date): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(intlLocale(), { ...LONG_DATE, hour: '2-digit', minute: '2-digit' });
}
