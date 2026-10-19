import { i18n } from '@/i18n';

// The browser's own form checks (required, minlength, type="email", min/max)
// speak the browser's language, not the interface's: an isiZulu screen would say
// "Please fill in this field." These two handlers keep the browser's checks and
// bubbles but give them our wording, in the interface language.
//
// Use on a <form>:
//   @invalid.capture="localizeValidity" @input="clearValidity" @change="clearValidity"
// A field with a pattern can say what it allows: :data-pattern-message="t('…')".

//Typed loosely on purpose: the full message schema is too deep for the
//compiler to instantiate from a plain .ts file.
type Translate = (key: string, values?: Record<string, unknown>) => string;
const t: Translate = (key, values = {}) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values);

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isField(target: EventTarget | null): target is Field {
    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}

/** What is wrong with a field, in the interface language. */
export function validityMessage(field: Field): string {
    const validity = field.validity;
    const type = field instanceof HTMLInputElement ? field.type : '';
    if (validity.valueMissing) {
        if (type === 'radio' || field instanceof HTMLSelectElement) return t('common.validation.choose');
        return t('common.validation.required');
    }
    if (validity.typeMismatch && type === 'email') return t('common.validation.email');
    if (validity.tooShort && field instanceof HTMLInputElement) return t('common.validation.tooShort', { min: field.minLength });
    if (validity.tooLong && field instanceof HTMLInputElement) return t('common.validation.tooLong', { max: field.maxLength });
    if (type === 'date' && (validity.rangeUnderflow || validity.rangeOverflow || validity.badInput)) {
        return t('common.validation.date');
    }
    if (validity.rangeUnderflow || validity.rangeOverflow) {
        const input = field as HTMLInputElement;
        return t('common.validation.range', { min: input.min, max: input.max });
    }
    if (validity.badInput || validity.stepMismatch) return t('common.validation.number');
    // A field with a pattern says what it allows, already in the interface language.
    if (validity.patternMismatch && field.dataset.patternMessage) return field.dataset.patternMessage;
    return t('common.validation.invalid');
}

/** On a field's `invalid` event: replaces the browser's message with ours. */
export function localizeValidity(event: Event): void {
    const field = event.target;
    if (!isField(field)) return;
    // Clear our own message first, so the browser's checks decide afresh.
    field.setCustomValidity('');
    if (field.validity.valid) return;
    field.setCustomValidity(validityMessage(field));
}

/**
 * On input or change: forgets every message set above in the same form, so a
 * corrected field (or another radio in a group) is judged again on the next
 * submit instead of staying stuck on the old message.
 */
export function clearValidity(event: Event): void {
    const target = event.target;
    const form = target instanceof Element ? target.closest('form') : null;
    const fields = form ? Array.from(form.elements) : [target];
    for (const field of fields) {
        if (isField(field)) field.setCustomValidity('');
    }
}
