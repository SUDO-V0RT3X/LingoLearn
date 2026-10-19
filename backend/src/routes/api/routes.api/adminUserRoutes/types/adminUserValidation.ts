import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { isUserRole, type UserRole } from '../../authRoutes/types/authType.js';
import type { AdminUserQuery } from './adminUserType.js';

// Reads one query-string value and rejects repeated values.
function single(value: unknown, field: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new ApiError(400, `${field} must be a single value`);
    return value;
}

// Parses one positive integer or throws a field-specific validation error.
export function requirePositiveId(value: unknown, field: string): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        throw new ApiError(400, `${field} must be a positive integer`, [{ field, message: 'Must be a positive integer' }]);
    }
    return parsed;
}

// Returns an optional trimmed reason with a bounded storage length.
export function optionalReason(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') throw new ApiError(400, 'reason must be text');
    const reason = value.trim();
    if (reason.length > 500) throw new ApiError(400, 'reason must be 500 characters or fewer');
    return reason || null;
}

// Validates the requested role-change body.
export function validateRoleChange(body: Record<string, unknown>): { role: UserRole; reason: string | null } {
    if (!isUserRole(body.role)) {
        throw new ApiError(400, 'role must be one of learner, guardian, author, moderator, administrator');
    }
    return { role: body.role, reason: optionalReason(body.reason) };
}

// Validates list filters and applies default and maximum pagination values.
export function validateAdminUserQuery(raw: Record<string, unknown>): AdminUserQuery {
    let q = single(raw.q, 'q')?.trim() || null;
    if (q && q.length > 100) {
        q = q.slice(0, 100);
    }
    const rawRole = single(raw.role, 'role')?.trim() || null;
    if (rawRole !== null && !isUserRole(rawRole)) {
        throw new ApiError(
            400,
            'role must be one of learner, guardian, author, moderator, administrator',
            [{ field: 'role', message: 'Invalid user role' }],
        );
    }

    const parsePage = (value: unknown, field: string, fallback: number) => {
        if (value === undefined) return fallback;
        return requirePositiveId(single(value, field), field);
    };

    return {
        q,
        role: rawRole,
        page: parsePage(raw.page, 'page', 1),
        pageSize: Math.min(parsePage(raw.pageSize, 'pageSize', 20), 100),
    };
}
