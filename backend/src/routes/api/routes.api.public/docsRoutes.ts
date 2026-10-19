// OpenAPI docs (hard requirement): swagger-ui at /api/docs, spec from
// openapi.yaml at the backend root. Each slice adds its paths to that file.
import type { Express } from 'express';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

const specPath = resolve(process.cwd(), 'openapi.yaml');

/**
 * Mounts the generated OpenAPI documentation for this standalone backend. The
 * spec is loaded from the backend root at startup so each feature slice can add
 * its own paths to openapi.yaml without changing the route registration code.
 */
export function apply_docs_routes(app: Express) {
    const spec = parse(readFileSync(specPath, 'utf8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
