// Unit tests for frontend taxonomy types, limits, and DataSource operations.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MAX_TAGS_PER_CONTENT } from '@/features/media_feature/models/TaxonomyTypes';
import { TaxonomyDataSource } from '@/features/media_feature/datasources/taxonomyDataSource';
import { Endpoints } from '@/core/endpoints/endpoints';
import {
  validateAssignedTags,
  validateTheme,
  validateAudience,
  validateLevel,
  validateContentType,
  validateTagLimit,
} from '@/features/media_feature/functions/validateTaxonomy';

describe('TaxonomyTypes constants', () => {
  it('enforces maximum 10 tags per single piece of content', () => {
    expect(MAX_TAGS_PER_CONTENT).toBe(10);
  });
});

describe('TaxonomyDataSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getLevels() returns data from Endpoints.Taxonomy.getLevels', async () => {
    const mockLevels = [
      {
        id: 1,
        level_number: 1,
        name: 'Level 1: Absolute Beginner',
        description: 'Foundational phonics',
        created_at: '2026-09-13T10:00:00Z',
        updated_at: '2026-09-13T10:00:00Z',
      },
    ];

    vi.spyOn(Endpoints.Taxonomy, 'getLevels').mockReturnValue({
      callWithParser: vi.fn().mockResolvedValue({ data: mockLevels, error: null }),
    } as any);

    const result = await TaxonomyDataSource.getLevels();
    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockLevels);
    expect(result.data?.[0].level_number).toBe(1);
  });

  it('getTags() passes filterType to Endpoints.Taxonomy.getTags', async () => {
    const mockTags = [
      {
        id: 1,
        name: 'quiz',
        tag_type: 'test' as const,
        description: 'Quiz tag',
        created_at: '2026-09-13T10:00:00Z',
        updated_at: '2026-09-13T10:00:00Z',
      },
    ];

    const getTagsSpy = vi.spyOn(Endpoints.Taxonomy, 'getTags').mockReturnValue({
      callWithParser: vi.fn().mockResolvedValue({ data: mockTags, error: null }),
    } as any);

    const result = await TaxonomyDataSource.getTags('test');
    expect(getTagsSpy).toHaveBeenCalledWith('test');
    expect(result.error).toBeNull();
    expect(result.data).toEqual(mockTags);
  });

  it('createTag() creates a new tag via Endpoints.Taxonomy.createTag', async () => {
    const newTag = {
      id: 5,
      name: 'geography',
      tag_type: 'theme' as const,
      description: 'Places and maps',
      created_at: '2026-09-13T10:00:00Z',
      updated_at: '2026-09-13T10:00:00Z',
    };

    const createSpy = vi.spyOn(Endpoints.Taxonomy, 'createTag').mockReturnValue({
      callWithParser: vi.fn().mockResolvedValue({ data: newTag, error: null }),
    } as any);

    const result = await TaxonomyDataSource.createTag({
      name: 'geography',
      tag_type: 'theme',
      description: 'Places and maps',
    });

    expect(createSpy).toHaveBeenCalledWith({
      name: 'geography',
      tag_type: 'theme',
      description: 'Places and maps',
    });
    expect(result.error).toBeNull();
    expect(result.data?.name).toBe('geography');
  });

  it('getContentTags() retrieves content tag associations', async () => {
    const contentTags = [
      {
        id: 1,
        content_id: 20,
        tag_id: 1,
        tag_name: 'travel',
        tag_type: 'theme' as const,
        created_at: '2026-09-13T10:00:00Z',
      },
    ];

    vi.spyOn(Endpoints.Taxonomy, 'getContentTags').mockReturnValue({
      callWithParser: vi.fn().mockResolvedValue({ data: contentTags, error: null }),
    } as any);

    const result = await TaxonomyDataSource.getContentTags(20);
    expect(result.error).toBeNull();
    expect(result.data).toEqual(contentTags);
  });

  it('handles API errors gracefully and returns an Exception object', async () => {
    vi.spyOn(Endpoints.Taxonomy, 'getLevels').mockReturnValue({
      callWithParser: vi.fn().mockRejectedValue(new Error('Network offline')),
    } as any);

    const result = await TaxonomyDataSource.getLevels();
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error?.message).toContain('Failed to load levels');
  });
});

describe('Taxonomy Validation - Group Design Document Table IV', () => {
  describe('validateTheme', () => {
    it('accepts a single valid theme string', () => {
      expect(validateTheme('travel')).toBeNull();
    });

    it('accepts a single valid theme array', () => {
      expect(validateTheme(['travel'])).toBeNull();
    });

    it('rejects multiple themes with Table IV Test 10 message', () => {
      // Table IV Test 10: Select both "travel" and "food" as themes
      const result = validateTheme(['travel', 'food']);
      expect(result).toBe('Only one theme can be selected');
    });

    it('rejects more than two themes with Table IV Test 10 message', () => {
      const result = validateTheme(['travel', 'food', 'nature']);
      expect(result).toBe('Only one theme can be selected');
    });

    it('rejects empty or whitespace theme', () => {
      expect(validateTheme('')).toBe('Please select a theme');
      expect(validateTheme('   ')).toBe('Please select a theme');
      expect(validateTheme(null)).toBe('Please select a theme');
      expect(validateTheme([])).toBe('Please select a theme');
    });
  });

  describe('validateAudience', () => {
    it('accepts valid audience values', () => {
      expect(validateAudience('child-friendly')).toBeNull();
      expect(validateAudience('general')).toBeNull();
      expect(validateAudience('Child-friendly')).toBeNull();
      expect(validateAudience(' GENERAL ')).toBeNull();
    });

    it('rejects blank audience with Table IV Test 11 message asking for missing tag', () => {
      // Table IV Test 11: Leave the "audience" tag blank
      const emptyResult = validateAudience('');
      expect(emptyResult).toContain('Audience tag is required');
      expect(emptyResult).toContain('please specify whether content is child-friendly or general');

      const nullResult = validateAudience(null);
      expect(nullResult).toContain('Audience tag is required');

      const whitespaceResult = validateAudience('   ');
      expect(whitespaceResult).toContain('Audience tag is required');
    });

    it('rejects unrecognized audience values', () => {
      const result = validateAudience('teenagers');
      expect(result).toBe('Audience tag must be either "child-friendly" or "general"');
    });
  });

  describe('validateLevel', () => {
    it('accepts levels from 1 to 6', () => {
      for (let lvl = 1; lvl <= 6; lvl++) {
        expect(validateLevel(lvl)).toBeNull();
      }
    });

    it('rejects missing or out-of-range levels', () => {
      expect(validateLevel(null)).toBe('Please select a level (Level 1 to 6)');
      expect(validateLevel(undefined)).toBe('Please select a level (Level 1 to 6)');
      expect(validateLevel(0)).toBe('Level must be a whole number between 1 and 6');
      expect(validateLevel(7)).toBe('Level must be a whole number between 1 and 6');
      expect(validateLevel(2.5)).toBe('Level must be a whole number between 1 and 6');
    });
  });

  describe('validateContentType', () => {
    it('accepts Story and Quiz', () => {
      expect(validateContentType('Story')).toBeNull();
      expect(validateContentType('Quiz')).toBeNull();
      expect(validateContentType('story')).toBeNull();
      expect(validateContentType('quiz')).toBeNull();
    });

    it('rejects invalid or blank content types', () => {
      expect(validateContentType('')).toBe('Content type must be specified (Story or Quiz)');
      expect(validateContentType(null)).toBe('Content type must be specified (Story or Quiz)');
      expect(validateContentType('Article')).toBe('Content type must be either "Story" or "Quiz"');
    });
  });

  describe('validateTagLimit', () => {
    it('allows up to 10 unique tags', () => {
      const tags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
      expect(validateTagLimit(tags)).toBeNull();
    });

    it('rejects more than 10 tags with trigger error message', () => {
      const tags = Array.from({ length: 11 }, (_, i) => `tag-${i}`);
      expect(validateTagLimit(tags)).toBe('A single piece of content cannot have more than 10 tags');
    });

    it('ignores duplicates when counting total tags', () => {
      const tags = ['travel', 'travel', 'food', 'food'];
      expect(validateTagLimit(tags)).toBeNull();
    });
  });

  describe('validateAssignedTags (Integration of Table IV Tests)', () => {
    it('passes Table IV Test 9: Exactly one level, theme, audience, and content type provided', () => {
      const result = validateAssignedTags({
        level: 3,
        theme: 'travel',
        audience: 'child-friendly',
        contentType: 'Story',
        supplementaryTags: ['vacation', 'airport'],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('fails Table IV Test 10: Multiple themes selected (e.g. travel and food)', () => {
      const result = validateAssignedTags({
        level: 2,
        themes: ['travel', 'food'],
        audience: 'general',
        contentType: 'Quiz',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Only one theme can be selected');
    });

    it('fails Table IV Test 11: Audience tag left blank', () => {
      const result = validateAssignedTags({
        level: 1,
        theme: 'animals',
        audience: '',
        contentType: 'Story',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(err => err.includes('Audience tag is required'))).toBe(true);
    });

    it('fails when tag limit is exceeded (> 10 total tags)', () => {
      const result = validateAssignedTags({
        level: 1,
        theme: 'animals',
        audience: 'general',
        contentType: 'Story',
        supplementaryTags: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'], // theme + 10 = 11 tags
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('A single piece of content cannot have more than 10 tags');
    });

    it('accumulates multiple errors when multiple fields are invalid', () => {
      const result = validateAssignedTags({
        level: 0,
        themes: ['travel', 'food'],
        audience: '',
        contentType: 'InvalidType',
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors).toContain('Level must be a whole number between 1 and 6');
      expect(result.errors).toContain('Only one theme can be selected');
      expect(result.errors.some(err => err.includes('Audience tag is required'))).toBe(true);
      expect(result.errors).toContain('Content type must be either "Story" or "Quiz"');
    });
  });
});

