// Small query-parameter coercion helpers; per-resource parse* functions build
// on these and throw on bad input.
export function parseOptionalString(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
}
export function parseOptionalInt(v: unknown): number | undefined {
    if (typeof v !== 'string' || v === '') return undefined;
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) throw new Error(`expected integer, got '${v}'`);
    return n;
}
export function parseIdList(v: unknown): number[] | undefined {
    const s = parseOptionalString(v);
    if (s === undefined) return undefined;
    return s.split(',').map(x => {
        const n = Number.parseInt(x, 10);
        if (Number.isNaN(n)) throw new Error(`bad id in list: '${x}'`);
        return n;
    });
}
