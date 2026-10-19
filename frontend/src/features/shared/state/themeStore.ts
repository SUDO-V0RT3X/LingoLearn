import { defineStore } from 'pinia';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import type { PublicUser } from '@/features/auth_feature/state/authStore';

export type Audience = 'general' | 'child';

//Applies the audience's theme to the whole page: <html data-theme="child">
//switches every token in assets/main.css to the child palette.
function applyTheme(audience: Audience): void {
    if (audience === 'child') document.documentElement.dataset.theme = 'child';
    else delete document.documentElement.dataset.theme;
}

/**
 * Which theme the app is in. Only a learner the server confirms as a child
 * (under 13, so their content audience is "child") gets the child theme;
 * everyone else, including signed-out visitors and staff, gets the default.
 */
export const themeStore = defineStore('theme', {
    state: () => ({
        audience: 'general' as Audience,
        //The user the audience was worked out for, so it is fetched once per sign-in.
        resolvedForUserId: null as number | null,
    }),
    getters: {
        isChild: (state): boolean => state.audience === 'child',
    },
    actions: {
        setAudience(audience: Audience) {
            this.audience = audience;
            applyTheme(audience);
        },
        //Works out the theme for whoever is signed in now.
        async refreshFor(user: PublicUser | null) {
            if (!user || user.role !== 'learner') {
                this.resolvedForUserId = null;
                this.setAudience('general');
                return;
            }
            if (this.resolvedForUserId === user.id) return;
            const response = await OnboardingDataSource.getAccess();
            this.resolvedForUserId = user.id;
            this.setAudience(response.data?.contentAudience === 'child' ? 'child' : 'general');
        },
        //Forgets the cached audience, so the next refresh asks the server again.
        //Used after a learner changes their date of birth.
        invalidate() {
            this.resolvedForUserId = null;
        },
    },
});
