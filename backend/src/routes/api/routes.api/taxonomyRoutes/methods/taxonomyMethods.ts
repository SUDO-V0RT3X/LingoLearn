// Database methods for taxonomy operations: levels, tags, and content_tags linker.

import { pool } from '../../../../../config/db/db_init.js';
import type {
    LevelType,
    TagType,
    TagKind,
    CreateTagInput,
    UpdateTagInput,
    UpdateLevelInput,
    TagWithUsage,
    ContentTagType,
} from '../types/taxonomyType.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';

export class TaxonomyMethods {
    // Maps raw database row to LevelType
    static mapLevel(row: any): LevelType {
        return {
            id: Number(row.id),
            level_number: Number(row.level_number),
            name: String(row.name),
            description: String(row.description || ''),
            pass_mark: Number(row.pass_mark),
            created_at: row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
            updated_at: row.updated_at?.toISOString ? row.updated_at.toISOString() : String(row.updated_at),
        };
    }

    // Maps raw database row to TagType
    static mapTag(row: any): TagType {
        return {
            id: Number(row.id),
            name: String(row.name),
            tag_type: row.tag_type as TagKind,
            description: String(row.description || ''),
            created_at: row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
            updated_at: row.updated_at?.toISOString ? row.updated_at.toISOString() : String(row.updated_at),
        };
    }

    // Maps raw database row to ContentTagType
    static mapContentTag(row: any): ContentTagType {
        return {
            id: Number(row.id),
            content_id: Number(row.content_id),
            tag_id: Number(row.tag_id),
            tag_name: String(row.tag_name || ''),
            tag_type: (row.tag_type as TagKind) || 'theme',
            created_at: row.created_at?.toISOString ? row.created_at.toISOString() : String(row.created_at),
        };
    }

    // Retrieves all levels ordered by level_number
    static async getLevels(): Promise<LevelType[]> {
        const { rows } = await pool.query(
            `SELECT id, level_number, name, description, pass_mark, created_at, updated_at
             FROM levels
             ORDER BY level_number ASC`
        );
        return rows.map((r) => this.mapLevel(r));
    }

    // Retrieves a single level by its number
    static async getLevelByNumber(levelNumber: number): Promise<LevelType | null> {
        const { rows } = await pool.query(
            `SELECT id, level_number, name, description, pass_mark, created_at, updated_at
             FROM levels
             WHERE level_number = $1`,
            [levelNumber]
        );
        if (rows.length === 0) return null;
        return this.mapLevel(rows[0]);
    }

    // Updates a level's name, description, and/or pass_mark
    static async updateLevel(levelNumber: number, input: UpdateLevelInput): Promise<LevelType | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (input.name !== undefined) {
            fields.push(`name = $${idx++}`);
            values.push(input.name);
        }
        if (input.description !== undefined) {
            fields.push(`description = $${idx++}`);
            values.push(input.description);
        }
        if (input.pass_mark !== undefined) {
            fields.push(`pass_mark = $${idx++}`);
            values.push(input.pass_mark);
        }

        if (fields.length === 0) {
            return this.getLevelByNumber(levelNumber);
        }

        fields.push(`updated_at = now()`);
        values.push(levelNumber);

        const { rows } = await pool.query(
            `UPDATE levels
             SET ${fields.join(', ')}
             WHERE level_number = $${idx}
             RETURNING id, level_number, name, description, pass_mark, created_at, updated_at`,
            values
        );

        if (rows.length === 0) return null;
        return this.mapLevel(rows[0]);
    }

    // Retrieves all tags, with optional filtering by tag_type ('test' or 'theme')
    static async getTags(tagType?: TagKind): Promise<TagType[]> {
        if (tagType) {
            const { rows } = await pool.query(
                `SELECT id, name, tag_type, description, created_at, updated_at
                 FROM tags
                 WHERE tag_type = $1
                 ORDER BY name ASC`,
                [tagType]
            );
            return rows.map((r) => this.mapTag(r));
        }

        const { rows } = await pool.query(
            `SELECT id, name, tag_type, description, created_at, updated_at
             FROM tags
             ORDER BY tag_type ASC, name ASC`
        );
        return rows.map((r) => this.mapTag(r));
    }

    // Retrieves a single tag by its ID
    static async getTagById(id: number): Promise<TagType | null> {
        const { rows } = await pool.query(
            `SELECT id, name, tag_type, description, created_at, updated_at
             FROM tags
             WHERE id = $1`,
            [id]
        );
        if (rows.length === 0) return null;
        return this.mapTag(rows[0]);
    }

    // Creates a new tag and returns the created record
    static async createTag(input: CreateTagInput): Promise<TagType> {
        const { rows } = await pool.query(
            `INSERT INTO tags (name, tag_type, description)
             VALUES ($1, $2, $3)
             RETURNING id, name, tag_type, description, created_at, updated_at`,
            [input.name, input.tag_type, input.description || '']
        );
        return this.mapTag(rows[0]);
    }

    // Retrieves all tags with their content usage counts, optionally filtered by tag_type
    static async getTagsWithUsage(tagType?: TagKind): Promise<TagWithUsage[]> {
        if (tagType) {
            const { rows } = await pool.query(
                `SELECT t.id, t.name, t.tag_type, t.description, t.created_at, t.updated_at,
                        COUNT(ct.id)::int AS usage_count
                 FROM tags t
                 LEFT JOIN content_tags ct ON ct.tag_id = t.id
                 WHERE t.tag_type = $1
                 GROUP BY t.id
                 ORDER BY t.name ASC`,
                [tagType]
            );
            return rows.map((r) => ({
                ...this.mapTag(r),
                usage_count: Number(r.usage_count || 0),
            }));
        }

        const { rows } = await pool.query(
            `SELECT t.id, t.name, t.tag_type, t.description, t.created_at, t.updated_at,
                    COUNT(ct.id)::int AS usage_count
             FROM tags t
             LEFT JOIN content_tags ct ON ct.tag_id = t.id
             GROUP BY t.id
             ORDER BY t.tag_type ASC, t.name ASC`
        );
        return rows.map((r) => ({
            ...this.mapTag(r),
            usage_count: Number(r.usage_count || 0),
        }));
    }

    // Updates an existing tag's attributes. A tag already on content keeps its
    // type: a theme tag turned into a test tag would silently change what the
    // content it labels is filed under. Throws 409 for that.
    static async updateTag(tagId: number, input: UpdateTagInput): Promise<TagType | null> {
        if (input.tag_type !== undefined) {
            const { rows } = await pool.query(
                `SELECT t.tag_type, EXISTS (SELECT 1 FROM content_tags ct WHERE ct.tag_id = t.id) AS in_use
                 FROM tags t WHERE t.id = $1`,
                [tagId]
            );
            if (rows.length === 0) return null;
            if (rows[0].in_use && rows[0].tag_type !== input.tag_type) {
                throw new ApiError(409, 'Cannot change the type of a tag that is assigned to content');
            }
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (input.name !== undefined) {
            fields.push(`name = $${idx++}`);
            values.push(input.name);
        }
        if (input.tag_type !== undefined) {
            fields.push(`tag_type = $${idx++}`);
            values.push(input.tag_type);
        }
        if (input.description !== undefined) {
            fields.push(`description = $${idx++}`);
            values.push(input.description);
        }

        if (fields.length === 0) {
            return this.getTagById(tagId);
        }

        fields.push(`updated_at = now()`);
        values.push(tagId);

        const { rows } = await pool.query(
            `UPDATE tags
             SET ${fields.join(', ')}
             WHERE id = $${idx}
             RETURNING id, name, tag_type, description, created_at, updated_at`,
            values
        );

        if (rows.length === 0) return null;
        return this.mapTag(rows[0]);
    }

    // Deletes a tag by its ID
    static async deleteTag(tagId: number): Promise<boolean> {
        const { rowCount } = await pool.query(
            `DELETE FROM tags WHERE id = $1`,
            [tagId]
        );
        return (rowCount ?? 0) > 0;
    }

    // Retrieves all tags associated with a specific piece of content
    static async getContentTags(contentId: number): Promise<ContentTagType[]> {
        const { rows } = await pool.query(
            `SELECT ct.id, ct.content_id, ct.tag_id, t.name AS tag_name, t.tag_type, ct.created_at
             FROM content_tags ct
             JOIN tags t ON t.id = ct.tag_id
             WHERE ct.content_id = $1
             ORDER BY t.tag_type ASC, t.name ASC`,
            [contentId]
        );
        return rows.map((r) => this.mapContentTag(r));
    }
}
