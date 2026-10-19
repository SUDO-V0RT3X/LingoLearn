// Extracted from ReviewQueueScreen.vue's formatWaiting() so it can be unit
// tested on its own, without mounting a component. Behaviour is unchanged; the
// words come from the moderation locale, in the interface language at the time
// of the call.
import { i18n } from '@/i18n';

// vue-i18n's typed t() is too deep for the compiler here; this is the same function.
type Translate = (key: string, values?: Record<string, unknown> | number) => string;
const t: Translate = (key, values) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);

export class WaitingTimeFormatter {
    static format(iso: string, now: number = Date.now()): string {
        const diffMs = now - new Date(iso).getTime();
        const days = Math.floor(diffMs / 86_400_000);
        if (days >= 1) return t('moderation.queue.waiting.days', days);
        const hours = Math.floor(diffMs / 3_600_000);
        if (hours >= 1) return t('moderation.queue.waiting.hours', hours);
        const minutes = Math.floor(diffMs / 60_000);
        return t('moderation.queue.waiting.minutes', minutes);
    }
}
