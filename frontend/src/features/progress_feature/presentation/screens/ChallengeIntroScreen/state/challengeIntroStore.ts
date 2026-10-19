import { defineStore } from 'pinia';
import { ProgressDataSource } from '../../../../datasources/progressDataSource';
import type { EligibilityReport } from '../../../../models/ProgressTypes';
import type { Exception } from '@/core/exceptions/models/ExceptionType';

//state for the intro screen: where the learner stands and whether they may start.
//The server works all of it out; this only holds what it said.
export const challengeIntroStore = defineStore('challengeIntroStore', {
    state: () => ({
        report: null as EligibilityReport | null,
        isLoading: false,
        error: null as Exception | null,
    }),
    actions: {
        async load() {
            this.isLoading = true;
            this.error = null;
            const response = await ProgressDataSource.checkEligibility();
            if (response.error || !response.data) {
                this.error = response.error;
                this.report = null;
            } else {
                this.report = response.data;
            }
            this.isLoading = false;
        },
    },
});
