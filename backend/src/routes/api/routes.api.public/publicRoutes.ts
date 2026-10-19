// No-auth routes. Convention: everything public lives under /api/public/* so the
// frontend HttpService knows not to attach auth headers.
import type { Express } from 'express';

export function apply_public_api_routes(app: Express) {
    app.get('/api/public/ping', (_req, res) => res.json({ pong: true }));
}
