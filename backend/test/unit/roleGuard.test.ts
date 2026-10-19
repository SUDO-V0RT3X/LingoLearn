// Design-document unit tests 12–17 (RoleGuard) — permission category. The
// guard is plain middleware, so it unit-tests with stub req/res objects.
import { describe, it, expect, vi } from 'vitest';
import { RoleGuard } from '../../src/shared/roleGuard.js';
import { makeUser } from '../helpers/fakes.js';

function run(mw: ReturnType<typeof RoleGuard.requireRole>, user?: ReturnType<typeof makeUser>) {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    const res = { locals: user ? { user } : {}, status, json } as never;
    mw({} as never, res, next);
    return { status, next };
}

describe('RoleGuard.requireRole', () => {
    it('test 12 — permission: learner on POST /content gets 403', () => {
        const { status, next } = run(RoleGuard.requireRole('author'), makeUser(1, 'learner'));
        expect(status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
    it('test 13 — nominal: author on POST /content proceeds to the handler', () => {
        const { next } = run(RoleGuard.requireRole('author'), makeUser(1, 'author'));
        expect(next).toHaveBeenCalledOnce();
    });
    it('test 14 — permission: taxonomy belongs to the administrator alone', () => {
        const { status } = run(RoleGuard.requireRole('administrator'), makeUser(1, 'moderator'));
        expect(status).toHaveBeenCalledWith(403);
    });
    it('test 15 — permission: an author cannot moderate', () => {
        const { status } = run(RoleGuard.requireRole('moderator', 'administrator'), makeUser(1, 'author'));
        expect(status).toHaveBeenCalledWith(403);
    });
    it('tests 16/17 — no identity (missing/expired credential) is 401, handler never reached', () => {
        const { status, next } = run(RoleGuard.requireRole('author'));
        expect(status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
