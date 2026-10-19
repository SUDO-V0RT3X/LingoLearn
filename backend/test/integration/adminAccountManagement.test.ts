import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/config/db/db_init.js';
import {
    AdminUserService,
    LEARNER_BOUNDARY_MESSAGE,
    crossesLearnerBoundary,
} from '../../src/routes/api/routes.api/adminUserRoutes/methods/adminUserService.js';
import { GUARDIAN_LIMIT_REACHED, MAX_ACTIVE_GUARDIANS } from '../../src/shared/learnerAccess.js';
import { accountWithToken, childWithToken, deleteTestAccounts, finishLearnerSetup } from '../helpers/accounts.js';

process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret';
const app = createApp();

let admin: Awaited<ReturnType<typeof accountWithToken>>;

// Adds the administrator bearer token to one Supertest request.
function asAdmin(httpRequest: request.Test): request.Test {
    return httpRequest.set('Authorization', `Bearer ${admin.token}`);
}

beforeAll(async () => {
    admin = await accountWithToken('administrator');
});

afterAll(async () => {
    await deleteTestAccounts();
});

describe('administrator account actions', () => {
    it('changes a role, writes an audit row, rejects the old token and returns the new role on sign-in', async () => {
        const target = await accountWithToken('guardian');

        const changed = await asAdmin(request(app).patch(`/api/admin/users/${target.user.id}/role`))
            .send({ role: 'author', reason: 'Approved as an author' });

        expect(changed.status).toBe(200);
        expect(changed.body.user).toMatchObject({ userId: target.user.id, role: 'author' });
        expect(changed.body.user).not.toHaveProperty('passwordHash');

        const audit = await pool.query(
            `SELECT action, old_value, new_value FROM admin_audit_log
              WHERE target_user = $1 ORDER BY log_id DESC LIMIT 1`,
            [target.user.id],
        );
        expect(audit.rows[0]).toMatchObject({ action: 'role_change', old_value: { role: 'guardian' } });
        expect(audit.rows[0].new_value).toMatchObject({ role: 'author', reason: 'Approved as an author' });

        expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${target.token}`)).status).toBe(401);
        const signedIn = await request(app).post('/api/auth/login').send({ identifier: target.user.email, password: 'password123' });
        expect(signedIn.status).toBe(200);
        expect(signedIn.body.user.role).toBe('author');
    });

    it('allows an active user to be promoted to administrator', async () => {
        const target = await accountWithToken('moderator');
        const response = await asAdmin(request(app).patch(`/api/admin/users/${target.user.id}/role`)).send({ role: 'administrator' });
        expect(response.status).toBe(200);
        expect(response.body.user.role).toBe('administrator');
    });

    it('rejects self role changes, duplicate roles and role changes on deactivated users', async () => {
        const self = await asAdmin(request(app).patch(`/api/admin/users/${admin.user.id}/role`)).send({ role: 'author' });
        expect(self.status).toBe(409);
        expect(self.body.error).toBe('You cannot change your own role');

        const target = await accountWithToken('author');
        const same = await asAdmin(request(app).patch(`/api/admin/users/${target.user.id}/role`)).send({ role: 'author' });
        expect(same.status).toBe(400);

        await pool.query(`UPDATE users SET is_active = false, deactivated_at = now() WHERE id = $1`, [target.user.id]);
        const inactive = await asAdmin(request(app).patch(`/api/admin/users/${target.user.id}/role`)).send({ role: 'moderator' });
        expect(inactive.status).toBe(409);
    });

    it('refuses to turn a learner into any other role, or any other role into a learner', async () => {
        const learner = await accountWithToken('learner');
        for (const role of ['guardian', 'author', 'moderator', 'administrator'] as const) {
            const res = await asAdmin(request(app).patch(`/api/admin/users/${learner.user.id}/role`)).send({ role });
            expect(res.status).toBe(409);
            expect(res.body.error).toBe(LEARNER_BOUNDARY_MESSAGE);
        }

        for (const from of ['guardian', 'author', 'moderator'] as const) {
            const account = await accountWithToken(from);
            const res = await asAdmin(request(app).patch(`/api/admin/users/${account.user.id}/role`)).send({ role: 'learner' });
            expect(res.status).toBe(409);
            expect(res.body.error).toBe(LEARNER_BOUNDARY_MESSAGE);
        }

        // Nothing changed and nothing was audited.
        const stored = await pool.query(`SELECT role FROM users WHERE id = $1`, [learner.user.id]);
        expect(stored.rows[0].role).toBe('learner');
        const audit = await pool.query(`SELECT 1 FROM admin_audit_log WHERE target_user = $1`, [learner.user.id]);
        expect(audit.rowCount).toBe(0);
    });

    it('blocks guardian and learner role changes while they have an active link', async () => {
        const guardian = await accountWithToken('guardian');
        const learner = await childWithToken();
        const link = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: learner.user.id });
        expect(link.status).toBe(201);

        const guardianChange = await asAdmin(request(app).patch(`/api/admin/users/${guardian.user.id}/role`)).send({ role: 'author' });
        expect(guardianChange.status).toBe(409);
        const learnerChange = await asAdmin(request(app).patch(`/api/admin/users/${learner.user.id}/role`)).send({ role: 'author' });
        expect(learnerChange.status).toBe(409);
    });

    it('crossesLearnerBoundary: only a change into or out of learner crosses', () => {
        expect(crossesLearnerBoundary('learner', 'guardian')).toBe(true);
        expect(crossesLearnerBoundary('administrator', 'learner')).toBe(true);
        expect(crossesLearnerBoundary('guardian', 'author')).toBe(false);
        expect(crossesLearnerBoundary('moderator', 'administrator')).toBe(false);
        expect(crossesLearnerBoundary('learner', 'learner')).toBe(false);
    });

    it('deactivates without deleting, records metadata and rejects the old token', async () => {
        const target = await accountWithToken('guardian');
        const response = await asAdmin(request(app).post(`/api/admin/users/${target.user.id}/deactivate`))
            .send({ reason: 'Duplicate account' });
        expect(response.status).toBe(200);
        expect(response.body.user.status).toBe('deactivated');

        const stored = await pool.query(
            `SELECT is_active, deactivated_at, deactivated_by FROM users WHERE id = $1`,
            [target.user.id],
        );
        expect(stored.rows[0].is_active).toBe(false);
        expect(stored.rows[0].deactivated_at).toBeInstanceOf(Date);
        expect(stored.rows[0].deactivated_by).toBe(admin.user.id);
        expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${target.token}`)).status).toBe(401);
    });

    it('rejects self-deactivation and an already deactivated account', async () => {
        const self = await asAdmin(request(app).post(`/api/admin/users/${admin.user.id}/deactivate`)).send({});
        expect(self.status).toBe(409);
        expect(self.body.error).toBe('You cannot deactivate your own account');

        const target = await accountWithToken('guardian');
        expect((await asAdmin(request(app).post(`/api/admin/users/${target.user.id}/deactivate`)).send({})).status).toBe(200);
        const again = await asAdmin(request(app).post(`/api/admin/users/${target.user.id}/deactivate`)).send({});
        expect(again.status).toBe(409);
    });

    it('rejects changing or deactivating the final active administrator', async () => {
        const target = await accountWithToken('administrator');
        const snapshot = await pool.query<{
            id: number; is_active: boolean; deactivated_at: Date | null; deactivated_by: number | null;
        }>(`SELECT id, is_active, deactivated_at, deactivated_by FROM users WHERE role = 'administrator'`);

        try {
            await pool.query(
                `UPDATE users
                    SET is_active = false, deactivated_at = COALESCE(deactivated_at, now())
                  WHERE role = 'administrator' AND id <> $1`,
                [target.user.id],
            );

            await expect(AdminUserService.changeRole(-1, target.user.id, 'author', null))
                .rejects.toMatchObject({ status: 409, message: 'At least one active administrator is required' });
            await expect(AdminUserService.deactivate(-1, target.user.id, null))
                .rejects.toMatchObject({ status: 409, message: 'At least one active administrator is required' });
        } finally {
            for (const user of snapshot.rows) {
                await pool.query(
                    `UPDATE users SET is_active = $2, deactivated_at = $3, deactivated_by = $4 WHERE id = $1`,
                    [user.id, user.is_active, user.deactivated_at, user.deactivated_by],
                );
            }
        }
    });
});

describe('administrator parent-link actions', () => {
    it('rejects wrong roles, deactivated users and duplicate active links', async () => {
        const guardian = await accountWithToken('guardian');
        const learner = await childWithToken();
        const author = await accountWithToken('author');

        expect((await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: author.user.id, childId: learner.user.id })).status).toBe(400);
        expect((await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: author.user.id })).status).toBe(400);

        const created = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: learner.user.id });
        expect(created.status).toBe(201);
        expect((await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: learner.user.id })).status).toBe(409);

        const inactiveGuardian = await accountWithToken('guardian');
        await pool.query(`UPDATE users SET is_active = false, deactivated_at = now() WHERE id = $1`, [inactiveGuardian.user.id]);
        expect((await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: inactiveGuardian.user.id, childId: learner.user.id })).status).toBe(400);
    });

    it('lists active links and unlinks one without deleting its row', async () => {
        const guardian = await accountWithToken('guardian');
        const learner = await childWithToken();
        const created = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: learner.user.id });
        const linkId = created.body.link.linkId;

        const listed = await asAdmin(request(app).get(`/api/admin/users/${learner.user.id}/links`));
        expect(listed.status).toBe(200);
        expect(listed.body.links[0]).toMatchObject({ linkId, guardianId: guardian.user.id, childId: learner.user.id });

        const unlinked = await asAdmin(request(app).post(`/api/admin/parent-links/${linkId}/unlink`)).send({ reason: 'Incorrect link' });
        expect(unlinked.status).toBe(200);
        const stored = await pool.query(`SELECT unlinked_at, unlinked_by FROM parent_child_links WHERE link_id = $1`, [linkId]);
        expect(stored.rows).toHaveLength(1);
        expect(stored.rows[0].unlinked_at).toBeInstanceOf(Date);
        expect(stored.rows[0].unlinked_by).toBe(admin.user.id);
    });

    it('refuses to move a link onto a guardian the learner already has, and keeps the old link', async () => {
        const oldGuardian = await accountWithToken('guardian');
        const newGuardian = await accountWithToken('guardian');
        const learner = await childWithToken();
        const oldLink = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: oldGuardian.user.id, childId: learner.user.id });
        await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: newGuardian.user.id, childId: learner.user.id });

        const failed = await asAdmin(request(app).post(`/api/admin/parent-links/${oldLink.body.link.linkId}/relink`))
            .send({ newGuardianId: newGuardian.user.id });
        expect(failed.status).toBe(409);
        expect(failed.body.error).toBe('The learner is already linked to this guardian');

        const stored = await pool.query(`SELECT unlinked_at FROM parent_child_links WHERE link_id = $1`, [oldLink.body.link.linkId]);
        expect(stored.rows[0].unlinked_at).toBeNull();
    });

    it('links a child to several guardians, up to the limit', async () => {
        const learner = await childWithToken();
        const link = (guardianId: number) => asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId, childId: learner.user.id });

        for (let index = 0; index < MAX_ACTIVE_GUARDIANS; index += 1) {
            const guardian = await accountWithToken('guardian');
            expect((await link(guardian.user.id)).status).toBe(201);
        }
        const oneTooMany = await accountWithToken('guardian');
        const refused = await link(oneTooMany.user.id);
        expect(refused.status).toBe(409);
        expect(refused.body.error).toBe(GUARDIAN_LIMIT_REACHED);

        const listed = await asAdmin(request(app).get(`/api/admin/users/${learner.user.id}/links`));
        expect(listed.body.links).toHaveLength(MAX_ACTIVE_GUARDIANS);
    });
});

describe('administrator parent links are only for children', () => {
    const CHILD_ONLY = 'only a learner under 13 can be linked to a guardian';

    it('refuses to link an adult learner, or one who has not finished setup, and writes nothing', async () => {
        const guardian = await accountWithToken('guardian');
        const adult = await accountWithToken('learner');
        await finishLearnerSetup(adult.user.id, 'adult');
        const notSetUp = await accountWithToken('learner');

        for (const learner of [adult, notSetUp]) {
            const refused = await asAdmin(request(app).post('/api/admin/parent-links'))
                .send({ guardianId: guardian.user.id, childId: learner.user.id });
            expect(refused.status).toBe(409);
            expect(refused.body.error).toBe(CHILD_ONLY);
            const rows = await pool.query(`SELECT 1 FROM parent_child_links WHERE learner_id = $1`, [learner.user.id]);
            expect(rows.rowCount).toBe(0);
            const audit = await pool.query(`SELECT 1 FROM admin_audit_log WHERE target_user = $1`, [learner.user.id]);
            expect(audit.rowCount).toBe(0);
        }
    });

    it('the user list says which learners may be linked, so the modal offers no picker for the rest', async () => {
        const child = await childWithToken();
        const adult = await accountWithToken('learner');
        await finishLearnerSetup(adult.user.id, 'adult');
        const notSetUp = await accountWithToken('learner');
        const guardian = await accountWithToken('guardian');

        const flagFor = async (id: number) => {
            const response = await asAdmin(request(app).get('/api/admin/users')).query({ q: String(id) });
            expect(response.status).toBe(200);
            return response.body.users[0].canLinkGuardian;
        };
        expect(await flagFor(child.user.id)).toBe(true);
        expect(await flagFor(adult.user.id)).toBe(false);
        expect(await flagFor(notSetUp.user.id)).toBe(false);
        expect(await flagFor(guardian.user.id)).toBe(false);
    });

    it('keeps a link made before the learner turned 13, lists it, and lets it be ended but not moved', async () => {
        const guardian = await accountWithToken('guardian');
        const otherGuardian = await accountWithToken('guardian');
        const learner = await childWithToken();
        const created = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: guardian.user.id, childId: learner.user.id });
        expect(created.status).toBe(201);
        const linkId = created.body.link.linkId;

        // Time passes: the learner is now an adult.
        await finishLearnerSetup(learner.user.id, 'adult');

        const listed = await asAdmin(request(app).get(`/api/admin/users/${learner.user.id}/links`));
        expect(listed.body.links.map((link: { linkId: number }) => link.linkId)).toEqual([linkId]);

        const moved = await asAdmin(request(app).post(`/api/admin/parent-links/${linkId}/relink`))
            .send({ newGuardianId: otherGuardian.user.id });
        expect(moved.status).toBe(409);
        expect(moved.body.error).toBe(CHILD_ONLY);
        const stored = await pool.query(`SELECT unlinked_at FROM parent_child_links WHERE learner_id = $1`, [learner.user.id]);
        expect(stored.rows).toEqual([{ unlinked_at: null }]);

        const added = await asAdmin(request(app).post('/api/admin/parent-links'))
            .send({ guardianId: otherGuardian.user.id, childId: learner.user.id });
        expect(added.status).toBe(409);

        const ended = await asAdmin(request(app).post(`/api/admin/parent-links/${linkId}/unlink`)).send({});
        expect(ended.status).toBe(200);
    });
});

describe('administrator write-route authorization and source constraints', () => {
    it('returns 403 for non-administrators and 401 without a token on every write route', async () => {
        const learner = await accountWithToken('learner');
        const routes = [
            { method: 'patch', path: '/api/admin/users/1/role', body: { role: 'author' } },
            { method: 'post', path: '/api/admin/users/1/deactivate', body: {} },
            { method: 'post', path: '/api/admin/parent-links', body: { guardianId: 1, childId: 2 } },
            { method: 'post', path: '/api/admin/parent-links/1/unlink', body: {} },
            { method: 'post', path: '/api/admin/parent-links/1/relink', body: { newGuardianId: 2 } },
        ] as const;

        for (const route of routes) {
            const withoutToken = request(app)[route.method](route.path).send(route.body);
            expect((await withoutToken).status).toBe(401);
            const wrongRole = request(app)[route.method](route.path).set('Authorization', `Bearer ${learner.token}`).send(route.body);
            expect((await wrongRole).status).toBe(403);
        }
    });

    it('contains no DELETE statement in the LIN-22 production source', () => {
        const files = [
            'src/routes/api/routes.api/adminUserRoutes/methods/adminUserService.ts',
            'src/routes/api/routes.api/adminUserRoutes/methods/adminParentLinkService.ts',
            'src/routes/api/routes.api/adminUserRoutes/adminUserRoutes.ts',
            'src/routes/api/routes.api/adminUserRoutes/adminParentLinkRoutes.ts',
        ];
        const source = files.map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n');
        expect(source).not.toMatch(/\bDELETE\b/i);
    });
});
