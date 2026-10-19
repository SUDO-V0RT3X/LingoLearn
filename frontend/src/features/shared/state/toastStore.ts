import { defineStore } from 'pinia';

//How long a confirmation stays on screen before it goes by itself.
export const TOAST_DURATION_MS = 4000;

let hideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * A short confirmation shown by the app shell, for example "Settings saved"
 * after a screen has already moved the user on. It holds a translation key, not
 * text, so it follows a language switch while it is showing.
 */
export const toastStore = defineStore('toast', {
    state: () => ({
        messageKey: null as string | null,
    }),
    actions: {
        show(messageKey: string) {
            this.messageKey = messageKey;
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => this.dismiss(), TOAST_DURATION_MS);
        },
        dismiss() {
            this.messageKey = null;
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = null;
        },
    },
});
