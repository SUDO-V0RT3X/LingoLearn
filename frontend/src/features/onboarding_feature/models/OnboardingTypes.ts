/**
 * The languages a learner can choose to study, with their display names.
 * The server and database accept exactly these values.
 */
export const TARGET_LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'zulu', label: 'isiZulu' },
] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number]['value'];

/** A child's date of birth as a linked guardian reads or corrects it. */
export interface ChildDateOfBirth {
  childId: number;
  /** 'YYYY-MM-DD', or null when the child has not finished setup. */
  dateOfBirth: string | null;
}

/**
 * Represents the input payload sent from the frontend client when submitting 
 * or updating a learner's onboarding preferences.
 * Uses camelCase naming convention standard for TypeScript/JavaScript frontend code.
 */
export interface OnboardingInput {
  /** The primary language the user intends to learn (e.g., 'english', 'zulu') */
  targetLanguage: string;

  /** The learner's date of birth, 'YYYY-MM-DD' (age checks and content audience) */
  dateOfBirth: string;

  /** The language used for displaying UI text, navigation, and system prompts */
  interfaceLanguage: string;

  /** Target daily learning time commitment expressed in minutes (e.g., 15) */
  dailyGoal: number;
}

/**
 * Evaluated access policy information determined by database date of birth and parent links.
 */
export interface LearnerAccess {
  /** Whether the learner is strictly under 13 years old based on their birth date */
  isUnder13: boolean;

  /** Whether the learner has an active linked parent or guardian in parent_links */
  hasActiveParentLink: boolean;

  /** Whether the learner is permitted to enter and view content (!isUnder13 || hasActiveParentLink) */
  canAccessContent: boolean;

  /** Audience filter classification enforced on learning material ('child' vs 'general') */
  contentAudience: 'child' | 'general';
}

/**
 * Represents the persisted onboarding settings record returned from the backend API.
 * Uses snake_case naming convention matching the database schema and REST API response payload.
 */
export interface OnboardingSettings {
  /** Unique database identifier of the learner account */
  user_id: number;

  /** The saved target language the user is learning */
  target_language: string;

  /** The user's birth year stored in the backend database */
  date_of_birth: string;

  /** The saved interface language preference */
  interface_language: string;

  /** The saved daily goal in minutes */
  daily_goal: number;

  /** ISO 8601 formatted timestamp indicating when the onboarding record was created */
  created_at: string;

  /** ISO 8601 formatted timestamp indicating when the onboarding record was last updated */
  updated_at: string;

  /** Evaluated access permissions computed from PostgreSQL records */
  access?: LearnerAccess;
}