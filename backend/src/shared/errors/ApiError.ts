// Secure error handling (hard requirement): errors carry an HTTP status and a
// safe message; the error middleware in server.ts maps them. Anything that is
// not an ApiError becomes an opaque 500 — internals never leak to the client.
export type ValidationIssue = { field: string; message: string };

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public issues: ValidationIssue[] = [],
    ) { super(message); }
}
