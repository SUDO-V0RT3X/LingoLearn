import { Endpoints } from '@/core/endpoints/endpoints';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import { learnerInterfaceLanguage } from '@/features/onboarding_feature/functions/learnerInterfaceLanguage';
import { setInterfaceLocale, toSupportedLocale, type SupportedLocale } from '@/i18n';
import { authStore, type PublicUser } from '@/features/auth_feature/state/authStore';

//The signed-in account, and the language it had saved when last seen. A saved
//language is applied once per sign-in, and again only when it changes (chosen
//on another device), never on every session check.
let seen: { userId: number; language: SupportedLocale | null } | null = null;

/**
 * Applies the account's interface language when someone signs in, so it
 * follows them to any device.
 *
 * Guardians and staff choose with the header's switch, saved on the account;
 * with nothing saved, this browser's language stays.
 *
 * A learner's setup decides theirs (learner_settings): English while they learn
 * English, whatever was chosen before; their own choice while they learn
 * isiZulu. A new learner with no setup yet keeps the language they signed up
 * in until setup decides.
 */
export async function applySavedLanguageFor(user: PublicUser | null): Promise<void> {
    if (!user) {
        seen = null;
        return;
    }
    if (user.role === 'learner') {
        if (seen?.userId === user.id) return;
        seen = { userId: user.id, language: null };
        await applyLearnerSetupLanguage();
        return;
    }
    const saved = toSupportedLocale(user.interfaceLanguage);
    if (seen?.userId === user.id) {
        if (saved && saved !== seen.language) {
            seen.language = saved;
            setInterfaceLocale(saved);
        }
        return;
    }
    seen = { userId: user.id, language: saved };
    if (saved) setInterfaceLocale(saved);
}

/** Reads the signed-in learner's setup and applies the language it gives (nothing before setup). */
async function applyLearnerSetupLanguage(): Promise<void> {
    const settings = await OnboardingDataSource.getSettings();
    if (!settings.data) return;
    setInterfaceLocale(learnerInterfaceLanguage(settings.data.target_language, settings.data.interface_language));
}

/**
 * Switches the interface language now, and saves it on the signed-in account.
 * The header offers this to guardians, staff and signed-out visitors; a learner
 * chooses in their settings instead.
 */
export async function chooseLanguage(locale: SupportedLocale, user: PublicUser | null): Promise<void> {
    setInterfaceLocale(locale);
    if (!user) return;
    seen = { userId: user.id, language: locale };
    authStore().rememberInterfaceLanguage(locale);
    try {
        await Endpoints.Auth.saveInterfaceLanguage(locale).callWithParser((response) => response.data);
    } catch {
        // The switch still applies in this browser; saving is best effort.
    }
}
