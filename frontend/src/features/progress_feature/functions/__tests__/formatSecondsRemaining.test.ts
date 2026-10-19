import { describe, it, expect } from 'vitest';
import { SecondsRemainingFormatter } from '../formatSecondsRemaining';

describe('SecondsRemainingFormatter (LIN-47)', () => {
    it('formats a duration under a minute as seconds only', () => {
        expect(SecondsRemainingFormatter.format(25)).toBe('25s');
    });

    it('formats a duration under an hour as minutes and seconds', () => {
        expect(SecondsRemainingFormatter.format(1500)).toBe('25m 0s');
    });

    it('formats a duration over an hour as hours, minutes, and seconds', () => {
        expect(SecondsRemainingFormatter.format(14700)).toBe('4h 5m 0s');
    });

    it('formats zero seconds as 0s', () => {
        expect(SecondsRemainingFormatter.format(0)).toBe('0s');
    });
});
describe('SecondsRemainingFormatter in isiZulu', () => {
    it('labels each part of the countdown in isiZulu', async () => {
        const { i18n } = await import('@/i18n');
        i18n.global.locale.value = 'zulu';
        expect(SecondsRemainingFormatter.format(14700)).toBe('Amahora: 4 · Imizuzu: 5 · Imizuzwana: 0');
        expect(SecondsRemainingFormatter.format(25)).toBe('Imizuzwana: 25');
    });
});
