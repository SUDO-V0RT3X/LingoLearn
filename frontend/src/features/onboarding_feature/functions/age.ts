/**
 * Whether a 'YYYY-MM-DD' date of birth makes a learner under 13 today, worked
 * out the way the server does (whole years, birthday counted on the day, in UTC).
 * Null when the date is empty or not a real date, so a half-typed date is
 * neither a child nor an adult. The server still decides; this only lets the
 * setup screen warn before a save that would turn child mode on.
 */
export function isUnder13(dateOfBirth: string, today: Date = new Date()): boolean | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const born = new Date(Date.UTC(year, month - 1, day));
    if (born.getUTCFullYear() !== year || born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day) return null;

    let age = today.getUTCFullYear() - year;
    const birthdayHasPassed = today.getUTCMonth() > month - 1
        || (today.getUTCMonth() === month - 1 && today.getUTCDate() >= day);
    if (!birthdayHasPassed) age -= 1;
    return age < 13;
}
