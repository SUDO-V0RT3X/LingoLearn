// The feedback shown after a decision is recorded, in the interface language.
import { i18n } from '@/i18n';

// vue-i18n's typed t() is too deep for the compiler here; this is the same function.
type Translate = (key: string, values?: Record<string, unknown> | number) => string;
const t: Translate = (key, values) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);
import type { Decision } from './decisionValidator';

export class DecisionMessageBuilder {
    static messageFor(decision: Decision): string {
        return decision === 'approve'
            ? t('moderation.decision.approvedMessage')
            : t('moderation.decision.rejectedMessage');
    }
}
