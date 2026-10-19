// Extracted from ChallengeIntroScreen.vue's inline function of the same
// name, so it can be unit tested directly — same pattern as
// WaitingTimeFormatter on the review queue screen. The words come from the
// progress locale, in the interface language at the time of the call.
import { i18n } from '@/i18n';

// vue-i18n's typed t() is too deep for the compiler here; this is the same function.
type Translate = (key: string, values?: Record<string, unknown> | number) => string;
const t: Translate = (key, values) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);

export class SecondsRemainingFormatter {
    static format(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        // Cascades down to seconds — this feeds a live countdown that
        // ticks every second, so a formatter that only shows whole
        // minutes would look frozen for up to 59 seconds at a time.
        if (hours >= 1) return t('progress.countdown.hours', { h: hours, m: minutes, s: secs });
        if (minutes >= 1) return t('progress.countdown.minutes', { m: minutes, s: secs });
        return t('progress.countdown.seconds', { s: secs });
    }
}
