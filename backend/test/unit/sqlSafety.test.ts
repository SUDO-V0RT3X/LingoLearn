// SQL injection protection, checked on the source: every value from a request
// reaches Postgres as a bound parameter ($1, $2, ...), never as SQL text. The only
// pieces of SQL text built in code are fixed column lists, placeholder numbers and
// a constant table name, listed below. Adding anything else fails this test until
// someone has checked it can't carry user input.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '../../src');

//Interpolations allowed inside SQL text, each checked by hand to be constant or
//built only from "$n" placeholders.
const ALLOWED = new Set([
    'SUMMARY_COLUMNS', 'SUMMARY_FROM',            // contentMethods: fixed column list and FROM clause
    'USER_COLUMNS', 'USER_COLUMNS_PREFIXED',      // parentLinkMethods: fixed column lists
    'PUBLIC_COLUMNS', 'where',                    // adminUserService: fixed columns; WHERE of "$n" clauses
    'values.length + 1', 'values.length + 2',     // adminUserService: LIMIT/OFFSET placeholder numbers
    "fields.join(', ')", 'idx',                   // taxonomyMethods: "column = $n" pairs from a fixed list
    'tableName', "values.join(', ')",             // placementMethods: constant table name; "($n, ...)" rows
]);

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
    });
}

//Every ${...} inside the SQL template of a .query(`...`) call.
function interpolationsInQueries(source: string): string[] {
    const found: string[] = [];
    for (const call of source.matchAll(/\.query(?:<[^>]*>)?\(\s*`([^`]*)`/gs)) {
        for (const value of call[1].matchAll(/\$\{([^}]*)\}/g)) found.push(value[1].trim());
    }
    return found;
}

describe('SQL is never built from request values', () => {
    const files = sourceFiles(SRC);

    it('nominal: the scan finds the backend source', () => {
        expect(files.length).toBeGreaterThan(20);
    });

    it('every interpolation in a SQL string is on the checked list', () => {
        const unexpected = files.flatMap((file) =>
            interpolationsInQueries(readFileSync(file, 'utf8'))
                .filter((value) => !ALLOWED.has(value))
                .map((value) => `${file.replace(SRC, 'src')}: \${${value}}`));
        expect(unexpected).toEqual([]);
    });

    it('invalid: the scan does catch a value pasted into SQL', () => {
        expect(interpolationsInQueries('pool.query(`SELECT * FROM users WHERE name = \'${req.body.name}\'`)'))
            .toEqual(['req.body.name']);
    });
});
