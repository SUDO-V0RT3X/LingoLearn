import { defineStore } from 'pinia';
import type { Exception } from '@/core/exceptions/models/ExceptionType';
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource';
import type { $MyLearning } from '@/features/learner_experience/models/learnerTypes';
import { progressPercent } from '@/features/learner_experience/functions/learnerCopy';

//The learner's own summary: level, progress toward the level-up challenge,
//statistics, history and what they are part-way through reading. Read by
//My Learning and by Explore (for the level filter and "Continue reading").
export const myLearningStore = defineStore('myLearningStore', {
    state: () => ({
        summary: null as $MyLearning | null,
        isLoading: false,
        error: null as Exception | null,
    }),

    getters: {
        //How far the learner is toward the level-up challenge, 0 to 100.
        challengeProgress(state): number {
            if (state.summary == null) return 0;
            return progressPercent(state.summary.testsPassedAtLevel, state.summary.testsRequired);
        },
        //Distinct tests still to pass before the challenge opens.
        testsToGo(state): number {
            if (state.summary == null) return 0;
            return Math.max(0, state.summary.testsRequired - state.summary.testsPassedAtLevel);
        },
    },

    actions: {
        //Loads the summary from the server. Keeps the last good one on failure,
        //so a screen that already showed it does not go blank.
        async load(): Promise<void> {
            this.isLoading = true;
            this.error = null;

            const response = await TestAttemptDataSource.getMyLearning();
            this.isLoading = false;

            if (response.error != null || response.data == null) {
                this.error = response.error;
                return;
            }

            this.summary = response.data;
        },
    },
});
