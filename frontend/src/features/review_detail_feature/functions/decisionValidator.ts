// The check that a rejection carries a reason before it can be confirmed.
// There is no separate "request changes": rejecting with a reason is what sends
// the content back to its author, who edits it and submits again.
import { i18n } from '@/i18n';

// vue-i18n's typed t() is too deep for the compiler here; this is the same function.
type Translate = (key: string, values?: Record<string, unknown> | number) => string;
const t: Translate = (key, values) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);

export type Decision = 'approve' | 'reject';

export interface DecisionValidation {
    valid: boolean;
    error?: string;
}

export class DecisionValidator {
    static validate(decision: Decision, reason: string): DecisionValidation {
        if (decision === 'reject') {
            const trimmed = reason.trim();
            if (trimmed === '') {
                return {
                    valid: false,
                    error: t('moderation.decision.reasonRequired'),
                };
            }
            if (trimmed.length < 5 || trimmed.length > 1000) {
                return {
                    valid: false,
                    error: t('moderation.decision.reasonLength'),
                };
            }
        }
        return { valid: true };
    }
}