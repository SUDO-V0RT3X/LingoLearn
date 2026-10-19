// Small display rules for the level-up challenge screens, kept out of the
// components so they can be unit tested on their own.
import { CONTENT_LEVELS } from '@/features/shared/models/contentType';
import { i18n } from '@/i18n';

// vue-i18n's typed t() is too deep for the compiler here; this is the same function.
type Translate = (key: string, values?: Record<string, unknown> | number) => string;
const t: Translate = (key, values) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);
import type { ChallengeAnswer } from '../models/ProgressTypes';

export class ChallengeDisplay {
    /** "Level 2 · A1+", or just "Level 9" for a level the app does not name. */
    static levelLabel(level: number): string {
        const named = CONTENT_LEVELS.find(option => option.value === level);
        const plain = t('common.level', { level });
        return named ? t('progress.levelName', { level: plain, name: named.label }) : plain;
    }

    /** How full a progress bar is, as a whole percentage between 0 and 100. */
    static percent(part: number, whole: number): number {
        if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
    }

    /** Whole seconds from `now` until an ISO time; 0 once it has passed or when there is none. */
    static secondsUntil(iso: string | null, now: number = Date.now()): number {
        if (!iso) return 0;
        const end = new Date(iso).getTime();
        if (Number.isNaN(end)) return 0;
        return Math.max(0, Math.ceil((end - now) / 1000));
    }

    /** Whether a question has been given an answer: a pick, or some text in the gap. */
    static isAnswered(answer: ChallengeAnswer | undefined): boolean {
        if (typeof answer === 'number') return Number.isInteger(answer);
        if (typeof answer === 'string') return answer.trim() !== '';
        return false;
    }

    /** The answers as the server takes them: one per question, an empty gap sent as null. */
    static forSubmission(answers: ChallengeAnswer[], questionCount: number): ChallengeAnswer[] {
        return Array.from({ length: questionCount }, (_, index) => {
            const answer = answers[index];
            return ChallengeDisplay.isAnswered(answer) ? answer as number | string : null;
        });
    }
}
