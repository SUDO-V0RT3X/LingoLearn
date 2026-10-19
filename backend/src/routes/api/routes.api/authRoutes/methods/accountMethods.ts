// Account SQL: signup, login, the staff seed and each account's interface
// language. Learners sign in with a username, every other role with an email
// address.
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { ENGLISH_LEARNERS_SEE_ENGLISH } from '../../../../../shared/learnerInterfaceLanguage.js';
import { PasswordMethods } from './passwordMethods.js';
import { SessionMethods } from './sessionMethods.js';
import {
    ACCOUNT_LIMITS,
    isInterfaceLanguage,
    isSelfServiceRole,
    isUserRole,
    toPublicUser,
    USER_ROLES,
    type InterfaceLanguage,
    type PublicUser,
    type UserRole,
    type UserRow,
} from '../types/authType.js';

// The refusals for over-long sign-up and sign-in details (translated on screen).
export const USERNAME_RULE = `Username must be ${ACCOUNT_LIMITS.usernameMin}-${ACCOUNT_LIMITS.usernameMax} letters, numbers, dots, dashes, or underscores`;
export const PASSWORD_TOO_LONG = `Password can be at most ${ACCOUNT_LIMITS.passwordMax} characters`;
export const EMAIL_TOO_LONG = `Email can be at most ${ACCOUNT_LIMITS.emailMax} characters`;
export const IDENTIFIER_TOO_LONG = `Username or email can be at most ${ACCOUNT_LIMITS.emailMax} characters`;

export const NAME_RULE = `Name must be ${ACCOUNT_LIMITS.nameMin}-${ACCOUNT_LIMITS.nameMax} characters and contain only letters, spaces, hyphens, or apostrophes`;
export const EMAIL_TOO_SHORT = `Email must be at least ${ACCOUNT_LIMITS.emailMin} characters`;

function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ApiError(400, `${field} is required`, [{ field, message: `${field} is required` }]);
    }

    return value.trim();
}

/**
 * Validates first and last names according to length and character rules.
 */
function validateName(value: string, field: 'firstName' | 'lastName'): string {
    const trimmed = value.trim();
    if (trimmed.length < ACCOUNT_LIMITS.nameMin || trimmed.length > ACCOUNT_LIMITS.nameMax) {
        throw new ApiError(400, NAME_RULE, [{ field, message: NAME_RULE }]);
    }
    if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
        throw new ApiError(400, NAME_RULE, [{ field, message: NAME_RULE }]);
    }
    return trimmed;
}

/**
 * Validates and normalizes an email address for the roles that authenticate by
 * email: guardian, moderator, author and administrator.
 */
function validateEmail(email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length < ACCOUNT_LIMITS.emailMin) {
        throw new ApiError(400, EMAIL_TOO_SHORT, [{ field: 'email', message: EMAIL_TOO_SHORT }]);
    }
    if (normalizedEmail.length > ACCOUNT_LIMITS.emailMax) {
        throw new ApiError(400, EMAIL_TOO_LONG, [{ field: 'email', message: EMAIL_TOO_LONG }]);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
        throw new ApiError(400, 'Email must be a valid email address', [
            { field: 'email', message: 'Email must be a valid email address' },
        ]);
    }

    return normalizedEmail;
}

/**
 * Validates and normalizes the learner username that replaces email for learner
 * sign in. The restricted character set keeps usernames simple to type.
 */
function validateUsername(username: string): string {
    const normalizedUsername = username.trim().toLowerCase();
    const pattern = new RegExp(`^[a-z0-9._-]{${ACCOUNT_LIMITS.usernameMin},${ACCOUNT_LIMITS.usernameMax}}$`);
    if (!pattern.test(normalizedUsername)) {
        throw new ApiError(400, USERNAME_RULE, [{ field: 'username', message: USERNAME_RULE }]);
    }

    return normalizedUsername;
}

function validatePassword(password: string): string {
    if (password.length < ACCOUNT_LIMITS.passwordMin) {
        throw new ApiError(400, 'Password must be at least 8 characters', [
            { field: 'password', message: 'Password must be at least 8 characters' },
        ]);
    }
    rejectLongPassword(password);

    return password;
}

function rejectLongPassword(password: string): void {
    if (password.length > ACCOUNT_LIMITS.passwordMax) {
        throw new ApiError(400, PASSWORD_TOO_LONG, [{ field: 'password', message: PASSWORD_TOO_LONG }]);
    }
}

export class AccountMethods {
    static roles(): readonly UserRole[] {
        return USER_ROLES;
    }

    /**
     * Creates an account of a role the public may choose, and opens a session
     * for it. Staff roles are refused here; they come from the seed script.
     */
    static async signUp(input: Record<string, unknown>): Promise<{ user: PublicUser; token: string }> {
        const role = input.role;
        if (!isSelfServiceRole(role)) {
            const message = isUserRole(role)
                ? 'Staff accounts are created by an administrator, not by signing up'
                : 'Invalid account type';
            throw new ApiError(400, message, [{ field: 'role', message }]);
        }

        const user = await this.createAccount({
            role,
            firstName: validateName(requireString(input.firstName, 'firstName'), 'firstName'),
            lastName: validateName(requireString(input.lastName, 'lastName'), 'lastName'),
            password: validatePassword(requireString(input.password, 'password')),
            username: role === 'learner' ? validateUsername(requireString(input.username, 'username')) : null,
            email: role === 'learner' ? null : validateEmail(requireString(input.email, 'email')),
        });

        return { user, token: await SessionMethods.createSession(user) };
    }

    /**
     * Inserts one account. Shared by signup and the staff seed script, so every
     * account is created by the same path and with the same hashing.
     */
    static async createAccount(account: {
        role: UserRole;
        firstName: string;
        lastName: string;
        password: string;
        username: string | null;
        email: string | null;
    }): Promise<PublicUser> {
        const passwordHash = await PasswordMethods.hashPassword(account.password);

        try {
            const { rows } = await pool.query<UserRow>(
                `INSERT INTO users (username, first_name, last_name, email, role, password_hash)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, username, first_name, last_name, email, role,
                           requires_guardian_link, password_hash, is_active, interface_language`,
                [account.username, account.firstName, account.lastName, account.email, account.role, passwordHash],
            );

            return toPublicUser(rows[0]);
        } catch (e) {
            const code = (e as { code?: string }).code;
            const constraint = (e as { constraint?: string }).constraint ?? '';
            if (code === '23505') {
                throw new ApiError(409, constraint.includes('username') ? 'Username already in use' : 'Email already in use');
            }

            throw e;
        }
    }

    /**
     * Signs in an active account. The identifier is a learner username or a
     * non-learner email address; the reply is the same for an unknown account
     * and a wrong password.
     */
    static async login(input: Record<string, unknown>): Promise<{ user: PublicUser; token: string }> {
        const identifier = requireString(input.identifier ?? input.email ?? input.username, 'identifier').toLowerCase();
        const password = requireString(input.password, 'password');
        // Nothing longer can belong to an account: refuse it before any lookup.
        if (identifier.length > Math.max(ACCOUNT_LIMITS.emailMax, ACCOUNT_LIMITS.usernameMax)) {
            throw new ApiError(400, IDENTIFIER_TOO_LONG, [{ field: 'identifier', message: IDENTIFIER_TOO_LONG }]);
        }
        rejectLongPassword(password);

        const { rows } = await pool.query<UserRow>(
            `SELECT id, username, first_name, last_name, email, role,
                    requires_guardian_link, password_hash, is_active, interface_language
               FROM users
              WHERE is_active = true AND (email = $1 OR username = $1)`,
            [identifier],
        );

        const row = rows[0];
        if (!row || !(await PasswordMethods.verifyPassword(password, row.password_hash))) {
            throw new ApiError(401, 'Invalid credentials');
        }

        const user = toPublicUser(row);
        return { user, token: await SessionMethods.createSession(user) };
    }

    /**
     * Reads one active account by id. The auth gate uses it to confirm the
     * account behind a session token still exists and is active.
     */
    static async getActiveUser(userId: number): Promise<PublicUser | null> {
        const { rows } = await pool.query<UserRow>(
            `SELECT id, username, first_name, last_name, email, role,
                    requires_guardian_link, password_hash, is_active, interface_language
               FROM users WHERE id = $1 AND is_active = true`,
            [userId],
        );

        return rows[0] ? toPublicUser(rows[0]) : null;
    }

    /**
     * Saves the language an account's menus and buttons are shown in, for any
     * role, so the choice follows them to every device. A learner's setup row
     * holds the same choice and is kept in step in the same statement; a
     * learner who has not finished setup has no row yet, and only the account
     * changes. A learner of English cannot choose isiZulu: their menus stay in
     * English (400, nothing changes), since learner_settings decides a
     * learner's interface language.
     */
    static async saveInterfaceLanguage(userId: number, input: Record<string, unknown>): Promise<{ interfaceLanguage: InterfaceLanguage }> {
        const interfaceLanguage = input.interfaceLanguage;
        if (!isInterfaceLanguage(interfaceLanguage)) {
            const message = "interfaceLanguage must be 'english' or 'zulu'";
            throw new ApiError(400, message, [{ field: 'interfaceLanguage', message }]);
        }

        const { rows } = await pool.query<{ interface_language: InterfaceLanguage | null; refused: boolean }>(
            `WITH refused AS (
                 SELECT 1 FROM learner_settings s JOIN users u ON u.id = s.user_id
                  WHERE s.user_id = $1 AND u.role = 'learner'
                    AND s.target_language = 'english' AND $2 <> 'english'
             ), account AS (
                 UPDATE users SET interface_language = $2
                  WHERE id = $1 AND is_active = true AND NOT EXISTS (SELECT 1 FROM refused)
              RETURNING id, role, interface_language
             ), setup AS (
                 UPDATE learner_settings s SET interface_language = $2, updated_at = now()
                   FROM account a
                  WHERE s.user_id = a.id AND a.role = 'learner'
             )
             SELECT (SELECT interface_language FROM account) AS interface_language,
                    EXISTS (SELECT 1 FROM refused) AS refused`,
            [userId, interfaceLanguage],
        );
        if (rows[0]?.refused) {
            throw new ApiError(400, ENGLISH_LEARNERS_SEE_ENGLISH, [{ field: 'interfaceLanguage', message: ENGLISH_LEARNERS_SEE_ENGLISH }]);
        }
        //The auth gate has just found this account, so no row means it was closed since.
        const saved = rows[0]?.interface_language;
        if (!saved) throw new ApiError(401, 'Session invalid');
        return { interfaceLanguage: saved };
    }
}
