// Rules every answer in the app shares: what a learner types and what an author
// writes as an option or an accepted spelling. One limit, so a learner can always
// type any answer an author can accept.

/** The longest answer, in characters. */
export const MAX_ANSWER_LENGTH = 200;

/** The refusal for an answer over the limit. */
export const ANSWER_TOO_LONG = `an answer can be at most ${MAX_ANSWER_LENGTH} characters`;
