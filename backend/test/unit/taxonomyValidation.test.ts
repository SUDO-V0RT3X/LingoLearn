// Unit tests for taxonomy input and constraint validation.
// Verifies tag creation constraints, tag types, and the 10-tag limit per content item.

import { describe, it, expect } from 'vitest';
import {
    validateCreateTag,
    validateUpdateTag,
    validateUpdateLevel,
    MAX_TAGS_PER_CONTENT,
} from '../../src/routes/api/routes.api/taxonomyRoutes/functions/validateTaxonomy.js';

describe('MAX_TAGS_PER_CONTENT', () => {
    it('is ten, the one limit content submission checks against', () => {
        expect(MAX_TAGS_PER_CONTENT).toBe(10);
    });
});

describe('validateCreateTag', () => {
    it('accepts a valid test tag', () => {
        const result = validateCreateTag({
            name: 'unit-assessment',
            tag_type: 'test',
            description: 'Test assessment for unit 1',
        });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({
            name: 'unit-assessment',
            tag_type: 'test',
            description: 'Test assessment for unit 1',
        });
    });

    it('accepts a valid theme tag', () => {
        const result = validateCreateTag({
            name: 'wildlife',
            tag_type: 'theme',
            description: 'Animals and their natural habitats',
        });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({
            name: 'wildlife',
            tag_type: 'theme',
            description: 'Animals and their natural habitats',
        });
    });

    it('trims whitespace from name and description', () => {
        const result = validateCreateTag({
            name: '  greetings  ',
            tag_type: 'theme',
            description: '  Basic greetings  ',
        });
        expect(result.valid).toBe(true);
        expect(result.value?.name).toBe('greetings');
        expect(result.value?.description).toBe('Basic greetings');
    });

    it('rejects missing or non-string tag name', () => {
        expect(validateCreateTag({ tag_type: 'test' }).valid).toBe(false);
        expect(validateCreateTag({ name: '', tag_type: 'test' }).valid).toBe(false);
        expect(validateCreateTag({ name: '   ', tag_type: 'test' }).valid).toBe(false);
        expect(validateCreateTag({ name: 123, tag_type: 'test' }).valid).toBe(false);
    });

    it('rejects tag names longer than 50 characters', () => {
        const longName = 'a'.repeat(51);
        const result = validateCreateTag({ name: longName, tag_type: 'test' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 1 and 50 characters');
    });

    it('strictly rejects any tag_type other than test or theme', () => {
        expect(validateCreateTag({ name: 'math', tag_type: 'academic' }).valid).toBe(false);
        expect(validateCreateTag({ name: 'math', tag_type: 'lesson' }).valid).toBe(false);
        expect(validateCreateTag({ name: 'math', tag_type: 'audience' }).valid).toBe(false);
        expect(validateCreateTag({ name: 'math', tag_type: '' }).valid).toBe(false);
    });

    it('rejects description longer than 255 characters', () => {
        const longDesc = 'd'.repeat(256);
        const result = validateCreateTag({ name: 'food', tag_type: 'theme', description: longDesc });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot exceed 255 characters');
    });

    it('rejects non-object inputs', () => {
        expect(validateCreateTag(null).valid).toBe(false);
        expect(validateCreateTag(undefined).valid).toBe(false);
        expect(validateCreateTag('string').valid).toBe(false);
    });
});

describe('validateUpdateTag', () => {
    it('accepts valid update with name only', () => {
        const result = validateUpdateTag({ name: 'transport' });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({ name: 'transport' });
    });

    it('accepts valid update with tag_type only', () => {
        const result = validateUpdateTag({ tag_type: 'test' });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({ tag_type: 'test' });
    });

    it('accepts valid update with description only', () => {
        const result = validateUpdateTag({ description: 'New description' });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({ description: 'New description' });
    });

    it('accepts valid update with all fields and trims strings', () => {
        const result = validateUpdateTag({
            name: '  folklore  ',
            tag_type: 'theme',
            description: '  Traditional stories  ',
        });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({
            name: 'folklore',
            tag_type: 'theme',
            description: 'Traditional stories',
        });
    });

    it('rejects empty update object when no valid fields provided', () => {
        const result = validateUpdateTag({});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('At least one field');
    });

    it('rejects invalid tag_type', () => {
        const result = validateUpdateTag({ tag_type: 'genre' });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid tag_type');
    });

    it('rejects empty or whitespace-only name', () => {
        expect(validateUpdateTag({ name: '' }).valid).toBe(false);
        expect(validateUpdateTag({ name: '   ' }).valid).toBe(false);
    });

    it('rejects name longer than 50 characters', () => {
        const result = validateUpdateTag({ name: 'a'.repeat(51) });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 1 and 50 characters');
    });

    it('rejects description longer than 255 characters', () => {
        const result = validateUpdateTag({ description: 'd'.repeat(256) });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot exceed 255 characters');
    });

    it('rejects non-object inputs', () => {
        expect(validateUpdateTag(null).valid).toBe(false);
        expect(validateUpdateTag(undefined).valid).toBe(false);
        expect(validateUpdateTag('update').valid).toBe(false);
    });
});

describe('validateUpdateLevel', () => {
    it('accepts valid pass_mark update (Table IV Test 14: 70% to 75%)', () => {
        const result = validateUpdateLevel({ pass_mark: 75 });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({ pass_mark: 75 });
    });

    it('accepts valid boundary pass_marks of 50 and 100', () => {
        expect(validateUpdateLevel({ pass_mark: 50 }).valid).toBe(true);
        expect(validateUpdateLevel({ pass_mark: 100 }).valid).toBe(true);
    });

    it('accepts valid name and description updates', () => {
        const result = validateUpdateLevel({
            name: 'Intermediate Stories',
            description: 'Level for intermediate readers',
            pass_mark: 80,
        });
        expect(result.valid).toBe(true);
        expect(result.value).toEqual({
            name: 'Intermediate Stories',
            description: 'Level for intermediate readers',
            pass_mark: 80,
        });
    });

    it('trims whitespace from name and description', () => {
        const result = validateUpdateLevel({
            name: '  Advanced  ',
            description: '  Fluent speakers  ',
        });
        expect(result.valid).toBe(true);
        expect(result.value?.name).toBe('Advanced');
        expect(result.value?.description).toBe('Fluent speakers');
    });

    it('rejects pass_mark below 50 or above 100', () => {
        const low = validateUpdateLevel({ pass_mark: 49 });
        expect(low.valid).toBe(false);
        expect(low.error).toContain('between 50 and 100');

        const high = validateUpdateLevel({ pass_mark: 101 });
        expect(high.valid).toBe(false);
        expect(high.error).toContain('between 50 and 100');
    });

    it('rejects non-integer pass_mark', () => {
        expect(validateUpdateLevel({ pass_mark: 75.5 }).valid).toBe(false);
        expect(validateUpdateLevel({ pass_mark: '75' as any }).valid).toBe(false);
        expect(validateUpdateLevel({ pass_mark: null as any }).valid).toBe(false);
    });

    it('rejects empty or whitespace-only name', () => {
        expect(validateUpdateLevel({ name: '' }).valid).toBe(false);
        expect(validateUpdateLevel({ name: '   ' }).valid).toBe(false);
        expect(validateUpdateLevel({ name: 123 as any }).valid).toBe(false);
    });

    it('rejects name longer than 60 characters', () => {
        const result = validateUpdateLevel({ name: 'a'.repeat(61) });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('between 1 and 60 characters');
    });

    it('rejects description longer than 255 characters', () => {
        const result = validateUpdateLevel({ description: 'd'.repeat(256) });
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot exceed 255 characters');
    });

    it('rejects empty update object when no valid fields are provided', () => {
        const result = validateUpdateLevel({});
        expect(result.valid).toBe(false);
        expect(result.error).toContain('At least one field');
    });

    it('rejects non-object inputs', () => {
        expect(validateUpdateLevel(null).valid).toBe(false);
        expect(validateUpdateLevel(undefined).valid).toBe(false);
        expect(validateUpdateLevel('update').valid).toBe(false);
    });
});



