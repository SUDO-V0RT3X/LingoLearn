/**
 * Validation rules for content taxonomy and assigned tags (LIN-6).
 * Implements Group Design Document Table IV (Tests 9, 10, 11) and Figure 5.
 */
import { MAX_TAGS_PER_CONTENT } from "../models/TaxonomyTypes";
import { mediaT } from "./localizeMediaMessage";

// The human wording is looked up when a rule fails, so it follows the interface
// language; callers that only test for null are unaffected.
const rule = (key: string, values: Record<string, unknown> = {}) => mediaT(`media.taxonomyRules.${key}`, values);

export type ContentAudience = 'child-friendly' | 'general';

export interface AssignedTagsInput {
  level: number | null;
  theme?: string | string[] | null;
  themes?: string[];
  audience?: ContentAudience | string | null;
  contentType?: string | null;
  supplementaryTags?: string[];
}

export interface TaxonomyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Checks whether the theme selection conforms to Table IV Test 10:
 * Exactly one theme must be selected. Multiple themes are rejected.
 */
export function validateTheme(themeInput?: string | string[] | null | unknown): string | null {
  if (Array.isArray(themeInput)) {
    const nonBlankThemes = themeInput
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.trim())
      .filter(Boolean);
    const uniqueThemes = new Set(nonBlankThemes.map(t => t.toLowerCase()));
    if (uniqueThemes.size > 1) {
      return rule('themeOne');
    }
    if (uniqueThemes.size === 0) {
      return rule('themeRequired');
    }
    return null;
  }

  if (typeof themeInput !== 'string' || themeInput.trim() === '') {
    return rule('themeRequired');
  }

  return null;
}

/**
 * Checks whether the audience tag conforms to Table IV Test 11:
 * Leaving the audience tag blank is rejected with an error message asking for it.
 */
export function validateAudience(audience?: string | null | unknown): string | null {
  if (typeof audience !== 'string' || audience.trim() === '') {
    return rule('audienceRequired');
  }

  const normalized = audience.trim().toLowerCase();
  if (normalized !== 'child-friendly' && normalized !== 'general') {
    return rule('audienceInvalid');
  }

  return null;
}

/**
 * Validates that exactly one valid reading level (1 to 6) is assigned.
 */
export function validateLevel(level?: number | null | unknown): string | null {
  if (level === null || level === undefined) {
    return rule('levelRequired');
  }

  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 6) {
    return rule('levelInvalid');
  }

  return null;
}

/**
 * Validates that content type is specified (Story or Quiz).
 */
export function validateContentType(contentType?: string | null | unknown): string | null {
  if (typeof contentType !== 'string' || contentType.trim() === '') {
    return rule('typeRequired');
  }

  const normalized = contentType.trim().toLowerCase();
  if (normalized !== 'story' && normalized !== 'quiz') {
    return rule('typeInvalid');
  }

  return null;
}

/**
 * Enforces the maximum 10 tags limit per content item (Table IV / 400_taxonomy.sql).
 */
export function validateTagLimit(totalTags?: string[] | unknown): string | null {
  if (!Array.isArray(totalTags)) return null;
  const uniqueTags = new Set(
    totalTags
      .filter((t): t is string => typeof t === 'string')
      .map(t => t.trim())
      .filter(Boolean),
  );
  if (uniqueTags.size > MAX_TAGS_PER_CONTENT) {
    return rule('tagLimit', { max: MAX_TAGS_PER_CONTENT });
  }
  return null;
}

/**
 * Validates the full set of assigned and chosen tags according to Table IV.
 *
 * - Table IV Test 9: Provide exactly one level, theme, audience, and content type -> valid: true
 * - Table IV Test 10: Select both "travel" and "food" as themes -> valid: false, "Only one theme can be selected"
 * - Table IV Test 11: Leave the "audience" tag blank -> valid: false, error asking for audience tag
 * - Database limit: Total tag count <= 10 tags
 */
export function validateAssignedTags(input?: AssignedTagsInput | null): TaxonomyValidationResult {
  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [
        rule('levelRequired'),
        rule('themeRequired'),
        rule('audienceRequired'),
      ],
    };
  }
  const errors: string[] = [];

  // 1. Level check
  const levelErr = validateLevel(input.level);
  if (levelErr) errors.push(levelErr);

  // 2. Theme check (supports theme string, theme array, or themes array)
  const themeValue = input.themes ?? input.theme;
  const themeErr = validateTheme(themeValue);
  if (themeErr) errors.push(themeErr);

  // 3. Audience check
  const audienceErr = validateAudience(input.audience);
  if (audienceErr) errors.push(audienceErr);

  // 4. Content Type check (if provided or required)
  if (input.contentType !== undefined) {
    const typeErr = validateContentType(input.contentType);
    if (typeErr) errors.push(typeErr);
  }

  // 5. Total tags limit check (theme + supplementary tags)
  const allTags: string[] = [];
  if (typeof input.theme === 'string' && input.theme.trim()) {
    allTags.push(input.theme.trim());
  } else if (Array.isArray(themeValue)) {
    allTags.push(...themeValue.filter((t): t is string => typeof t === 'string').map(t => t.trim()).filter(Boolean));
  }

  if (Array.isArray(input.supplementaryTags)) {
    allTags.push(...input.supplementaryTags.filter((t): t is string => typeof t === 'string').map(t => t.trim()).filter(Boolean));
  }

  const limitErr = validateTagLimit(allTags);
  if (limitErr) errors.push(limitErr);

  return {
    valid: errors.length === 0,
    errors,
  };
}

