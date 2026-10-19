// Small helpers shared by unit tests.
import type { AuthedUser } from '../../src/routes/api/routes.api/authRoutes/authApplyAllRoute.js';

export function makeUser(id: number, role: AuthedUser['role'] = 'author'): AuthedUser {
    return { id, role };
}
