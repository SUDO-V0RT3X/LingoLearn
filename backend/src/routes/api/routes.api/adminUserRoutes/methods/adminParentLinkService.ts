import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { requireChildForNewGuardianLink, requireRoomForAnotherGuardian } from '../../../../../shared/learnerAccess.js';
import type { UserRole } from '../../authRoutes/types/authType.js';
import { insertAdminAudit } from './adminAudit.js';
import type { AdminParentLink } from '../types/adminUserType.js';

type LinkRow = { link_id: number; guardian_id: number; learner_id: number; linked_at: Date; unlinked_at: Date | null };
type LinkUserRow = { id: number; first_name: string; last_name: string; role: UserRole; is_active: boolean };

// Maps a newly written link row to the route response shape.
function linkResponse(row: LinkRow) {
    return { linkId: row.link_id, guardianId: row.guardian_id, childId: row.learner_id, createdAt: row.linked_at.toISOString() };
}

export class AdminParentLinkService {
    /** Reads active links where the selected user is either guardian or learner. */
    static async getLinks(userId: number): Promise<AdminParentLink[]> {
        const rows = await pool.query<{
            link_id: number; guardian_id: number; learner_id: number; linked_at: Date;
            relationship: 'guardian' | 'child'; other_id: number; other_first_name: string;
            other_last_name: string; other_role: UserRole;
        }>(
            `SELECT l.link_id, l.guardian_id, l.learner_id, l.linked_at,
                    CASE WHEN l.guardian_id = $1 THEN 'guardian' ELSE 'child' END AS relationship,
                    other.id AS other_id, other.first_name AS other_first_name,
                    other.last_name AS other_last_name, other.role AS other_role
               FROM parent_child_links l
               JOIN users other ON other.id = CASE WHEN l.guardian_id = $1 THEN l.learner_id ELSE l.guardian_id END
              WHERE (l.guardian_id = $1 OR l.learner_id = $1) AND l.unlinked_at IS NULL
              ORDER BY l.linked_at`,
            [userId],
        );
        return rows.rows.map((row) => ({
            linkId: row.link_id,
            guardianId: row.guardian_id,
            childId: row.learner_id,
            createdAt: row.linked_at.toISOString(),
            relationship: row.relationship,
            otherUser: { userId: row.other_id, firstName: row.other_first_name, lastName: row.other_last_name, role: row.other_role },
        }));
    }

    /**
     * Creates one active guardian-learner link and one audit row in one transaction.
     * Only a child (set up, under 13) can be given a new guardian. A learner may
     * have several guardians, each once, up to the guardian limit.
     */
    static async create(adminId: number, guardianId: number, childId: number, reason: string | null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const users = await client.query<LinkUserRow>(
                `SELECT id, first_name, last_name, role, is_active FROM users
                  WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
                [[guardianId, childId]],
            );
            const guardian = users.rows.find((user) => user.id === guardianId);
            const child = users.rows.find((user) => user.id === childId);
            if (!guardian || guardian.role !== 'guardian' || !guardian.is_active) throw new ApiError(400, 'guardianId must identify an active guardian');
            if (!child || child.role !== 'learner' || !child.is_active) throw new ApiError(400, 'childId must identify an active learner');

            const existing = await client.query(
                `SELECT link_id FROM parent_child_links
                  WHERE guardian_id = $1 AND learner_id = $2 AND unlinked_at IS NULL FOR UPDATE`,
                [guardianId, childId],
            );
            if (existing.rowCount) throw new ApiError(409, 'This guardian and learner are already linked');
            await requireChildForNewGuardianLink(client, childId);
            await requireRoomForAnotherGuardian(client, childId);

            const inserted = await client.query<LinkRow>(
                `INSERT INTO parent_child_links (guardian_id, learner_id)
                 VALUES ($1, $2)
                 RETURNING link_id, guardian_id, learner_id, linked_at, unlinked_at`,
                [guardianId, childId],
            );
            await insertAdminAudit(client, adminId, childId, 'link_fix', null, { guardianId, childId, reason });
            await client.query('COMMIT');
            return linkResponse(inserted.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /** Marks one active link unlinked while retaining its database row. */
    static async unlink(adminId: number, linkId: number, reason: string | null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<LinkRow>(
                `SELECT link_id, guardian_id, learner_id, linked_at, unlinked_at
                   FROM parent_child_links WHERE link_id = $1 FOR UPDATE`,
                [linkId],
            );
            const link = result.rows[0];
            if (!link) throw new ApiError(404, 'Parent link not found');
            if (link.unlinked_at) throw new ApiError(409, 'Parent link is already unlinked');

            const updated = await client.query<LinkRow>(
                `UPDATE parent_child_links SET unlinked_at = now(), unlinked_by = $1
                  WHERE link_id = $2
                  RETURNING link_id, guardian_id, learner_id, linked_at, unlinked_at`,
                [adminId, linkId],
            );
            await insertAdminAudit(client, adminId, link.learner_id, 'unlink', { guardianId: link.guardian_id, childId: link.learner_id }, { reason });
            await client.query('COMMIT');
            return { ...linkResponse(updated.rows[0]), unlinkedAt: updated.rows[0].unlinked_at?.toISOString() ?? null };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Soft-unlinks the old row and inserts its replacement in one transaction.
     * The replacement is a new link, so the learner must still be a child: a link
     * that outlived the learner's 13th birthday can be ended, not moved.
     */
    static async relink(adminId: number, linkId: number, newGuardianId: number, reason: string | null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<LinkRow>(
                `SELECT link_id, guardian_id, learner_id, linked_at, unlinked_at
                   FROM parent_child_links WHERE link_id = $1 FOR UPDATE`,
                [linkId],
            );
            const oldLink = result.rows[0];
            if (!oldLink) throw new ApiError(404, 'Parent link not found');
            if (oldLink.unlinked_at) throw new ApiError(409, 'Parent link is already unlinked');
            if (oldLink.guardian_id === newGuardianId) throw new ApiError(409, 'The learner is already linked to this guardian');

            const guardianResult = await client.query<LinkUserRow>(
                `SELECT id, first_name, last_name, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
                [newGuardianId],
            );
            const guardian = guardianResult.rows[0];
            if (!guardian || guardian.role !== 'guardian' || !guardian.is_active) throw new ApiError(400, 'newGuardianId must identify an active guardian');
            // The learner may already have the new guardian as a second link: moving onto it would make a duplicate.
            const existing = await client.query(
                `SELECT 1 FROM parent_child_links
                  WHERE guardian_id = $1 AND learner_id = $2 AND unlinked_at IS NULL`,
                [newGuardianId, oldLink.learner_id],
            );
            if (existing.rowCount) throw new ApiError(409, 'The learner is already linked to this guardian');
            await requireChildForNewGuardianLink(client, oldLink.learner_id);

            await client.query(`UPDATE parent_child_links SET unlinked_at = now(), unlinked_by = $1 WHERE link_id = $2`, [adminId, linkId]);
            const inserted = await client.query<LinkRow>(
                `INSERT INTO parent_child_links (guardian_id, learner_id)
                 VALUES ($1, $2)
                 RETURNING link_id, guardian_id, learner_id, linked_at, unlinked_at`,
                [newGuardianId, oldLink.learner_id],
            );
            await insertAdminAudit(
                client,
                adminId,
                oldLink.learner_id,
                'link_fix',
                { linkId, guardianId: oldLink.guardian_id, childId: oldLink.learner_id },
                { linkId: inserted.rows[0].link_id, guardianId: newGuardianId, childId: oldLink.learner_id, reason },
            );
            await client.query('COMMIT');
            return linkResponse(inserted.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
