import { toSupportedLocale, type SupportedLocale } from '@/i18n';

/**
 * The language a learner's menus and buttons are in. A learner of English reads
 * the app in English, whatever was chosen before; only a learner of isiZulu
 * chooses, and English is used when there is no valid choice. The server keeps
 * the same rule (backend/src/shared/learnerInterfaceLanguage.ts).
 */
export function learnerInterfaceLanguage(targetLanguage: unknown, chosen: unknown): SupportedLocale {
    if (typeof targetLanguage === 'string' && targetLanguage.trim().toLowerCase() === 'english') return 'english';
    return toSupportedLocale(chosen) ?? 'english';
}
