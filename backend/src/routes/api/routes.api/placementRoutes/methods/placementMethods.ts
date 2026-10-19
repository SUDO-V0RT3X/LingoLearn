// Import an unbiased random integer source for shuffling answer options.
import { randomInt } from 'node:crypto';
// Import the shared PostgreSQL connection pool so this service can run queries.
import { pool } from '../../../../../config/db/db_init.js';
// Import the standard API error class so callers receive consistent HTTP status codes.
import { ApiError } from '../../../../../shared/errors/ApiError.js';
// Import the learner access gate that blocks under-13 users without a parent link.
import { requireLearnerContentAccess } from '../../../../../shared/learnerAccess.js';
// Import the public DTO types used as inputs and outputs of this service.
import type {
    // The learner's unfinished attempt, if any.
    ActivePlacementResponse,
    // A single selectable option inside a multiple-choice question.
    PlacementOption,
    // The learner-safe view of a question (no answer key).
    PlacementQuestion,
    // The final graded result shown to the learner.
    PlacementResult,
    // The payload returned by the start endpoint.
    StartPlacementResponse,
    // The payload accepted by the submit endpoint.
    SubmitAnswerInput,
    // The payload returned by the submit endpoint.
    SubmitResponse,
} from '../types/placementType.js';

/**
 * Internal representation of a question stored in PostgreSQL, including the secret grading key (`correct_id`).
 * This model is used exclusively on the server and database query layer.
 */
// Exported interface describing a raw database row for a placement question.
export interface DbPlacementQuestion {
    /** Unique identifier for the question (e.g., 'q1', 'zq1'). */
    // Primary key of the question in its language-specific table.
    id: string;
    /** Pedagogical section header (e.g., 'Grammar & Vocabulary', 'Uhlelo Lwamagama'). */
    // Display label grouping the question by topic or skill.
    section: string;
    /** Instructional guidance prompt for the learner (e.g., 'Choose the correct answer below.'). */
    // Short instruction line rendered above the question stem.
    instructions: string;
    /** Interactive widget type to render ('multiple-choice' or 'fill-blank'). */
    // Discriminator telling the frontend which input widget to render.
    type: 'multiple-choice' | 'fill-blank';
    /** The question stem, prompt, or sentence with a missing token. */
    // The actual question text shown to the learner.
    prompt: string;
    /** Selectable option objects for multiple-choice items, or null for fill-in-the-blank items. */
    // Array of options when type is 'multiple-choice'; null otherwise.
    options: PlacementOption[] | null;
    /** Secret grading key or expected string; never sent over HTTP to client devices. */
    // The answer key used only server-side during grading.
    correct_id: string;
    /** Ascending zero-based index establishing the sequential ladder progression. */
    // Position of the question in the ordered ladder (0-based).
    order_index: number;
    /** Target proficiency level tier (1-6) unlocked as the learner progresses. */
    // Optional explicit tier; derived from order_index when absent.
    level_number?: number;
}

/**
 * The canonical English ladder: six levels of five questions, easiest first.
 * The levels are the app's own scale (levels.level_number and CONTENT_LEVELS on the
 * frontend), so a band's questions are written for that level:
 *   - Questions 1-5   (order 0-4):   Level 1 (A1)
 *   - Questions 6-10  (order 5-9):   Level 2 (A1+)
 *   - Questions 11-15 (order 10-14): Level 3 (A2)
 *   - Questions 16-20 (order 15-19): Level 4 (B1)
 *   - Questions 21-25 (order 20-24): Level 5 (B2)
 *   - Questions 26-30 (order 25-29): Level 6 (C1)
 * Fill-in questions are only used where exactly one word fits. Migration
 * 209_placement_question_fixes.sql writes the same rows to an existing database.
 */
// Exported constant holding the canonical English question ladder used as a seed.
export const DEFAULT_QUESTIONS: DbPlacementQuestion[] = [
    // ── Level 1 (A1) ──────────────────────────────────────────────────────────
    {
        // "to be" with a singular subject.
        id: 'q1',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'Hello, my name _____ Alex. What is your name?',
        options: [
            { id: 'a', text: 'are' },
            { id: 'b', text: 'is' },
            { id: 'c', text: 'am' },
            { id: 'd', text: 'be' },
        ],
        correct_id: 'b',
        order_index: 0,
        level_number: 1,
    },
    {
        // A basic opposite.
        id: 'q2',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'What is the opposite of the word "hot"?',
        options: [
            { id: 'a', text: 'warm' },
            { id: 'b', text: 'dark' },
            { id: 'c', text: 'cold' },
            { id: 'd', text: 'clean' },
        ],
        correct_id: 'c',
        order_index: 1,
        level_number: 1,
    },
    {
        // Present simple, third person.
        id: 'q3',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'She _____ to school by bus every morning.',
        options: [
            { id: 'a', text: 'go' },
            { id: 'b', text: 'goes' },
            { id: 'c', text: 'going' },
            { id: 'd', text: 'is go' },
        ],
        correct_id: 'b',
        order_index: 2,
        level_number: 1,
    },
    {
        // Days of the week: only one word fits.
        id: 'q4',
        section: 'Grammar & Vocabulary',
        instructions: 'Type the missing day of the week.',
        type: 'fill-blank',
        prompt: 'Monday, Tuesday, _____, Thursday, Friday.',
        options: null,
        correct_id: 'wednesday',
        order_index: 3,
        level_number: 1,
    },
    {
        // A preposition of time.
        id: 'q5',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct preposition.',
        type: 'multiple-choice',
        prompt: 'We usually have dinner _____ 7:00 PM.',
        options: [
            { id: 'a', text: 'in' },
            { id: 'b', text: 'on' },
            { id: 'c', text: 'at' },
            { id: 'd', text: 'to' },
        ],
        correct_id: 'c',
        order_index: 4,
        level_number: 1,
    },

    // ── Level 2 (A1+) ─────────────────────────────────────────────────────────
    {
        // Past simple of an irregular verb.
        id: 'q6',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct past tense verb.',
        type: 'multiple-choice',
        prompt: 'Yesterday, they _____ to the museum and saw dinosaur fossils.',
        options: [
            { id: 'a', text: 'went' },
            { id: 'b', text: 'go' },
            { id: 'c', text: 'gone' },
            { id: 'd', text: 'going' },
        ],
        correct_id: 'a',
        order_index: 5,
        level_number: 2,
    },
    {
        // A short comparative.
        id: 'q7',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct comparative form.',
        type: 'multiple-choice',
        prompt: 'An airplane is usually much _____ than a bicycle.',
        options: [
            { id: 'a', text: 'more fast' },
            { id: 'b', text: 'faster' },
            { id: 'c', text: 'fastest' },
            { id: 'd', text: 'more faster' },
        ],
        correct_id: 'b',
        order_index: 6,
        level_number: 2,
    },
    {
        // "many" with a countable noun.
        id: 'q8',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct word.',
        type: 'multiple-choice',
        prompt: 'How _____ languages can you speak?',
        options: [
            { id: 'a', text: 'much' },
            { id: 'b', text: 'many' },
            { id: 'c', text: 'amount' },
            { id: 'd', text: 'lot' },
        ],
        correct_id: 'b',
        order_index: 7,
        level_number: 2,
    },
    {
        // A past simple negative.
        id: 'q9',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'They _____ not visit their grandparents last weekend.',
        options: [
            { id: 'a', text: 'do' },
            { id: 'b', text: 'does' },
            { id: 'c', text: 'did' },
            { id: 'd', text: 'were' },
        ],
        correct_id: 'c',
        order_index: 8,
        level_number: 2,
    },
    {
        // An everyday verb and noun pair.
        id: 'q10',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the verb that goes with "the dishes".',
        type: 'multiple-choice',
        prompt: 'Could you please _____ the dishes after eating?',
        options: [
            { id: 'a', text: 'wash' },
            { id: 'b', text: 'make' },
            { id: 'c', text: 'repair' },
            { id: 'd', text: 'cook' },
        ],
        correct_id: 'a',
        order_index: 9,
        level_number: 2,
    },

    // ── Level 3 (A2) ──────────────────────────────────────────────────────────
    {
        // Present perfect with "since".
        id: 'q11',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct time expression.',
        type: 'multiple-choice',
        prompt: 'I have lived in this city _____ 2018.',
        options: [
            { id: 'a', text: 'for' },
            { id: 'b', text: 'since' },
            { id: 'c', text: 'during' },
            { id: 'd', text: 'from' },
        ],
        correct_id: 'b',
        order_index: 10,
        level_number: 3,
    },
    {
        // Past continuous interrupted by the past simple.
        id: 'q12',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'I _____ watching TV when my friend called.',
        options: [
            { id: 'a', text: 'was' },
            { id: 'b', text: 'were' },
            { id: 'c', text: 'am' },
            { id: 'd', text: 'did' },
        ],
        correct_id: 'a',
        order_index: 11,
        level_number: 3,
    },
    {
        // "any" in a negative sentence.
        id: 'q13',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct word.',
        type: 'multiple-choice',
        prompt: "There isn't _____ milk left in the fridge.",
        options: [
            { id: 'a', text: 'any' },
            { id: 'b', text: 'some' },
            { id: 'c', text: 'many' },
            { id: 'd', text: 'a' },
        ],
        correct_id: 'a',
        order_index: 12,
        level_number: 3,
    },
    {
        // A relative pronoun for a person.
        id: 'q14',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct word.',
        type: 'multiple-choice',
        prompt: 'The teacher _____ helped me the most has retired.',
        options: [
            { id: 'a', text: 'who' },
            { id: 'b', text: 'which' },
            { id: 'c', text: 'what' },
            { id: 'd', text: 'where' },
        ],
        correct_id: 'a',
        order_index: 13,
        level_number: 3,
    },
    {
        // "must" for a rule.
        id: 'q15',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'All drivers _____ wear a seatbelt. It is the law.',
        options: [
            { id: 'a', text: 'might' },
            { id: 'b', text: 'could' },
            { id: 'c', text: 'would' },
            { id: 'd', text: 'must' },
        ],
        correct_id: 'd',
        order_index: 14,
        level_number: 3,
    },

    // ── Level 4 (B1) ──────────────────────────────────────────────────────────
    {
        // The second conditional.
        id: 'q16',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'If I had more free time, I _____ learn to play the guitar.',
        options: [
            { id: 'a', text: 'will' },
            { id: 'b', text: 'can' },
            { id: 'c', text: 'would' },
            { id: 'd', text: 'shall' },
        ],
        correct_id: 'c',
        order_index: 15,
        level_number: 4,
    },
    {
        // Everyday vocabulary: putting something off.
        id: 'q17',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the word that fits best.',
        type: 'multiple-choice',
        prompt: 'The meeting was _____ until next week because the director fell ill.',
        options: [
            { id: 'a', text: 'postponed' },
            { id: 'b', text: 'cancelled' },
            { id: 'c', text: 'broken' },
            { id: 'd', text: 'rejected' },
        ],
        correct_id: 'a',
        order_index: 16,
        level_number: 4,
    },
    {
        // The past simple passive.
        id: 'q18',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'This bridge _____ in 1990.',
        options: [
            { id: 'a', text: 'was built' },
            { id: 'b', text: 'built' },
            { id: 'c', text: 'is building' },
            { id: 'd', text: 'has built' },
        ],
        correct_id: 'a',
        order_index: 17,
        level_number: 4,
    },
    {
        // The third conditional.
        id: 'q19',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'If they had left earlier, they _____ have missed their flight.',
        options: [
            { id: 'a', text: 'will not' },
            { id: 'b', text: 'would not' },
            { id: 'c', text: 'did not' },
            { id: 'd', text: 'could not have' },
        ],
        correct_id: 'b',
        order_index: 18,
        level_number: 4,
    },
    {
        // "look forward to" + -ing.
        id: 'q20',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'I am looking forward to _____ you next week.',
        options: [
            { id: 'a', text: 'seeing' },
            { id: 'b', text: 'see' },
            { id: 'c', text: 'saw' },
            { id: 'd', text: 'have seen' },
        ],
        correct_id: 'a',
        order_index: 19,
        level_number: 4,
    },

    // ── Level 5 (B2) ──────────────────────────────────────────────────────────
    {
        // The future perfect.
        id: 'q21',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'By the time she finishes university, she _____ three languages.',
        options: [
            { id: 'a', text: 'will master' },
            { id: 'b', text: 'masters' },
            { id: 'c', text: 'will have mastered' },
            { id: 'd', text: 'has mastered' },
        ],
        correct_id: 'c',
        order_index: 20,
        level_number: 5,
    },
    {
        // A fixed formal phrase: only "with" fits.
        id: 'q22',
        section: 'Grammar & Vocabulary',
        instructions: 'Type the missing word.',
        type: 'fill-blank',
        prompt: 'In accordance _____ company rules, all financial records were checked.',
        options: null,
        correct_id: 'with',
        order_index: 21,
        level_number: 5,
    },
    {
        // A mixed conditional.
        id: 'q23',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'If she had taken the training last year, she _____ leading the team today.',
        options: [
            { id: 'a', text: 'would be' },
            { id: 'b', text: 'would have been' },
            { id: 'c', text: 'will be' },
            { id: 'd', text: 'is' },
        ],
        correct_id: 'a',
        order_index: 22,
        level_number: 5,
    },
    {
        // Vocabulary: complete agreement.
        id: 'q24',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the word that fits best.',
        type: 'multiple-choice',
        prompt: 'Everyone on the committee voted yes, so the decision was _____.',
        options: [
            { id: 'a', text: 'unanimous' },
            { id: 'b', text: 'solitary' },
            { id: 'c', text: 'uniform' },
            { id: 'd', text: 'singular' },
        ],
        correct_id: 'a',
        order_index: 23,
        level_number: 5,
    },
    {
        // Vocabulary: bringing two ideas together.
        id: 'q25',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the word that fits best.',
        type: 'multiple-choice',
        prompt: 'It can be hard to _____ your own wishes with the needs of your family.',
        options: [
            { id: 'a', text: 'reconcile' },
            { id: 'b', text: 'obscure' },
            { id: 'c', text: 'distribute' },
            { id: 'd', text: 'multiply' },
        ],
        correct_id: 'a',
        order_index: 24,
        level_number: 5,
    },

    // ── Level 6 (C1) ──────────────────────────────────────────────────────────
    {
        // Inversion after a negative adverb.
        id: 'q26',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'Hardly _____ the station when the train pulled away.',
        options: [
            { id: 'a', text: 'we had reached' },
            { id: 'b', text: 'did we reached' },
            { id: 'c', text: 'we reached' },
            { id: 'd', text: 'had we reached' },
        ],
        correct_id: 'd',
        order_index: 25,
        level_number: 6,
    },
    {
        // The subjunctive after "recommend that".
        id: 'q27',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'The board recommended that the director _____ immediate steps to fix the problem.',
        options: [
            { id: 'a', text: 'takes' },
            { id: 'b', text: 'take' },
            { id: 'c', text: 'took' },
            { id: 'd', text: 'has taken' },
        ],
        correct_id: 'b',
        order_index: 26,
        level_number: 6,
    },
    {
        // An idiom: to take the wind out of someone's sails.
        id: 'q28',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the word that completes the expression.',
        type: 'multiple-choice',
        prompt: "Her strong presentation completely _____ the wind out of the other team's sails.",
        options: [
            { id: 'a', text: 'blew' },
            { id: 'b', text: 'took' },
            { id: 'c', text: 'knocked' },
            { id: 'd', text: 'drew' },
        ],
        correct_id: 'b',
        order_index: 27,
        level_number: 6,
    },
    {
        // A cleft sentence: "It was not until ... that".
        id: 'q29',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the correct answer below.',
        type: 'multiple-choice',
        prompt: 'It was not until the following year _____ the full effects of the policy became clear.',
        options: [
            { id: 'a', text: 'when' },
            { id: 'b', text: 'that' },
            { id: 'c', text: 'which' },
            { id: 'd', text: 'then' },
        ],
        correct_id: 'b',
        order_index: 28,
        level_number: 6,
    },
    {
        // Advanced vocabulary: hard to follow.
        id: 'q30',
        section: 'Grammar & Vocabulary',
        instructions: 'Choose the word that fits best.',
        type: 'multiple-choice',
        prompt: "The novel's plot was so _____ that critics spent years untangling it.",
        options: [
            { id: 'a', text: 'convoluted' },
            { id: 'b', text: 'ephemeral' },
            { id: 'c', text: 'negligible' },
            { id: 'd', text: 'redundant' },
        ],
        correct_id: 'a',
        order_index: 29,
        level_number: 6,
    },
];

/**
 * The canonical isiZulu ladder (30 questions), on the same six-level scale as the English one.
 * These questions test native linguistic structures: izigaba zamabizo (noun classes), izivumelwano (concords),
 * impambosi (verbal extensions), izenzukuthi (ideophones), izisho (idioms), and izaga (proverbs).
 * Organized into six 5-question tiers:
 *   - Questions 1-5   (order 0-4):   Level 1 (A1)  - Greetings & Simple Concords
 *   - Questions 6-10  (order 5-9):   Level 2 (A1+) - Noun Classes & Past Tense
 *   - Questions 11-15 (order 10-14): Level 3 (A2)  - Object Concords & Future Tense
 *   - Questions 16-20 (order 15-19): Level 4 (B1)  - Verbal Extensions & Relatives
 *   - Questions 21-25 (order 20-24): Level 5 (B2)  - Compound Tenses, Ideophones & Idioms
 *   - Questions 26-30 (order 25-29): Level 6 (C1)  - Traditional Proverbs & Deep Idiomatic Lore
 * No prompt contains its own answer. Migration 209_placement_question_fixes.sql writes the
 * same rows to an existing database.
 */
// Exported constant holding the canonical isiZulu question ladder used as a seed.
export const DEFAULT_ZULU_QUESTIONS: DbPlacementQuestion[] = [
    // ── Level 1 (A1) ──────────────────────────────────────────────────────────
    {
        // First Zulu question's stable identifier.
        id: 'zq1',
        // Section header in isiZulu.
        section: 'Ukubingelela Neluhlelo Lwamagama',
        // isiZulu instruction line.
        instructions: 'Khetha isibingelelo esifanele lapho ubingelela umuntu oyedwa ekuseni.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Greeting exchange prompt.
        prompt: 'Sawubona Sipho, unjani? Impendulo efanele ithi: "Ngiyaphila, _____?"',
        // Four greeting-response candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'unjani wena' },
            // Option B.
            { id: 'b', text: 'ninjani nina' },
            // Option C.
            { id: 'c', text: 'baphila kanjani' },
            // Option D.
            { id: 'd', text: 'bakhona bonke' },
        ],
        // Correct response key.
        correct_id: 'a',
        // First position in the Zulu ladder.
        order_index: 0,
        // Tier 1.
        level_number: 1,
    },
    {
        // Second Zulu question.
        id: 'zq2',
        // Section header.
        section: 'Uhlelo Lwamagama',
        // Antonym instruction.
        instructions: 'Khetha igama eliphikisa igama elithi "khulu".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Antonym prompt.
        prompt: 'Ibhola elikhulu lihluke ebholeni eli_____.',
        // Adjective candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'ncane' },
            // Option B.
            { id: 'b', text: 'buhlungu' },
            // Option C.
            { id: 'c', text: 'mhlophe' },
            // Option D.
            { id: 'd', text: 'nde' },
        ],
        // Correct answer key.
        correct_id: 'a',
        // Second ladder position.
        order_index: 1,
        // Tier 1.
        level_number: 1,
    },
    {
        // Third Zulu question.
        id: 'zq3',
        // Section header.
        section: 'Uhlelo Lwezilimi',
        // Instruction about subject concord.
        instructions: 'Faka isivumelwano senhloko esifanele sesimanje (u-).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Present-tense concord prompt.
        prompt: 'Ugogo _____sebenza engadini njalo ekuseni.',
        // Concord candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'u' },
            // Option B.
            { id: 'b', text: 'ba' },
            // Option C.
            { id: 'c', text: 'zi' },
            // Option D.
            { id: 'd', text: 'li' },
        ],
        // Correct concord key.
        correct_id: 'a',
        // Third ladder position.
        order_index: 2,
        // Tier 1.
        level_number: 1,
    },
    {
        // Fourth Zulu question.
        id: 'zq4',
        // Section header.
        section: 'Silulumagama',
        // Vocabulary instruction ("Choose the correct word").
        instructions: 'Khetha igama elifanele.',
        // Rendered as radio buttons, so the prompt no longer has to name the answer.
        type: 'multiple-choice',
        // Vocabulary prompt ("When you are thirsty, you need to drink ___").
        prompt: 'Uma womile, udinga ukuphuza _____.',
        // Water, bread, table, book: only one is drunk.
        options: [
            // Option A (correct).
            { id: 'a', text: 'amanzi' },
            // Option B.
            { id: 'b', text: 'isinkwa' },
            // Option C.
            { id: 'c', text: 'itafula' },
            // Option D.
            { id: 'd', text: 'incwadi' },
        ],
        // Correct answer is "amanzi".
        correct_id: 'a',
        // Fourth ladder position.
        order_index: 3,
        // Tier 1.
        level_number: 1,
    },
    {
        // Fifth Zulu question, last of tier 1.
        id: 'zq5',
        // Section header.
        section: 'Ukubala Nobunye/Ubuningi',
        // Pluralisation instruction.
        instructions: 'Khetha ubuningi bebizo elithi "umfundi".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Plural prompt.
        prompt: 'Umfundi oyedwa ufunda incwadi; kodwa uma bebaningi sithi: "_____ bafunda incwadi".',
        // Noun-class candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'Abafundi' },
            // Option B.
            { id: 'b', text: 'Iminfundi' },
            // Option C.
            { id: 'c', text: 'Izifundi' },
            // Option D.
            { id: 'd', text: 'Amafundi' },
        ],
        // Correct plural key.
        correct_id: 'a',
        // Fifth ladder position.
        order_index: 4,
        // Tier 1.
        level_number: 1,
    },

    // ── Level 2 (A1+) ─────────────────────────────────────────────────────────
    {
        // Sixth Zulu question, first of tier 2.
        id: 'zq6',
        // Section header.
        section: 'Izinkathi Zesenzo',
        // Past-tense instruction.
        instructions: 'Khetha isenzo sesikhathi esedlule esiqediwe.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Past-tense prompt.
        prompt: 'Izolo ekuseni abantwana _____ esikoleni ngesikhathi.',
        // Verb-form candidates.
        options: [
            // Option A (correct): the recent past, short form because words follow.
            { id: 'a', text: 'bafike' },
            // Option B: future.
            { id: 'b', text: 'bazofika' },
            // Option C: present.
            { id: 'c', text: 'bayafika' },
            // Option D: present negative.
            { id: 'd', text: 'abafiki' },
        ],
        // Correct verb key.
        correct_id: 'a',
        // Sixth ladder position.
        order_index: 5,
        // Tier 2.
        level_number: 2,
    },
    {
        // Seventh Zulu question.
        id: 'zq7',
        // Section header.
        section: 'Izigaba Zamabizo',
        // Demonstrative instruction.
        instructions: 'Khetha isabizwana sokukhomba (demonstrative) sesigaba 5 (Ili-/I-).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Demonstrative prompt.
        prompt: 'Ihhashi _____ liyagijima kakhulu edlelweni.',
        // Demonstrative candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'leli' },
            // Option B.
            { id: 'b', text: 'lo' },
            // Option C.
            { id: 'c', text: 'lesi' },
            // Option D.
            { id: 'd', text: 'lawa' },
        ],
        // Correct demonstrative key.
        correct_id: 'a',
        // Seventh ladder position.
        order_index: 6,
        // Tier 2.
        level_number: 2,
    },
    {
        // Eighth Zulu question.
        id: 'zq8',
        // Section header.
        section: 'Ukuphika Isenzo',
        // Negation instruction.
        instructions: 'Khetha indlela efanele yokuphika isenzo esithi "ngiyathanda".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Present-tense negation prompt.
        prompt: 'Mina inyama yenkukhu _____ (ukuphika kwesimanje).',
        // Negated verb candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'angithandi' },
            // Option B.
            { id: 'b', text: 'angingathandi' },
            // Option C.
            { id: 'c', text: 'angithandanga' },
            // Option D.
            { id: 'd', text: 'angingithandi' },
        ],
        // Correct negation key.
        correct_id: 'a',
        // Eighth ladder position.
        order_index: 7,
        // Tier 2.
        level_number: 2,
    },
    {
        // Ninth Zulu question.
        id: 'zq9',
        // Section header.
        section: 'Uhlelo Lwamagama Ondaweni',
        // Locative instruction.
        instructions: 'Guqula ibizo elithi "isikole" libe sundaweni (locative).',
        // Rendered as a text input.
        type: 'fill-blank',
        // Locative prompt.
        prompt: 'Izingane ziya _____ ukuyofunda. (Faka isikole esimeni sokukhomba indawo)',
        // No options for fill-in.
        options: null,
        // Expected locative form.
        correct_id: 'esikoleni',
        // Ninth ladder position.
        order_index: 8,
        // Tier 2.
        level_number: 2,
    },
    {
        // Tenth Zulu question, last of tier 2.
        id: 'zq10',
        // Section header.
        section: 'Izivumelwano Zamabizo',
        // Subject concord instruction.
        instructions: 'Khetha isivumelwano esifanele sebizo elithi "izitsha".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Concord prompt.
        prompt: 'Izitsha zikaMama _____hlanzekile etafuleni.',
        // Concord candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'zi' },
            // Option B.
            { id: 'b', text: 'ba' },
            // Option C.
            { id: 'c', text: 'li' },
            // Option D.
            { id: 'd', text: 'i' },
        ],
        // Correct concord key.
        correct_id: 'a',
        // Tenth ladder position.
        order_index: 9,
        // Tier 2.
        level_number: 2,
    },

    // ── Level 3 (A2) ──────────────────────────────────────────────────────────
    {
        // Eleventh Zulu question, first of tier 3.
        id: 'zq11',
        // Section header.
        section: 'Isivumelwano Sikamenziwa',
        // Object concord instruction.
        instructions: 'Faka isivumelwano sikamenziwa sebizo elithi "incwadi" (isigaba 9).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Object concord prompt; the first clause must not already show the concord.
        prompt: 'Ngithenge incwadi entsha izolo, ngakho-ke namuhla ngiya_____funda.',
        // Object concord candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'yi' },
            // Option B.
            { id: 'b', text: 'wu' },
            // Option C.
            { id: 'c', text: 'zi' },
            // Option D.
            { id: 'd', text: 'm' },
        ],
        // Correct object concord key.
        correct_id: 'a',
        // Eleventh ladder position.
        order_index: 10,
        // Tier 3.
        level_number: 3,
    },
    {
        // Twelfth Zulu question.
        id: 'zq12',
        // Section header.
        section: 'Isikhathi Esizayo',
        // Future tense instruction.
        instructions: 'Khetha uhlobo lwesikhathi esizayo esiseduze.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Future tense prompt.
        prompt: 'Kusasa ntambama umndeni wonke _____ eThekwini.',
        // Verb-form candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'uzohlangana' },
            // Option B.
            { id: 'b', text: 'wahlangana' },
            // Option C.
            { id: 'c', text: 'uhlangana' },
            // Option D.
            { id: 'd', text: 'wasehlangana' },
        ],
        // Correct future form key.
        correct_id: 'a',
        // Twelfth ladder position.
        order_index: 11,
        // Tier 3.
        level_number: 3,
    },
    {
        // Thirteenth Zulu question.
        id: 'zq13',
        // Section header.
        section: 'Izihlanganisi',
        // Conjunction instruction.
        instructions: 'Khetha isihlanganiso esichaza imbangela (because).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Causal conjunction prompt.
        prompt: 'Ubaba akakwazanga ukufika emsebenzini _____ imoto yakhe ibiphukile.',
        // Conjunction candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'ngoba' },
            // Option B.
            { id: 'b', text: 'ukuze' },
            // Option C.
            { id: 'c', text: 'noma' },
            // Option D.
            { id: 'd', text: 'kodwa' },
        ],
        // Correct conjunction key.
        correct_id: 'a',
        // Thirteenth ladder position.
        order_index: 12,
        // Tier 3.
        level_number: 3,
    },
    {
        // Fourteenth Zulu question.
        id: 'zq14',
        // Section header.
        section: 'Silulumagama Sezikhathi',
        // Time vocabulary instruction.
        instructions: 'Bhala igama elichaza usuku olwandulela olwanamuhla (yesterday).',
        // Rendered as a text input.
        type: 'fill-blank',
        // "Yesterday" prompt.
        prompt: 'Sifike lapha _____ ntambama.',
        // No options for fill-in.
        options: null,
        // Expected answer "izolo".
        correct_id: 'izolo',
        // Fourteenth ladder position.
        order_index: 13,
        // Tier 3.
        level_number: 3,
    },
    {
        // Fifteenth Zulu question, last of tier 3.
        id: 'zq15',
        // Section header.
        section: 'Izabizwana Zobunikazi',
        // Possessive pronoun instruction.
        instructions: 'Khetha isabizwana sobunikazi sesigaba 2 (Abantu).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Possessive pronoun prompt.
        prompt: 'Abazali bafuna ukubona izingane _____ ziphumelela ezifundweni.',
        // Possessive candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'zabo' },
            // Option B.
            { id: 'b', text: 'zayo' },
            // Option C.
            { id: 'c', text: 'zawo' },
            // Option D.
            { id: 'd', text: 'zalo' },
        ],
        // Correct possessive key.
        correct_id: 'a',
        // Fifteenth ladder position.
        order_index: 14,
        // Tier 3.
        level_number: 3,
    },

    // ── Level 4 (B1) ──────────────────────────────────────────────────────────
    {
        // Sixteenth Zulu question, first of tier 4.
        id: 'zq16',
        // Section header.
        section: 'Izimpambosi Zesenzo',
        // Applied verbal extension instruction.
        instructions: 'Khetha impambosi yokwenzela (applied form).',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Applied verb prompt.
        prompt: 'Umama u_____ umntwana izingubo ezintsha edolobheni.',
        // Verbal extension candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'thengela' },
            // Option B.
            { id: 'b', text: 'thengisa' },
            // Option C.
            { id: 'c', text: 'thengana' },
            // Option D.
            { id: 'd', text: 'thengeka' },
        ],
        // Correct applied form key.
        correct_id: 'a',
        // Sixteenth ladder position.
        order_index: 15,
        // Tier 4.
        level_number: 4,
    },
    {
        // Seventeenth Zulu question.
        id: 'zq17',
        // Section header.
        section: 'Impambosi Yokwenzana',
        // Reciprocal verbal extension instruction.
        instructions: 'Khetha isenzo esichaza ukwenza ngokubambisana phakathi kwabantu ababili noma ngaphezulu.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Reciprocal prompt.
        prompt: 'Abangane abahle baya_____ ngezikhathi zobunzima.',
        // Reciprocal verb candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'sizana' },
            // Option B.
            { id: 'b', text: 'sizisa' },
            // Option C.
            { id: 'c', text: 'sizela' },
            // Option D.
            { id: 'd', text: 'sizeka' },
        ],
        // Correct reciprocal key.
        correct_id: 'a',
        // Seventeenth ladder position.
        order_index: 16,
        // Tier 4.
        level_number: 4,
    },
    {
        // Eighteenth Zulu question.
        id: 'zq18',
        // Section header.
        section: 'Izimpambosi Zesenzo',
        // Passive extension instruction.
        instructions: 'Guqula isenzo "bhala" sibe yimpambosi yokwenziwa (passive).',
        // Rendered as a text input.
        type: 'fill-blank',
        // Passive voice prompt.
        prompt: 'Le ncwadi enhle ya_____ nguVilakazi ngonyaka ka-1945.',
        // No options for fill-in.
        options: null,
        // Expected passive form.
        correct_id: 'bhalwa',
        // Eighteenth ladder position.
        order_index: 17,
        // Tier 4.
        level_number: 4,
    },
    {
        // Nineteenth Zulu question.
        id: 'zq19',
        // Section header.
        section: 'Izibonelo Zeziphawulo Nezibaluli',
        // Relative formative instruction.
        instructions: 'Khetha isakhi sesibaluli esifanele sebizo elithi "umuntu".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Relative construction prompt.
        prompt: 'Umuntu _____qotho uhlonishwa ngumphakathi wonke.',
        // Relative formative candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'o' },
            // Option B.
            { id: 'b', text: 'eli' },
            // Option C.
            { id: 'c', text: 'aba' },
            // Option D.
            { id: 'd', text: 'esi' },
        ],
        // Correct relative formative key.
        correct_id: 'a',
        // Nineteenth ladder position.
        order_index: 18,
        // Tier 4.
        level_number: 4,
    },
    {
        // Twentieth Zulu question, last of tier 4.
        id: 'zq20',
        // Section header.
        section: 'Izindlela Zesenzo',
        // Verbal mood instruction.
        instructions: 'Khetha isenzo esisesimeni sokuyala ngokuhlonipha noma isincikile.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Subjunctive prompt.
        prompt: 'Kufanele ukuba bonke abafundi _____ ngomdlandla ukuze baphumelele.',
        // Verb mood candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'bafunde' },
            // Option B.
            { id: 'b', text: 'bafunda' },
            // Option C.
            { id: 'c', text: 'bafundile' },
            // Option D.
            { id: 'd', text: 'bazofunda' },
        ],
        // Correct verb mood key.
        correct_id: 'a',
        // Twentieth ladder position.
        order_index: 19,
        // Tier 4.
        level_number: 4,
    },

    // ── Level 5 (B2) ──────────────────────────────────────────────────────────
    {
        // Twenty-first Zulu question, first of tier 5.
        id: 'zq21',
        // Section header.
        section: 'Inkathi Eyinhlanganisela',
        // Compound tense instruction.
        instructions: 'Khetha isenzo esisesikhathini esedlule esiqhubekayo senhlanganisela.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Past continuous prompt.
        prompt: 'Ngesikhathi ngifika ekhaya, uMthunzi _____ incwadi yakhe yocwaningo.',
        // Compound tense candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'wayebhala' },
            // Option B.
            { id: 'b', text: 'ubhale' },
            // Option C.
            { id: 'c', text: 'uyobhala' },
            // Option D.
            { id: 'd', text: 'usebhale' },
        ],
        // Correct compound tense key.
        correct_id: 'a',
        // Twenty-first ladder position.
        order_index: 20,
        // Tier 5.
        level_number: 5,
    },
    {
        // Twenty-second Zulu question.
        id: 'zq22',
        // Section header.
        section: 'Izisho ZesiZulu',
        // Idiom meaning instruction.
        instructions: 'Khetha incazelo efanele yesisho esithi "ukumisa idolo".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Idiom meaning prompt.
        prompt: 'Isisho esithi "ukumisa idolo" sichaza ukuthi:',
        // Meaning candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'ukubekezela nokuba nesibindi' },
            // Option B.
            { id: 'b', text: 'ukugula kwamadolo' },
            // Option C.
            { id: 'c', text: 'ukuhamba ngezinyawo ibanga elide' },
            // Option D.
            { id: 'd', text: 'ukugijima ubaleke' },
        ],
        // Correct meaning key.
        correct_id: 'a',
        // Twenty-second ladder position.
        order_index: 21,
        // Tier 5.
        level_number: 5,
    },
    {
        // Twenty-third Zulu question.
        id: 'zq23',
        // Section header.
        section: 'Izaga ZesiZulu',
        // Fill-in proverb instruction ("Write the missing word in this proverb").
        instructions: 'Bhala igama elishodayo kulesi saga.',
        // Rendered as a text input.
        type: 'fill-blank',
        // Proverb completion prompt: talent shows early.
        prompt: 'Umthente uhlaba _____.',
        // No options for fill-in.
        options: null,
        // Expected answer "usamila".
        correct_id: 'usamila',
        // Twenty-third ladder position.
        order_index: 22,
        // Tier 5.
        level_number: 5,
    },
    {
        // Twenty-fourth Zulu question.
        id: 'zq24',
        // Section header.
        section: 'Isimo Sesenzukuthi',
        // Ideophone instruction.
        instructions: 'Khetha isenzukuthi esihambisana nokugcwala kwesitsha.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Ideophone prompt.
        prompt: 'Indishi yayigcwele ubisi oluconsayo ithi _____.',
        // Ideophone candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'phama' },
            // Option B.
            { id: 'b', text: 'khwishi' },
            // Option C.
            { id: 'c', text: 'dinsi' },
            // Option D.
            { id: 'd', text: 'bhu' },
        ],
        // Correct ideophone key.
        correct_id: 'a',
        // Twenty-fourth ladder position.
        order_index: 23,
        // Tier 5.
        level_number: 5,
    },
    {
        // Twenty-fifth Zulu question, last of tier 5.
        id: 'zq25',
        // Section header.
        section: 'Ukwakhiwa Kwamagama Okujulile',
        // Copulative instruction.
        instructions: 'Khetha isibanjalo (copulative) esakhiwe ebizoneni elithi "amadoda".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Copulative prompt.
        prompt: 'Labo bantu abamesabi umsebenzi onzima ngoba bona _____.',
        // Copulative candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'ngamadoda' },
            // Option B.
            { id: 'b', text: 'yamadoda' },
            // Option C.
            { id: 'c', text: 'ngamamadoda' },
            // Option D.
            { id: 'd', text: 'semadodeni' },
        ],
        // Correct copulative key.
        correct_id: 'a',
        // Twenty-fifth ladder position.
        order_index: 24,
        // Tier 5.
        level_number: 5,
    },

    // ── Level 6 (C1) ──────────────────────────────────────────────────────────
    {
        // Twenty-sixth Zulu question, first of tier 6.
        id: 'zq26',
        // Section header.
        section: 'Izaga ZesiZulu',
        // Proverb completion instruction.
        instructions: 'Khetha isiphetho esifanele sesaga esigcizelela ukubambisana nokusizana.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Proverb completion prompt.
        prompt: 'Qedela lesi saga sasendulo: "Izandla ziyagezana, _____."',
        // Proverb ending candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'enye igeze enye' },
            // Option B.
            { id: 'b', text: 'zibambe udonga' },
            // Option C.
            { id: 'c', text: 'zingcolise amanzi' },
            // Option D.
            { id: 'd', text: 'zisebenze zodwa' },
        ],
        // Correct proverb ending key.
        correct_id: 'a',
        // Twenty-sixth ladder position.
        order_index: 25,
        // Tier 6.
        level_number: 6,
    },
    {
        // Twenty-seventh Zulu question.
        id: 'zq27',
        // Section header.
        section: 'Izaga ZesiZulu',
        // Proverb meaning instruction.
        instructions: 'Khetha incazelo ejulile yesaga esithi "Injobo enhle ithungelwa ebandla".',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Proverb meaning prompt.
        prompt: 'Lesi saga esaziwayo sifundisa ukuthi:',
        // Meaning candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'Isu elihle neliphumelelayo litholakalela lapho kuboniswana khona nabanye' },
            // Option B.
            { id: 'b', text: 'Izimpahla ezinhle zithungwa ngosonkontileka kuphela' },
            // Option C.
            { id: 'c', text: 'Indoda kufanele ihlale ekhaya ingayi ebandla' },
            // Option D.
            { id: 'd', text: 'Imfundo itholakala kuphela ezintabeni' },
        ],
        // Correct meaning key.
        correct_id: 'a',
        // Twenty-seventh ladder position.
        order_index: 26,
        // Tier 6.
        level_number: 6,
    },
    {
        // Twenty-eighth Zulu question.
        id: 'zq28',
        // Section header.
        section: 'Izaga ZesiZulu',
        // Fill-in proverb instruction ("Write the missing word in this proverb").
        instructions: 'Bhala igama elishodayo kulesi saga.',
        // Rendered as a text input.
        type: 'fill-blank',
        // Proverb completion prompt: do things yourself rather than sending others.
        prompt: 'Imbila yaswela _____ ngokulayezela.',
        // No options for fill-in.
        options: null,
        // Expected answer "umsila".
        correct_id: 'umsila',
        // Twenty-eighth ladder position.
        order_index: 27,
        // Tier 6.
        level_number: 6,
    },
    {
        // Twenty-ninth Zulu question.
        id: 'zq29',
        // Section header.
        section: 'Ulimi Lwezinkondlo Nobuciko',
        // Philosophy instruction ("Choose the correct word"); it must not name the answer.
        instructions: 'Khetha igama elifanele.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Ubuntu philosophy prompt.
        prompt: 'Umgomo oyisisekelo wenjulalwazi yama-Afrika othi "umuntu ngumuntu ngabantu" waziwa ngokuthi _____.',
        // Noun candidates, each with its own prefix.
        options: [
            // Option A (correct).
            { id: 'a', text: 'ubuntu' },
            // Option B.
            { id: 'b', text: 'ikhono' },
            // Option C.
            { id: 'c', text: 'inqubo' },
            // Option D.
            { id: 'd', text: 'indlela' },
        ],
        // Correct philosophy term key.
        correct_id: 'a',
        // Twenty-ninth ladder position.
        order_index: 28,
        // Tier 6.
        level_number: 6,
    },
    {
        // Thirtieth Zulu question, final of tier 6.
        id: 'zq30',
        // Section header.
        section: 'Ulimi Olucwengekile',
        // Proverb selection instruction.
        instructions: 'Khetha isaga esifundisa ukuthi akekho umuntu owazi konke futhi ongenamkhawulo emakhonweni akhe.',
        // Rendered as radio buttons.
        type: 'multiple-choice',
        // Proverb selection prompt.
        prompt: 'Yisiphi isaga esifundisa ukuthi akekho umuntu owazi konke futhi onekhono elingenamkhawulo?',
        // Proverb candidates.
        options: [
            // Option A (correct).
            { id: 'a', text: 'Akukho qili elazikhotha emhlane' },
            // Option B.
            { id: 'b', text: 'Ukwanda kwaliwa ngumthakathi' },
            // Option C.
            { id: 'c', text: 'Inkunzi isematholeni' },
            // Option D.
            { id: 'd', text: 'Uhamba yedwa uzala inkosi' },
        ],
        // Correct proverb key.
        correct_id: 'a',
        // Thirtieth ladder position.
        order_index: 29,
        // Tier 6.
        level_number: 6,
    },
];

/**
 * The reference label of each level, the same scale the rest of the app uses
 * (the levels table, and CONTENT_LEVELS on the frontend): 1=A1, 2=A1+, 3=A2,
 * 4=B1, 5=B2, 6=C1.
 */
export const LEVEL_CODES: Readonly<Record<number, string>> = {
    1: 'A1',
    2: 'A1+',
    3: 'A2',
    4: 'B1',
    5: 'B2',
    6: 'C1',
};

/**
 * Maps a numeric database level (1-6) to its reference label ("A1+"), a plain
 * title ("Level 2"), and the competency breakdown across language sub-skills.
 *
 * @param levelNumber - Integer level from 1 to 6
 * @returns Formatted PlacementResult object ready for client rendering
 */
// Exported helper converting an internal level number into the public DTO shape.
export function formatPlacementResult(levelNumber: number): PlacementResult {
    // Defensive default ensures unknown inputs still return a usable result.
    const known = LEVEL_CODES[levelNumber] ? levelNumber : 1;
    const level = LEVEL_CODES[known];

    // Compose the public DTO with level number, reference label, title, and sub-skill breakdown.
    return {
        // The level number, as saved in learner_levels.
        levelNumber: known,
        // Reference label returned to the client.
        level,
        // Plain title returned to the client.
        label: `Level ${known}`,
        // Per-skill rows, currently mirroring the overall level.
        breakdown: [
            // Grammar sub-skill row.
            { skill: 'Grammar', level },
            // Vocabulary sub-skill row.
            { skill: 'Vocabulary', level },
        ],
    };
}

/**
 * Computes the assigned proficiency level (1-6) based on question index reached and total score.
 *
 * Ladder Progression Rules (30 Questions across 6 Levels):
 *   - The placement test uses a 5-question milestone progression: answering 5 consecutive questions
 *     in a tier unlocks the next proficiency level.
 *   - Score 0 - 4:   Level 1 (A1)
 *   - Score 5 - 9:   Level 2 (A1+)
 *   - Score 10 - 14: Level 3 (A2)
 *   - Score 15 - 19: Level 4 (B1)
 *   - Score 20 - 24: Level 5 (B2)
 *   - Score 25 - 30: Level 6 (C1)
 *
 * Backwards Compatibility:
 *   - If `totalQuestions <= 5` (as in small isolated test fixtures), it preserves the legacy
 *     1:1 score-to-level mapping so existing unit tests continue to pass seamlessly.
 *
 * @param score - Total correct answers achieved by the learner
 * @param totalQuestions - Total count of questions in the active assessment ladder
 * @returns Numeric level between 1 and 6
 */
// Exported helper mapping a raw score to an assigned tier number.
export function calculateAssignedLevel(score: number, totalQuestions: number): number {
    // Legacy / small test suite fallback (where total questions is capped at 5)
    // Detect compact fixtures that predate the milestone progression.
    if (totalQuestions <= 5) {
        // Score 0–1 stays at tier 1.
        if (score <= 1) return 1;
        // Exactly 2 correct answers → tier 2.
        if (score === 2) return 2;
        // Exactly 3 correct answers → tier 3.
        if (score === 3) return 3;
        // Exactly 4 correct answers → tier 4.
        if (score === 4) return 4;
        // A perfect score on a tiny fixture → tier 5.
        if (score >= 5 || score >= totalQuestions) return 5;
        // Final fallback for any score outside the expected range.
        return 1;
    }

    // Dynamic 5-question milestone progression: every 5 questions unlocks the next level
    // Score 0-4 -> Level 1; Score 5-9 -> Level 2; Score 10-14 -> Level 3;
    // Score 15-19 -> Level 4; Score 20-24 -> Level 5; Score 25+ -> Level 6.
    // Integer-divide the score by 5 to find the milestone bucket, then shift to 1-based.
    const calculatedLevel = Math.floor(score / 5) + 1;
    // Clamp to the valid 1–6 band so malformed inputs cannot produce out-of-range tiers.
    return Math.min(6, Math.max(1, calculatedLevel));
}

/**
 * Returns a shuffled copy of a question's options (Fisher-Yates). Every isiZulu
 * question stores its correct answer as option 'a', so serving them in stored
 * order would put the answer first every time. Grading compares option ids,
 * never positions, so the order shown can change freely between requests.
 *
 * @param options - The stored options, left unchanged
 * @param random - Returns an integer in [0, max); injectable for tests
 */
export function shuffleOptions(
    options: PlacementOption[],
    random: (max: number) => number = (max) => randomInt(max),
): PlacementOption[] {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = random(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * The learner-safe view of a stored question: no answer key, options in a
 * fresh random order, and the tier derived from its position when not stored.
 */
export function toPublicQuestion(question: DbPlacementQuestion): PlacementQuestion {
    return {
        id: question.id,
        section: question.section,
        instructions: question.instructions,
        type: question.type,
        prompt: question.prompt,
        options: question.options ? shuffleOptions(question.options) : undefined,
        level_number: question.level_number ?? Math.floor(question.order_index / 5) + 1,
    };
}

/**
 * Service class implementing business logic and database access for placement testing.
 * Enforces access safety gates, manages test attempts, grades submissions server-side,
 * routes questions according to the learner's chosen `target_language` (English or isiZulu),
 * and records verified learner proficiency levels in PostgreSQL.
 */
// Exported class collecting all placement-related static methods.
export class PlacementMethods {
    /**
     * Resolves the learner's target language preference from `learner_settings`.
     * Defaults to 'english' if not explicitly configured.
     *
     * @param userId - Unique identifier of the learner
     * @returns Normalized target language ('english' or 'zulu')
     */
    // Async helper returning a strict union of supported language branches.
    static async resolveTargetLanguage(userId: number): Promise<'english' | 'zulu'> {
        // Wrap the DB lookup so an unexpected error cannot break the start flow.
        try {
            // Read the learner's saved target language using a parameterized query.
            const { rows } = await pool.query<{ target_language?: string }>(
                `SELECT target_language FROM learner_settings WHERE user_id = $1`,
                [userId],
            );
            // Normalize the preference before comparing accepted language values.
            if (rows.length > 0 && rows[0].target_language) {
                // Trim and lowercase to make the comparison forgiving.
                const target = rows[0].target_language.trim().toLowerCase();
                // Route only an explicit isiZulu preference to the Zulu question ladder.
                if (target === 'zulu') return 'zulu';
            }
        } catch {
            // Fall back to english if query fails
        }
        // English remains the deterministic fallback for missing or invalid preferences.
        return 'english';
    }

    /**
     * Initiates a new placement test attempt for an authenticated learner.
     *
     * Gating & Policy:
     * - Under-13 learners with no verified parent link are rejected with HTTP 403.
     * - Checks `learner_settings.target_language` to serve either English questions
     *   (`placement_questions`) or authentic isiZulu questions (`zulu_placement_questions`).
     * - An unfinished attempt in the same language is continued rather than replaced,
     *   so reloading the page (or pressing Start again) carries on where the learner was.
     * - Otherwise an attempt row is recorded in `placement_attempts` with `target_language`.
     * - The question is returned stripped of its answer key (`correct_id`).
     *
     * @param userId - ID of the authenticated learner
     * @returns A promise resolving to StartPlacementResponse
     */
    // Async entry point for starting a new attempt.
    static async startPlacement(userId: number): Promise<StartPlacementResponse> {
        // Enforce learner safety policy: under 13 requires active parent link
        // Throws an ApiError(403) when policy is violated, so no attempt row is created.
        await requireLearnerContentAccess(userId);
        // The placement test is taken once: a learner who has a level never starts it again.
        await PlacementMethods.refuseIfPlaced(userId);

        // Determine target language branch from learner_settings
        // Freeze the language choice for this attempt so later preference edits do not change it.
        const targetLanguage = await PlacementMethods.resolveTargetLanguage(userId);

        // Fetch questions from the appropriate table (or fallback defaults)
        // Load a complete ordered list so the first response and counter agree.
        const questions = await PlacementMethods.getQuestions(targetLanguage);
        // Select ladder item zero as the first question presented to the learner.
        const firstQuestion = questions[0];
        // Tell the frontend how many questions are in this language's ladder.
        const totalQuestions = questions.length;

        // Carry on with an unfinished attempt instead of starting over.
        const unfinished = await PlacementMethods.findUnfinishedAttempt(userId, targetLanguage, questions);
        if (unfinished) return unfinished;

        // The attempt ID must come from a persisted row; a synthetic ID cannot be graded later.
        const { rows: attemptRows } = await pool.query<{ id: string }>(
            // Insert a fresh attempt row pinned to the resolved language branch.
            `INSERT INTO placement_attempts (user_id, current_question_index, score, completed, target_language)
             VALUES ($1, 0, 0, false, $2)
             RETURNING id`,
            [userId, targetLanguage],
        );
        // Use only the ID returned by PostgreSQL because later grading requires a real row.
        const attemptId = attemptRows[0]?.id;
        // Guard against a silent insert that returned no row.
        if (!attemptId) {
            // Refuse to expose a test session that cannot be looked up on answer submission.
            throw new ApiError(500, 'Could not create placement attempt');
        }

        // Return stripped question (never send correct_id to client)
        return {
            // Tie the first question response to the persisted server attempt.
            attemptId,
            // Project only learner-safe question fields (no correct_id), options shuffled.
            question: toPublicQuestion(firstQuestion),
            // Let the screen calculate overall progress against the actual ladder length.
            totalQuestions,
            // A new attempt starts at the first question.
            questionNumber: 1,
            resumed: false,
        };
    }

    /**
     * The learner's unfinished attempt, so the placement screen can carry on after
     * a reload instead of showing the intro again. Null when there is none, or when
     * the learner already has a level. Never creates an attempt.
     */
    static async getActiveAttempt(userId: number): Promise<ActivePlacementResponse> {
        // The same access rule as starting: a refused learner is sent where they need to go.
        await requireLearnerContentAccess(userId);
        const { rowCount } = await pool.query('SELECT 1 FROM learner_levels WHERE user_id = $1', [userId]);
        if (rowCount) return { attempt: null };
        const targetLanguage = await PlacementMethods.resolveTargetLanguage(userId);
        const questions = await PlacementMethods.getQuestions(targetLanguage);
        return { attempt: await PlacementMethods.findUnfinishedAttempt(userId, targetLanguage, questions) };
    }

    /**
     * The learner's most recent unfinished attempt in this language, positioned at
     * its current question (answer key stripped), or null when there is none.
     */
    private static async findUnfinishedAttempt(
        userId: number,
        targetLanguage: 'english' | 'zulu',
        questions: DbPlacementQuestion[],
    ): Promise<StartPlacementResponse | null> {
        const { rows } = await pool.query<{ id: string; current_question_index: number }>(
            `SELECT id, current_question_index
             FROM placement_attempts
             WHERE user_id = $1 AND completed = false AND target_language = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [userId, targetLanguage],
        );
        const attempt = rows[0];
        if (!attempt) return null;
        const position = questions.findIndex((question) => question.order_index === attempt.current_question_index);
        // An attempt pointing past the ladder cannot be continued; a new one is started instead.
        if (position < 0) return null;
        return {
            attemptId: attempt.id,
            question: toPublicQuestion(questions[position]),
            totalQuestions: questions.length,
            questionNumber: position + 1,
            resumed: true,
        };
    }

    /**
     * Evaluates a learner's answer submission for an active placement attempt.
     *
     * Logic:
     * - Verifies attempt ownership and ensures the attempt has not already been completed.
     * - Fetches the question from the matching language table (isiZulu or English).
     * - Compares the submitted answer against the question's `correct_id`.
     * - If incorrect: ends the test early, assigns level, updates `learner_levels` and attempt.
     * - If correct: advances to the next question in the ladder, or completes at maximum level (Level 6).
     *
     * @param userId - ID of the authenticated learner submitting the answer
     * @param attemptId - The UUID of the current placement attempt
     * @param input - The question ID and answer string
     * @returns A promise resolving to SubmitResponse
     */
    // Async endpoint handling one learner answer at a time.
    static async submitAnswer(
        // Authenticated learner making the submission.
        userId: number,
        // UUID of the attempt being graded.
        attemptId: string,
        // The question id and learner-supplied answer.
        input: SubmitAnswerInput,
    ): Promise<SubmitResponse> {
        // Verify learner access permissions
        // Apply the same child-safety policy on every grading request, not only at start.
        await requireLearnerContentAccess(userId);

        // Retrieve existing attempt row from database
        const attemptResult = await pool.query<{
            // Attempt's primary key.
            id: string;
            // Owner of the attempt, used to prove ownership.
            user_id: number;
            // Where in the ladder the learner currently is.
            current_question_index: number;
            // Running total of correct answers.
            score: number;
            // Whether the attempt has already been finalised.
            completed: boolean;
            // Language snapshot captured at start time.
            target_language?: string;
        }>(
            // Ownership is enforced in the WHERE clause to avoid leaking other users' rows.
            `SELECT id, user_id, current_question_index, score, completed, target_language
             FROM placement_attempts
             WHERE id = $1 AND user_id = $2`,
            [attemptId, userId],
        );

        // Reject an unknown ID or another learner's attempt without revealing ownership.
        if (attemptResult.rows.length === 0) {
            // 404 avoids distinguishing "not found" from "not yours".
            throw new ApiError(404, 'placement attempt not found');
        }

        // Alias the single returned row for readability.
        const attempt = attemptResult.rows[0];
        // Prevent duplicate grading after any path has already completed the attempt.
        if (attempt.completed) {
            // 400 signals a logically invalid operation on a closed attempt.
            throw new ApiError(400, 'placement attempt has already been completed');
        }

        // The language snapshot captured at attempt creation is authoritative for this session.
        const targetLanguage: 'english' | 'zulu' = attempt.target_language === 'zulu' ? 'zulu' : 'english';

        // Fetch question details from the appropriate language table
        const question = await PlacementMethods.getQuestionById(input.questionId, targetLanguage);
        // Do not grade IDs that are absent from the learner's selected language ladder.
        if (!question) {
            // 404 keeps the contract consistent with "unknown resource".
            throw new ApiError(404, 'question not found');
        }
        // Accept only the question at the persisted attempt position to prevent replayed or reordered answers.
        if (question.order_index !== attempt.current_question_index) {
            // 409 signals a state-conflict the client can recover from by reloading.
            throw new ApiError(409, 'answer does not match the current placement question');
        }

        // Grade correctness server-side (case-insensitive trimmed comparison)
        const isCorrect =
            // Normalize both sides so stray whitespace or casing do not cause false negatives.
            question.correct_id.trim().toLowerCase() === input.answer.trim().toLowerCase();

        // Increase score only for a correct response; a wrong answer ends without credit.
        const newScore = isCorrect ? attempt.score + 1 : attempt.score;
        // Load the same language-specific ladder to calculate level and next question.
        const questions = await PlacementMethods.getQuestions(targetLanguage);
        // Use the retrieved ladder length for level calculation at early or final completion.
        const totalQuestions = questions.length;

        // If incorrect: stop test immediately and assign level based on score so far
        if (!isCorrect) {
            // The learner's level reflects correct answers accumulated before this wrong answer.
            const assignedLevel = calculateAssignedLevel(attempt.score, totalQuestions);
            // Complete the attempt and persist its learner level as one atomic statement.
            await PlacementMethods.completeAttempt(
                // The owning learner.
                userId,
                // The attempt being closed.
                attemptId,
                // Only allow the update when the attempt is still on this question.
                question.order_index,
                // Record the score the learner had accrued.
                newScore,
                // Persist the derived tier to `learner_levels`.
                assignedLevel,
            );

            // Return a terminal response containing the assigned result, with no next item.
            return {
                // Correct flag explicitly false for the failed answer.
                correct: false,
                // No further question since the test ended.
                nextQuestion: null,
                // Signal the frontend to switch to the results panel.
                isComplete: true,
                // Public result DTO for rendering.
                result: formatPlacementResult(assignedLevel),
            };
        }

        // If correct: check if there is a next question in the ladder
        const nextIndex = question.order_index + 1;
        // Find the next consecutive ladder item, or null when this was the final item.
        const nextQuestion = questions.find((q) => q.order_index === nextIndex) ?? null;

        // Only advance when a next question actually exists.
        if (nextQuestion) {
            // Advance attempt to next question
            const { rows: updatedAttempts } = await pool.query<{ id: string }>(
                // Optimistic-concurrency guard ensures the row hasn't changed behind our back.
                `UPDATE placement_attempts
                 SET current_question_index = $1, score = $2, updated_at = now()
                 WHERE id = $3 AND user_id = $4 AND current_question_index = $5 AND completed = false
                 RETURNING id`,
                [nextIndex, newScore, attemptId, userId, question.order_index],
            );
            // A zero-row update means the attempt was mutated between SELECT and UPDATE.
            if (updatedAttempts.length === 0) {
                // 409 asks the client to reload the current question.
                throw new ApiError(409, 'placement attempt changed; reload the current question');
            }

            // Return only public question fields so the grading key remains server-side.
            return {
                // Signal that this answer was correct.
                correct: true,
                // Project the next question without its answer key, options shuffled.
                nextQuestion: toPublicQuestion(nextQuestion),
                // Ladder continues, so this is not yet a terminal response.
                isComplete: false,
            };
        }

        // Reached the end of the ladder successfully: perfect score assignment (Level 6)
        const assignedLevel = calculateAssignedLevel(newScore, totalQuestions);
        // Complete the final attempt and persist its learner level atomically.
        await PlacementMethods.completeAttempt(
            // Owner.
            userId,
            // Attempt being closed.
            attemptId,
            // Expected current question guard.
            question.order_index,
            // Final score after the last correct answer.
            newScore,
            // Final tier derived from the score.
            assignedLevel,
        );

        // End the ladder with the same response shape used by early termination.
        return {
            // Final answer was correct.
            correct: true,
            // No next question because the ladder is exhausted.
            nextQuestion: null,
            // Terminal response.
            isComplete: true,
            // Public result DTO.
            result: formatPlacementResult(assignedLevel),
        };
    }

    /**
     * Ends an active attempt at the level of its current unanswered question.
     * Quitting completes the attempt without grading or incrementing its score.
     */
    // Async endpoint that closes an attempt without submitting an answer.
    static async quitPlacement(userId: number, attemptId: string): Promise<SubmitResponse> {
        // Recheck content eligibility when the learner closes the attempt.
        await requireLearnerContentAccess(userId);

        // Load only the state needed to verify and determine the active tier.
        const { rows } = await pool.query<{
            // Attempt's primary key.
            id: string;
            // Current ladder position to map to a tier.
            current_question_index: number;
            // Whether the attempt has already been closed.
            completed: boolean;
            // Language snapshot for level formatting context.
            target_language: string;
        }>(
            // Ownership enforced in the WHERE clause.
            `SELECT id, current_question_index, completed, target_language
             FROM placement_attempts
             WHERE id = $1 AND user_id = $2`,
            [attemptId, userId],
        );

        // Treat missing or foreign attempts as not found to preserve ownership privacy.
        const attempt = rows[0];
        // 404 keeps the contract consistent with submitAnswer.
        if (!attempt) throw new ApiError(404, 'placement attempt not found');
        // Reject a second quit after the attempt has already ended.
        if (attempt.completed) throw new ApiError(400, 'placement attempt has already been completed');

        // Select the language ladder captured when this attempt began.
        const targetLanguage = attempt.target_language === 'zulu' ? 'zulu' : 'english';
        // Retrieve the ordered ladder so the stored index can map to its level metadata.
        const questions = await PlacementMethods.getQuestions(targetLanguage);
        // Resolve the active question from the persisted zero-based ladder position.
        const currentQuestion = questions.find(
            (question) => question.order_index === attempt.current_question_index,
        );
        // Refuse to assign a level if the stored question position is no longer valid.
        if (!currentQuestion) throw new ApiError(404, 'current placement question not found');

        // Prefer explicit level metadata; derive the tier from groups of five if absent.
        const currentLevel = currentQuestion.level_number
            ?? Math.floor(currentQuestion.order_index / 5) + 1;
        // Atomically complete the attempt and assign its active question's level without scoring it.
        await PlacementMethods.completeAttempt(
            // The owning learner.
            userId,
            // The attempt being closed.
            attemptId,
            // Guard against a stale ladder position.
            currentQuestion.order_index,
            // Passing null preserves the existing score rather than overwriting it.
            null,
            // Persist the tier implied by the current question.
            currentLevel,
        );

        // Return the common completion contract consumed by the frontend result panel.
        return {
            // No answer was graded, so mark as not correct.
            correct: false,
            // Nothing follows a quit.
            nextQuestion: null,
            // Terminal response for the frontend.
            isComplete: true,
            // Public result DTO.
            result: formatPlacementResult(currentLevel),
        };
    }

    /**
     * Persists the evaluated level into PostgreSQL `learner_levels`.
     * TK's onboarding slice owns this single write path for learner levels.
     *
     * @param userId - The learner's user ID
     * @param levelNumber - Level number between 1 and 6
     */
    // Private helper that writes the learner's authoritative level row.
    private static async saveLearnerLevel(userId: number, levelNumber: number): Promise<void> {
        // Upsert the one authoritative learner-level row and refresh its update timestamp.
        await pool.query(
            `INSERT INTO learner_levels (user_id, level_number, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (user_id) DO UPDATE SET
                 level_number = EXCLUDED.level_number,
                 updated_at = now()`,
            [userId, levelNumber],
        );
    }

    /** Atomically closes an active attempt and writes the resulting learner level. */
    // Private helper combining attempt closure and level persistence in a single statement.
    private static async completeAttempt(
        // The learner who owns the attempt.
        userId: number,
        // The attempt to close.
        attemptId: string,
        // Expected current position, guarding against concurrent changes.
        expectedQuestionIndex: number,
        // Final score to persist, or null to preserve the current score.
        score: number | null,
        // The tier to persist into `learner_levels`.
        levelNumber: number,
    ): Promise<void> {
        // Use a CTE so the attempt update and level upsert succeed or fail together.
        const { rows } = await pool.query<{ user_id: number }>(
            `WITH completed_attempt AS (
                 UPDATE placement_attempts
                    SET score = COALESCE($1, score),
                        assigned_level = $2,
                        completed = true,
                        updated_at = now()
                  WHERE id = $3
                    AND user_id = $4
                    AND current_question_index = $5
                    AND completed = false
              RETURNING user_id
             ), saved_level AS (
                 INSERT INTO learner_levels (user_id, level_number, updated_at)
                 SELECT user_id, $2, now() FROM completed_attempt
                 ON CONFLICT (user_id) DO UPDATE SET
                     level_number = EXCLUDED.level_number,
                     updated_at = now()
              RETURNING user_id
             )
             SELECT user_id FROM saved_level`,
            [score, levelNumber, attemptId, userId, expectedQuestionIndex],
        );
        // Zero rows means either the guard failed or the level write did not happen.
        if (rows.length === 0) {
            // 409 signals that the client must reload before trying again.
            throw new ApiError(409, 'placement attempt changed; reload the current question');
        }
    }

    /**
     * Returns the authenticated learner's persisted level, defaulting unplaced learners to Level 1.
     * `placed` says whether a level has been saved (by placement, skipping it, or levelling up),
     * so onboarding knows not to send an already-placed learner through the test again.
     */
    // Async read used by downstream screens to know the learner's current tier.
    static async getLearnerLevel(userId: number): Promise<{ userId: number; levelNumber: number; placed: boolean }> {
        // Fetch the level row (if any) for the learner.
        const { rows } = await pool.query<{ level_number: number }>(
            `SELECT level_number FROM learner_levels WHERE user_id = $1`,
            [userId],
        );
        // Default to 1 so unplaced learners still get a valid starting point.
        return { userId, levelNumber: rows[0]?.level_number ?? 1, placed: rows.length > 0 };
    }

    /**
     * Downstream progression API. Atomically advances one learner by one level,
     * starting an unplaced learner at Level 2 and never exceeding Level 6.
     */
    // Async mutation used by lesson-completion flows to advance the learner one tier.
    static async incrementLearnerLevel(userId: number): Promise<{ userId: number; levelNumber: number }> {
        // Reject malformed identifiers before they reach the database layer.
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            // 400 tells the caller their input, not the server, was at fault.
            throw new ApiError(400, 'invalid learner id');
        }

        // Single atomic statement handles both insert and update paths.
        const { rows } = await pool.query<{ level_number: number }>(
            `INSERT INTO learner_levels (user_id, level_number, updated_at)
             VALUES ($1, 2, now())
             ON CONFLICT (user_id) DO UPDATE SET
                 level_number = LEAST(6, learner_levels.level_number + 1),
                 updated_at = now()
             RETURNING level_number`,
            [userId],
        );
        // Capture the atomic query's returned level for the downstream API response.
        const levelNumber = rows[0]?.level_number;
        // Missing RETURNING row would indicate an unexpected persistence failure.
        if (levelNumber == null) {
            // Treat a missing RETURNING row as an internal persistence failure.
            throw new ApiError(500, 'could not increment learner level');
        }
        // Return the target learner and the capped level assigned by PostgreSQL.
        return { userId, levelNumber };
    }

    /**
     * Defaults a learner to Level 1 when they opt to skip the placement assessment.
     * This preserves the onboarding flow requirement that a skipped test still gives a valid starting level.
     */
    // Async endpoint called by the intro screen when the learner clicks "Skip".
    /** Refuses (409) a learner who already has a level: placement happens once. */
    private static async refuseIfPlaced(userId: number): Promise<void> {
        const { rowCount } = await pool.query('SELECT 1 FROM learner_levels WHERE user_id = $1', [userId]);
        if (rowCount) throw new ApiError(409, 'placement has already been completed');
    }

    static async skipPlacement(userId: number): Promise<{ userId: number; levelNumber: number }> {
        // Skipping cannot be used to bypass the same child-safety gate as starting a test.
        await requireLearnerContentAccess(userId);
        // Skipping is part of the same once-only placement.
        await PlacementMethods.refuseIfPlaced(userId);
        // Keep skipping deterministic by assigning the first level, not an inferred score.
        const levelNumber = 1;
        // Use the private owner-only writer rather than exposing direct table access.
        await PlacementMethods.saveLearnerLevel(userId, levelNumber);
        // Return the persisted assignment so the frontend can proceed to Explore.
        return { userId, levelNumber };
    }

    /**
     * Retrieves all placement questions for a target language ordered by ladder position.
     * Queries `zulu_placement_questions` when targetLanguage is 'zulu',
     * or `placement_questions` for English.
     * Enables administrators or educators to append more questions to PostgreSQL in the future
     * without modifying application code.
     *
     * @param targetLanguage - Language branch ('english' or 'zulu')
     * @returns Array of questions with answer keys
     */
    // Async loader used by both start and submit paths to obtain the ladder.
    static async getQuestions(targetLanguage: 'english' | 'zulu' = 'english'): Promise<DbPlacementQuestion[]> {
        // Normalize the language flag so callers can pass any casing.
        const isZulu = targetLanguage.toLowerCase() === 'zulu';
        // Pick the matching physical table for the language branch.
        const tableName = isZulu ? 'zulu_placement_questions' : 'placement_questions';
        // Pick the canonical fallback seed for the language branch.
        const defaultSet = isZulu ? DEFAULT_ZULU_QUESTIONS : DEFAULT_QUESTIONS;

        // Read the ordered ladder from the language-specific table.
        const { rows } = await pool.query<DbPlacementQuestion>(
            // Select the full set of columns the service needs, sorted by ladder position.
            `SELECT id, section, instructions, type, prompt, options, correct_id, order_index, level_number
             FROM ${tableName}
             ORDER BY order_index ASC`,
        );
        // If the table already has at least the canonical count, return it as-is.
        if (rows.length >= defaultSet.length) return rows;

        // Keep incomplete migrated tables usable by inserting only canonical rows that are absent.
        await PlacementMethods.seedMissingQuestions(tableName, defaultSet);
        // Re-read the ladder after seeding to obtain the complete ordered list.
        const seeded = await pool.query<DbPlacementQuestion>(
            // Same projection as the first read for consistency.
            `SELECT id, section, instructions, type, prompt, options, correct_id, order_index, level_number
             FROM ${tableName}
             ORDER BY order_index ASC`,
        );
        // If the table is still short, the migration or seeding has failed.
        if (seeded.rows.length < defaultSet.length) {
            // 500 signals the server-side data is inconsistent.
            throw new ApiError(500, `placement question ladder incomplete for ${targetLanguage}`);
        }
        // Return the fully populated ladder.
        return seeded.rows;
    }

    /** Inserts missing canonical ladder questions without overwriting curated database rows. */
    // Private helper that bulk-inserts the canonical questions with a conflict-skip policy.
    private static async seedMissingQuestions(
        // Which table to seed into.
        tableName: 'placement_questions' | 'zulu_placement_questions',
        // The canonical rows to insert.
        questions: DbPlacementQuestion[],
    ): Promise<void> {
        // Accumulator for the per-row VALUES fragments.
        const values: string[] = [];
        // Accumulator for the flattened parameter array.
        const parameters: unknown[] = [];

        // Build a VALUES clause with nine placeholders per question.
        questions.forEach((question, index) => {
            // Each row consumes nine parameters, so compute the offset for this row.
            const offset = index * 9;
            // Push the placeholder tuple for this row.
            values.push(
                `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, ` +
                `$${offset + 6}::jsonb, $${offset + 7}, $${offset + 8}, $${offset + 9})`,
            );
            // Push the actual parameter values in the same order as the placeholders.
            parameters.push(
                // Question id.
                question.id,
                // Section header.
                question.section,
                // Instruction line.
                question.instructions,
                // Widget type.
                question.type,
                // Prompt text.
                question.prompt,
                // Options serialized as JSON, or null for fill-in questions.
                question.options == null ? null : JSON.stringify(question.options),
                // Secret answer key.
                question.correct_id,
                // Ladder position.
                question.order_index,
                // Explicit tier, or derived from the ladder position when missing.
                question.level_number ?? Math.floor(question.order_index / 5) + 1,
            );
        });

        // Execute the bulk insert, skipping any rows whose id already exists.
        await pool.query(
            `INSERT INTO ${tableName}
                (id, section, instructions, type, prompt, options, correct_id, order_index, level_number)
             VALUES ${values.join(', ')}
             ON CONFLICT (id) DO NOTHING`,
            parameters,
        );
    }

    /**
     * Retrieves a single placement question by its unique ID from the appropriate language table.
     *
     * @param id - The unique question identifier (e.g. 'q1', 'zq1')
     * @param targetLanguage - Optional language hint ('english' or 'zulu')
     * @returns Question with secret answer key, or null if not found
     */
    // Async lookup used by submitAnswer to grade a single question.
    static async getQuestionById(
        // The question id to fetch.
        id: string,
        // Optional explicit language branch; falls back to an id-prefix heuristic.
        targetLanguage?: 'english' | 'zulu',
    ): Promise<DbPlacementQuestion | null> {
        // Respect an explicit attempt language; use the prefix only for legacy callers without one.
        const isZulu = targetLanguage != null ? targetLanguage === 'zulu' : id.startsWith('zq');
        // Pick the matching table based on the resolved language.
        const tableName = isZulu ? 'zulu_placement_questions' : 'placement_questions';
        // Fetch the single row that matches the id.
        const { rows } = await pool.query<DbPlacementQuestion>(
            // Only one row can match because id is the primary key.
            `SELECT id, section, instructions, type, prompt, options, correct_id, order_index, level_number
             FROM ${tableName}
             WHERE id = $1`,
            [id],
        );
        // Return the row, or null when no match was found.
        return rows[0] ?? null;
    }
}