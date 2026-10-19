import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        // Integration files share one database, so run test FILES one at a time.
        // `npm test` runs unit only; `npm run test:integration` needs a DB.
        fileParallelism: false,
        // Password hashing is scrypt, which is deliberately slow, and a test that
        // signs several accounts in can pass 5s on a loaded machine.
        testTimeout: 20000,
    },
});
