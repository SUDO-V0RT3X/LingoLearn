// Shared test helper: real accounts and session tokens, so integration tests
// can call routes that sit behind the auth gate.
import { pool } from '../../src/config/db/db_init.js';
import { AccountMethods } from '../../src/routes/api/routes.api/authRoutes/methods/accountMethods.js';
import { SessionMethods } from '../../src/routes/api/routes.api/authRoutes/methods/sessionMethods.js';
import type { PublicUser, UserRole } from '../../src/routes/api/routes.api/authRoutes/types/authType.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';

const createdUserIds: number[] = [];
let counter = 0;

/** Creates an account of any role and signs it in. */
export async function accountWithToken(role: UserRole): Promise<{ user: PublicUser; token: string }> {
    const unique = `${Date.now().toString(36)}${(counter += 1)}`;
    const user = await AccountMethods.createAccount({
        role,
        firstName: 'Test',
        lastName: role,
        // Within the sign-in limits (username 15, email 30), so tests can sign in as them.
        username: role === 'learner' ? `test${unique}` : null,
        email: role === 'learner' ? null : `t.${role.slice(0, 3)}${unique}@example.test`,
        password: 'password123',
    });

    createdUserIds.push(user.id);
    return { user, token: await SessionMethods.createSession(user) };
}

/**
 * A date of birth making a learner a child (8 years old) or an adult (20), as
 * YYYY-MM-DD. Only a child may get a new guardian link.
 */
export function dateOfBirthFor(kind: 'child' | 'adult'): string {
    const years = kind === 'child' ? 8 : 20;
    const date = new Date();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    return date.toISOString().slice(0, 10);
}

/** Saves learner setup (or changes it) with a child's or an adult's date of birth. */
export async function finishLearnerSetup(learnerId: number, kind: 'child' | 'adult' = 'child'): Promise<void> {
    await pool.query(
        `INSERT INTO learner_settings (user_id, target_language, date_of_birth, interface_language, daily_goal)
         VALUES ($1, 'zulu', $2::date, 'english', 15)
         ON CONFLICT (user_id) DO UPDATE SET date_of_birth = EXCLUDED.date_of_birth`,
        [learnerId, dateOfBirthFor(kind)]);
}

/** A signed-in learner who has finished setup as a child, so they may be linked to a guardian. */
export async function childWithToken(): Promise<{ user: PublicUser; token: string }> {
    const learner = await accountWithToken('learner');
    await finishLearnerSetup(learner.user.id, 'child');
    return learner;
}

/** Deletes every account these helpers created, and what points at it. Call from afterAll. */
export async function deleteTestAccounts(): Promise<void> {
    await pool.query(
        `DELETE FROM admin_audit_log WHERE admin_id = ANY($1::int[]) OR target_user = ANY($1::int[])`,
        [createdUserIds]);
    await pool.query(`DELETE FROM parent_link_codes WHERE learner_id = ANY($1::int[])`, [createdUserIds]);
    await pool.query(
        `DELETE FROM parent_child_links WHERE learner_id = ANY($1::int[]) OR guardian_id = ANY($1::int[])`,
        [createdUserIds]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [createdUserIds]);
    createdUserIds.length = 0;
}
