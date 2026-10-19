// Creates the staff accounts nobody can sign up as: author, moderator and
// administrator. Run once per database: npm run seed:staff
// Passwords come from the environment, or fall back to a local dev password.
import 'dotenv/config';
import { pool } from '../src/config/db/db_init.js';
import { AccountMethods } from '../src/routes/api/routes.api/authRoutes/methods/accountMethods.js';
import type { UserRole } from '../src/routes/api/routes.api/authRoutes/types/authType.js';

const password = process.env.SEED_STAFF_PASSWORD ?? '123456789';

const staff: Array<{ role: UserRole; firstName: string; lastName: string; email: string }> = [
    { role: 'author', firstName: 'One', lastName: 'Author', email: 'one@author.test' },
    { role: 'moderator', firstName: 'One', lastName: 'Moderator', email: 'one@moderator.test' },
    { role: 'administrator', firstName: 'One', lastName: 'Admin', email: 'one@admin.test' },
];

async function seed() {
    for (const account of staff) {
        const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [account.email]);
        if (rowCount && rowCount > 0) {
            console.log(`· ${account.email} already exists`);
            continue;
        }

        await AccountMethods.createAccount({ ...account, username: null, password });
        console.log(`✓ ${account.role}: ${account.email}`);
    }

    console.log(`\nPassword for all three: ${password}`);
    await pool.end();
}

seed().catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
});
