import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import type { UserRole } from '../../authRoutes/types/authType.js';
import { insertAdminAudit } from './adminAudit.js';
import type { AdminUser, AdminUserQuery, AdminUsersResponse } from '../types/adminUserType.js';

type AdminUserRow = {
    id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    username: string | null;
    role: UserRole;
    is_active: boolean;
    created_at: Date;
    can_link_guardian?: boolean;
};

// Escapes backslash, percent and underscore in a PostgreSQL LIKE pattern.
export function escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, '\\$&');
}

// Maps selected user columns into the public administrator row.
function publicUser(row: AdminUserRow): AdminUser {
    return {
        userId: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        username: row.username,
        role: row.role,
        status: row.is_active ? 'active' : 'deactivated',
        createdAt: row.created_at.toISOString(),
        ...(row.can_link_guardian === undefined ? {} : { canLinkGuardian: row.can_link_guardian }),
    };
}

const PUBLIC_COLUMNS = 'id, first_name, last_name, email, username, role, is_active, created_at';

/**
 * Learners sign in with a username and have no email; every other role is the
 * reverse. A role change cannot cross that line without inventing an identity,
 * so it is refused in either direction.
 */
export function crossesLearnerBoundary(from: UserRole, to: UserRole): boolean {
    return (from === 'learner') !== (to === 'learner');
}

export const LEARNER_BOUNDARY_MESSAGE =
    'A learner account cannot become a staff or guardian account, or the other way round: learners sign in with a username, everyone else with an email. Create a separate account instead.';

export class AdminUserService {
    /** Reads one filtered, sorted page without selecting private account columns. */
    static async listUsers(query: AdminUserQuery): Promise<AdminUsersResponse> {
        const clauses: string[] = [];
        const values: unknown[] = [];

        if (query.q !== null) {
            if (/^[1-9]\d*$/.test(query.q) && Number.isSafeInteger(Number(query.q))) {
                values.push(Number(query.q));
                clauses.push(`id = $${values.length}`);
            } else {
                values.push(`%${escapeLikePattern(query.q)}%`);
                clauses.push(`LOWER(first_name || ' ' || last_name) LIKE LOWER($${values.length}) ESCAPE '\\'`);
            }
        }
        if (query.role !== null) {
            values.push(query.role);
            clauses.push(`role = $${values.length}`);
        }

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const count = await pool.query<{ total: string }>(`SELECT COUNT(*) AS total FROM users ${where}`, values);
        const pageValues = [...values, query.pageSize, (query.page - 1) * query.pageSize];
        const rows = await pool.query<AdminUserRow>(
            `SELECT ${PUBLIC_COLUMNS},
                    (role = 'learner' AND EXISTS (
                        SELECT 1 FROM learner_settings s
                         WHERE s.user_id = users.id
                           AND s.date_of_birth > current_date - interval '13 years')) AS can_link_guardian
               FROM users ${where}
             ORDER BY last_name, first_name, id
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            pageValues,
        );

        return { users: rows.rows.map(publicUser), page: query.page, pageSize: query.pageSize, total: Number(count.rows[0]?.total ?? 0) };
    }

    /** Changes one active user's role, revokes their sessions and records the change. */
    static async changeRole(adminId: number, targetId: number, role: UserRole, reason: string | null): Promise<AdminUser> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<AdminUserRow>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [targetId]);
            const target = result.rows[0];
            if (!target) throw new ApiError(404, 'User not found');
            if (targetId === adminId) throw new ApiError(409, 'You cannot change your own role');
            if (!target.is_active) throw new ApiError(409, 'A deactivated account cannot change role');
            if (target.role === role) throw new ApiError(400, 'The user already has this role');
            if (crossesLearnerBoundary(target.role, role)) throw new ApiError(409, LEARNER_BOUNDARY_MESSAGE);

            if (target.role === 'guardian' && role !== 'guardian') {
                const links = await client.query(
                    `SELECT link_id FROM parent_child_links WHERE guardian_id = $1 AND unlinked_at IS NULL FOR UPDATE`,
                    [targetId],
                );
                if (links.rowCount) throw new ApiError(409, 'Unlink this guardian from all learners before changing their role');
            }
            if (target.role === 'administrator' && role !== 'administrator') {
                const activeAdmins = await client.query(`SELECT id FROM users WHERE role = 'administrator' AND is_active = true FOR UPDATE`);
                if ((activeAdmins.rowCount ?? 0) <= 1) throw new ApiError(409, 'At least one active administrator is required');
            }

            const updated = await client.query<AdminUserRow>(
                `UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING ${PUBLIC_COLUMNS}`,
                [role, targetId],
            );
            await client.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetId]);
            await insertAdminAudit(client, adminId, targetId, 'role_change', { role: target.role }, { role, reason });
            await client.query('COMMIT');
            return publicUser(updated.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /** Marks one account inactive, revokes its sessions and records the deactivation. */
    static async deactivate(adminId: number, targetId: number, reason: string | null): Promise<AdminUser> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<AdminUserRow>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [targetId]);
            const target = result.rows[0];
            if (!target) throw new ApiError(404, 'User not found');
            if (targetId === adminId) throw new ApiError(409, 'You cannot deactivate your own account');
            if (!target.is_active) throw new ApiError(409, 'This account is already deactivated');

            if (target.role === 'administrator') {
                const activeAdmins = await client.query(`SELECT id FROM users WHERE role = 'administrator' AND is_active = true FOR UPDATE`);
                if ((activeAdmins.rowCount ?? 0) <= 1) throw new ApiError(409, 'At least one active administrator is required');
            }

            const updated = await client.query<AdminUserRow>(
                `UPDATE users
                    SET is_active = false, deactivated_at = now(), deactivated_by = $1, updated_at = now()
                  WHERE id = $2
                  RETURNING ${PUBLIC_COLUMNS}`,
                [adminId, targetId],
            );
            await client.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [targetId]);
            await insertAdminAudit(client, adminId, targetId, 'deactivate', { status: 'active' }, { status: 'deactivated', reason });
            await client.query('COMMIT');
            return publicUser(updated.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
