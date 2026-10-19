// Validation functions for taxonomy operations.
// Enforces allowed tag types ('test' | 'theme') and string lengths. The tag limit
// per piece of content is defined here once and checked when content is submitted.

import type { CreateTagInput, UpdateTagInput, UpdateLevelInput, TagKind } from '../types/taxonomyType.js';

export const MAX_TAGS_PER_CONTENT = 10;
export const ALLOWED_TAG_TYPES: readonly TagKind[] = ['test', 'theme'] as const;

export interface ValidationResult<T> {
    valid: boolean;
    error?: string;
    value?: T;
}

// Validates input for creating a new tag.
export function validateCreateTag(input: unknown): ValidationResult<CreateTagInput> {
    if (!input || typeof input !== 'object') {
        return { valid: false, error: 'Request body must be a JSON object' };
    }

    const raw = input as Record<string, unknown>;

    // Validate tag name
    if (typeof raw.name !== 'string') {
        return { valid: false, error: 'Tag name is required and must be a string' };
    }

    const name = raw.name.trim();
    if (name.length < 1 || name.length > 50) {
        return { valid: false, error: 'Tag name must be between 1 and 50 characters' };
    }

    // Validate tag type: must be 'test' or 'theme'
    const tagType = raw.tag_type;
    if (typeof tagType !== 'string' || !ALLOWED_TAG_TYPES.includes(tagType as TagKind)) {
        return {
            valid: false,
            error: `Invalid tag_type. Must be one of: ${ALLOWED_TAG_TYPES.join(', ')}`,
        };
    }

    // Validate optional description
    let description = '';
    if (raw.description !== undefined && raw.description !== null) {
        if (typeof raw.description !== 'string') {
            return { valid: false, error: 'Description must be a string if provided' };
        }
        description = raw.description.trim();
        if (description.length > 255) {
            return { valid: false, error: 'Description cannot exceed 255 characters' };
        }
    }

    return {
        valid: true,
        value: {
            name,
            tag_type: tagType as TagKind,
            description,
        },
    };
}

// Validates input for updating an existing tag.
export function validateUpdateTag(input: unknown): ValidationResult<UpdateTagInput> {
    if (!input || typeof input !== 'object') {
        return { valid: false, error: 'Request body must be a JSON object' };
    }

    const raw = input as Record<string, unknown>;
    const updates: UpdateTagInput = {};
    let hasField = false;

    if (raw.name !== undefined) {
        if (typeof raw.name !== 'string') {
            return { valid: false, error: 'Tag name must be a string if provided' };
        }
        const name = raw.name.trim();
        if (name.length < 1 || name.length > 50) {
            return { valid: false, error: 'Tag name must be between 1 and 50 characters' };
        }
        updates.name = name;
        hasField = true;
    }

    if (raw.tag_type !== undefined) {
        if (typeof raw.tag_type !== 'string' || !ALLOWED_TAG_TYPES.includes(raw.tag_type as TagKind)) {
            return {
                valid: false,
                error: `Invalid tag_type. Must be one of: ${ALLOWED_TAG_TYPES.join(', ')}`,
            };
        }
        updates.tag_type = raw.tag_type as TagKind;
        hasField = true;
    }

    if (raw.description !== undefined) {
        if (raw.description !== null && typeof raw.description !== 'string') {
            return { valid: false, error: 'Description must be a string if provided' };
        }
        const description = (raw.description ? String(raw.description).trim() : '');
        if (description.length > 255) {
            return { valid: false, error: 'Description cannot exceed 255 characters' };
        }
        updates.description = description;
        hasField = true;
    }

    if (!hasField) {
        return { valid: false, error: 'At least one field (name, tag_type, or description) must be provided for update' };
    }

    return {
        valid: true,
        value: updates,
    };
}

// Validates input for updating a level's name, description, or pass mark.
export function validateUpdateLevel(input: unknown): ValidationResult<UpdateLevelInput> {
    if (!input || typeof input !== 'object') {
        return { valid: false, error: 'Request body must be a JSON object' };
    }

    const raw = input as Record<string, unknown>;
    const updates: UpdateLevelInput = {};
    let hasField = false;

    if (raw.name !== undefined) {
        if (typeof raw.name !== 'string') {
            return { valid: false, error: 'Level name must be a string if provided' };
        }
        const name = raw.name.trim();
        if (name.length < 1 || name.length > 60) {
            return { valid: false, error: 'Level name must be between 1 and 60 characters' };
        }
        updates.name = name;
        hasField = true;
    }

    if (raw.description !== undefined) {
        if (raw.description !== null && typeof raw.description !== 'string') {
            return { valid: false, error: 'Description must be a string if provided' };
        }
        const description = raw.description ? String(raw.description).trim() : '';
        if (description.length > 255) {
            return { valid: false, error: 'Description cannot exceed 255 characters' };
        }
        updates.description = description;
        hasField = true;
    }

    if (raw.pass_mark !== undefined) {
        if (!Number.isInteger(raw.pass_mark) || (raw.pass_mark as number) < 50 || (raw.pass_mark as number) > 100) {
            return { valid: false, error: 'pass_mark must be an integer between 50 and 100' };
        }
        updates.pass_mark = raw.pass_mark as number;
        hasField = true;
    }

    if (!hasField) {
        return { valid: false, error: 'At least one field (name, description, or pass_mark) must be provided for update' };
    }

    return { valid: true, value: updates };
}
