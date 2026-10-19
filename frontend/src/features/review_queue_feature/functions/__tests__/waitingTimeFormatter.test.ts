import { describe, it, expect } from 'vitest';
import { WaitingTimeFormatter } from '../waitingTimeFormatter';

describe('WaitingTimeFormatter (LIN-38)', () => {
    const now = new Date('2026-09-12T12:00:00Z').getTime();

    it('formats a timestamp from 3 days ago as "3 d"', () => {
        const iso = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
        expect(WaitingTimeFormatter.format(iso, now)).toBe('3 d');
    });

    it('formats a timestamp from 6 hours ago as "6 h" (under a day)', () => {
        const iso = new Date(now - 6 * 60 * 60 * 1000).toISOString();
        expect(WaitingTimeFormatter.format(iso, now)).toBe('6 h');
    });

    it('formats a timestamp from 40 minutes ago as "40 m" (under an hour)', () => {
        const iso = new Date(now - 40 * 60 * 1000).toISOString();
        expect(WaitingTimeFormatter.format(iso, now)).toBe('40 m');
    });

    it('rounds down rather than up (23h59m is still "0 d", falls through to hours)', () => {
        const iso = new Date(now - (23 * 60 * 60 * 1000 + 59 * 60 * 1000)).toISOString();
        expect(WaitingTimeFormatter.format(iso, now)).toBe('23 h');
    });
});

describe('WaitingTimeFormatter in isiZulu', () => {
    const now = new Date('2026-09-12T12:00:00Z').getTime();

    it('names days, hours and minutes in isiZulu, with one of each in the singular', async () => {
        const { i18n } = await import('@/i18n');
        i18n.global.locale.value = 'zulu';
        expect(WaitingTimeFormatter.format(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('izinsuku ezingu-3');
        expect(WaitingTimeFormatter.format(new Date(now - 86_400_000).toISOString(), now)).toBe('usuku olulodwa');
        expect(WaitingTimeFormatter.format(new Date(now - 6 * 3_600_000).toISOString(), now)).toBe('amahora angu-6');
        expect(WaitingTimeFormatter.format(new Date(now - 40 * 60_000).toISOString(), now)).toBe('imizuzu engu-40');
    });
});
