// Identity and access types. Rows live in migrations/100_users_sessions.sql and
// 101_parent_linking.sql; nothing here is stored outside Postgres.
export const USER_ROLES = ['learner', 'guardian', 'moderator', 'author', 'administrator'] as const;

export type UserRole = typeof USER_ROLES[number];

// How long the things a person types to sign up or sign in may be. The sign-in
// screen caps its inputs at the same lengths.
export const ACCOUNT_LIMITS = {
    usernameMin: 3,
    usernameMax: 20,
    passwordMin: 8,
    passwordMax: 20,
    emailMin: 5,
    emailMax: 60,
    nameMin: 1,
    nameMax: 50,
} as const;

// Roles anyone may create for themselves. Staff accounts come from the seed
// script (npm run seed:staff) so nobody can sign up as a moderator or admin.
export const SELF_SERVICE_ROLES = ['learner', 'guardian'] as const;

// The languages the interface (menus, buttons, messages) can be shown in.
// migrations/105_users_interface_language.sql holds the same list.
export const INTERFACE_LANGUAGES = ['english', 'zulu'] as const;

export type InterfaceLanguage = typeof INTERFACE_LANGUAGES[number];

export type PublicUser = {
    id: number;
    username: string | null;
    firstName: string;
    lastName: string;
    name: string;
    email: string | null;
    role: UserRole;
    requiresGuardianLink: boolean;
    // The account's saved interface language, or null when it has never chosen one.
    interfaceLanguage: InterfaceLanguage | null;
};

export type UserRow = {
    id: number;
    username: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
    role: UserRole;
    requires_guardian_link: boolean;
    password_hash: string;
    is_active: boolean;
    interface_language: InterfaceLanguage | null;
};

export type ParentLinkCode = {
    code: string;
    expiresAt: string;
};

export type LinkedChild = PublicUser & { linkedAt: string };

/** What a learner sees of a guardian linked to them: a name to recognise, nothing to contact. */
export type LinkedGuardian = { firstName: string; lastName: string; linkedAt: string };

export function isUserRole(role: unknown): role is UserRole {
    return typeof role === 'string' && USER_ROLES.includes(role as UserRole);
}

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
    return typeof value === 'string' && (INTERFACE_LANGUAGES as readonly string[]).includes(value);
}

export function isSelfServiceRole(role: unknown): role is UserRole {
    return typeof role === 'string' && (SELF_SERVICE_ROLES as readonly string[]).includes(role);
}

/**
 * Turns a users row into the public shape the API returns. Password hashes and
 * the active flag stay on the server.
 */
export function toPublicUser(row: UserRow): PublicUser {
    return {
        id: row.id,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        role: row.role,
        requiresGuardianLink: row.requires_guardian_link,
        interfaceLanguage: row.interface_language ?? null,
    };
}
