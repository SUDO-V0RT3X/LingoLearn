//LIN-47's way of picking N random questions for a level-up challenge from the
//question blocks of approved content at the level being attempted.
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import type { ContentBlock } from '../../contentRoutes/types/contentType.js';
import type { ChallengeCandidate } from '../types/progressType.js';

/** How many questions a challenge asks, at most. */
export const CHALLENGE_QUESTION_COUNT = 15;

/** Fewer approved questions than this at a level, and its challenge cannot run yet. */
export const MIN_CHALLENGE_QUESTIONS = 5;

//fischer-yates shuffle: unbiased way to randomize an array
function defaultShuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

//A choice question needs options to pick from and a right one among them.
function hasChoices(value: Record<string, unknown>): boolean {
    const options = Array.isArray(value.options) ? value.options as unknown[] : [];
    const filled = options.filter(option => typeof option === 'string' && option.trim() !== '');
    const correct = value.correctOption;
    return filled.length >= 2 && typeof correct === 'number' && Number.isInteger(correct)
        && typeof options[correct] === 'string' && (options[correct] as string).trim() !== '';
}

export class QuestionSelector {
    /**
     * Picks `count` items at random from the pool. If the pool has fewer than
     * requested, returns everything available rather than throwing.
     * `shuffle` is injectable (defaults to random real one) so tests can verify the selection logic
     * without depending on real randomness.
     */
    static selectQuestions<T>(
        pool: T[],
        count: number,
        shuffle: (items: T[]) => T[] = defaultShuffle,
    ): T[] {
        const shuffled = shuffle([...pool]);
        return shuffled.slice(0, count);
    }

    /**
     * Whether a question block can be answered and marked: content that skipped
     * the builder's checks (or was stored before them) is left out of a challenge
     * rather than counting against the learner.
     */
    static isAnswerable(block: ContentBlock): boolean {
        const value = block.value ?? {};
        switch (block.itemType) {
            case 'Multiple Choice':
                return typeof value.question === 'string' && value.question.trim() !== '' && hasChoices(value);
            case 'Listen and Choose':
                return typeof value.fileUrl === 'string' && value.fileUrl !== '' && hasChoices(value);
            case 'Fill in the Blank': {
                const accepted = Array.isArray(value.accepted) ? value.accepted as unknown[] : [];
                return typeof value.sentence === 'string' && value.sentence.trim() !== ''
                    && accepted.some(spelling => typeof spelling === 'string' && spelling.trim() !== '');
            }
            default:
                return false;
        }
    }

    /**
     * Draws a challenge from the candidate questions. Questions in the learner's
     * own language are preferred; when there are not enough of those, the whole
     * pool is used. Refuses (409) when even that is too small to be a fair test.
     */
    static drawForChallenge(
        candidates: ChallengeCandidate[],
        preferredLanguage: string | null,
        shuffle: (items: ChallengeCandidate[]) => ChallengeCandidate[] = defaultShuffle,
    ): ChallengeCandidate[] {
        const answerable = candidates.filter(candidate => QuestionSelector.isAnswerable(candidate.block));
        const inLanguage = answerable.filter(candidate => candidate.language === preferredLanguage);
        const pool = inLanguage.length >= MIN_CHALLENGE_QUESTIONS ? inLanguage : answerable;

        if (pool.length < MIN_CHALLENGE_QUESTIONS) {
            throw new ApiError(409, 'the challenge for this level is not ready yet: there are not enough approved questions');
        }
        return QuestionSelector.selectQuestions(pool, CHALLENGE_QUESTION_COUNT, shuffle);
    }
}

//pool copies the array so shuffling never mutates whatever was passed in.
//shuffle reorders it by default, swapping each element with a random earlier one,
//the standard unbiased way to randomize and array
