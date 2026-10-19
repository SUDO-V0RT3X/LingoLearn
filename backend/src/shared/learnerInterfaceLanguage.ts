// A learner's interface language follows what they study: a learner of English
// sees the app in English (the whole point is to read it), and only a learner of
// isiZulu chooses between English and isiZulu menus. learner_settings holds both
// the target and the interface language, and is the learner's source of truth.

/** The refusal when a learner of English asks for isiZulu menus and buttons. */
export const ENGLISH_LEARNERS_SEE_ENGLISH = 'learners of English see the app in English';

/**
 * The interface language a learner's setup stores: English for a learner of
 * English whatever was sent, otherwise the language they chose.
 */
export function interfaceLanguageForTarget(targetLanguage: string, chosen: string): string {
    return targetLanguage.trim().toLowerCase() === 'english' ? 'english' : chosen;
}
