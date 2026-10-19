import { defineStore } from 'pinia';
import { ProgressDataSource } from '../../../../datasources/progressDataSource';
import type { ChallengeAnswer, ChallengeOutcome, ChallengeQuestion } from '../../../../models/ProgressTypes';
import type { Exception } from '@/core/exceptions/models/ExceptionType';
import { ChallengeDisplay } from '../../../../functions/challengeDisplay';

//Where the play screen is:
//  loading    asking the server to start (or resume) the challenge
//  blocked    the server refused to start it (not eligible, or not ready yet)
//  failed     the challenge could not be loaded at all
//  playing    one question at a time
//  submitting the answers are on their way to be marked
//  result     the server's marking is back
export type PlayPhase = 'loading' | 'blocked' | 'failed' | 'playing' | 'submitting' | 'result';

//state for the take-the-challenge screen, separate from challengeIntroStore.
//The questions arrive without their answers; the learner's picks go back to
//the server, which does all the marking.
export const challengePlayStore = defineStore('challengePlayStore', {
    state: () => ({
        phase: 'loading' as PlayPhase,
        challengeId: null as number | null,
        targetLevel: null as number | null,
        questions: [] as ChallengeQuestion[],
        answers: [] as ChallengeAnswer[],
        //The question on screen. Only ever moves forward.
        index: 0,
        resumed: false,
        //The question a resumed challenge picked up at (0 for a new one).
        resumedAt: 0,
        outcome: null as ChallengeOutcome | null,
        //Why the challenge could not start, or why the last submit failed.
        error: null as Exception | null,
    }),
    getters: {
        current(state): ChallengeQuestion | null {
            return state.questions[state.index] ?? null;
        },
        isLast(state): boolean {
            return state.index >= state.questions.length - 1;
        },
        currentAnswered(state): boolean {
            return ChallengeDisplay.isAnswered(state.answers[state.index]);
        },
        answeredCount(state): number {
            return state.answers.filter(answer => ChallengeDisplay.isAnswered(answer)).length;
        },
        //How far through the questions the learner is, counting the one on screen as done once answered.
        progressPercent(state): number {
            const done = state.index + (ChallengeDisplay.isAnswered(state.answers[state.index]) ? 1 : 0);
            return ChallengeDisplay.percent(done, state.questions.length);
        },
    },
    actions: {
        //LIN-47: starts the challenge on the server (or picks up the one already started)
        async start() {
            this.$reset();
            this.phase = 'loading';
            const response = await ProgressDataSource.startChallenge();
            if (response.error || !response.data) {
                this.error = response.error;
                // 403: not eligible now. 409: not enough questions yet. Both are
                // answers, not faults, so they get their own screen.
                const status = response.error?.statusCode;
                this.phase = status === 403 || status === 409 ? 'blocked' : 'failed';
                return;
            }
            if (response.data.questions.length === 0) {
                this.phase = 'failed';
                return;
            }
            this.challengeId = response.data.challengeId;
            this.targetLevel = response.data.targetLevel;
            this.questions = response.data.questions;
            //A resumed challenge comes back with the answers to the questions
            //already moved past, so it carries on at the next one.
            const saved = response.data.answers ?? [];
            this.answers = response.data.questions.map((_, position) => saved[position] ?? null);
            this.index = Math.min(saved.length, response.data.questions.length - 1);
            this.resumedAt = this.index;
            this.resumed = response.data.resumed;
            this.phase = 'playing';
        },

        setAnswer(answer: ChallengeAnswer) {
            if (this.phase !== 'playing') return;
            this.answers[this.index] = answer;
        },

        //Forward only: there is no going back to change an answer. The answers
        //moved past are saved on the server as the learner goes, so leaving and
        //resuming carries on from here. A failed save is not shown: the
        //final submit sends every answer anyway.
        async next() {
            if (this.phase !== 'playing') return;
            if (this.isLast) {
                await this.submit();
                return;
            }
            this.index += 1;
            if (this.challengeId != null) {
                void ProgressDataSource.saveChallengeAnswers(this.challengeId, this.answers.slice(0, this.index));
            }
        },

        //LIN-48: sends the answers; the reply is the server's marking
        async submit() {
            if (this.challengeId == null || this.phase === 'submitting' || this.phase === 'result') return;
            this.phase = 'submitting';
            this.error = null;
            const response = await ProgressDataSource.submitChallenge(
                this.challengeId,
                ChallengeDisplay.forSubmission(this.answers, this.questions.length),
            );
            if (response.error || !response.data) {
                // Kept on the last question with every answer intact, to try again.
                this.error = response.error;
                this.phase = 'playing';
                return;
            }
            this.outcome = response.data;
            this.phase = 'result';
        },
    },
});
