// Text limits the server also enforces (backend shared/answerRules.ts and
// contentRoutes/functions/validateContent.ts). Inputs stop at these so a learner
// or author never types something the server would refuse.

/** The longest answer: what a learner types, and an author's options and accepted spellings. */
export const MAX_ANSWER_LENGTH = 200;

/** The longest transcript of an audio clip. */
export const MAX_TRANSCRIPT_LENGTH = 10000;

/**
 * How long sign-up and sign-in details may be (backend authRoutes/types/authType.ts
 * ACCOUNT_LIMITS). Sign-in's "username or email" box takes the longer of the two.
 */
export const ACCOUNT_LIMITS = {
    usernameMin: 3,
    usernameMax: 20,
    passwordMin: 8,
    passwordMax: 20,
    emailMin: 5,
    emailMax: 60,
    nameMin: 1,
    nameMax: 50,
} as const;

export const NAME_PATTERN = "^[a-zA-ZÀ-ÿ\\s'-]+$";
export const USERNAME_PATTERN = "^[a-zA-Z0-9._-]+$";
export const LINK_CODE_PATTERN = "^[a-zA-Z0-9]{6}$";

/**
 * The link code box takes a code read out with spaces or dashes ("ABC 234",
 * "abc-234"), so it allows a few more characters than the 6 that count.
 */
export const LINK_CODE_INPUT_MAX = 11;

/** The most guardians one learner can have linked at once (backend shared/learnerAccess.ts MAX_ACTIVE_GUARDIANS). */
export const MAX_ACTIVE_GUARDIANS = 4;
