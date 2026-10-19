import { defineStore } from 'pinia';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource';
import { ContentBlockTypes, QUESTION_BLOCK_TYPES, type $ContentBlock } from '@/features/shared/models/contentType';
import { TestAttemptDataSource } from '@/features/learner_experience/datasources/learnerDataSource';
import type { $TestAnswer, $TestResult } from '@/features/learner_experience/models/learnerTypes';
import { progressPercent } from '@/features/learner_experience/functions/learnerCopy';

//What an unanswered question holds: nothing picked yet, or an empty gap.
function blankAnswerFor(block: $ContentBlock): $TestAnswer {
    return block.itemType === ContentBlockTypes.fillBlank ? '' : null;
}

//Whether the learner has given an answer they can move on from.
export function isAnswered(answer: $TestAnswer): boolean {
    if (typeof answer === 'string') return answer.trim() !== '';
    return answer !== null;
}

//The forward-only test: one question at a time, in reading order, with no way
//back. Answers are only marked by the server, after the last question.
export const testRunnerStore = defineStore('testRunnerStore', {
    state: () => ({
        contentId: null as number | null,
        title: '',
        level: null as number | null,
        //The question blocks, answers already taken out by the server.
        questions: [] as $ContentBlock[],
        //One per question, in the same order the server marks them.
        answers: [] as $TestAnswer[],
        //The question on screen. Only ever moves forward.
        index: 0,
        isLoading: false,
        hasLoaded: false,
        loadError: null as Exception | null,
        isSubmitting: false,
        submitError: null as Exception | null,
        result: null as $TestResult | null,
    }),

    getters: {
        currentQuestion(state): $ContentBlock | null {
            return state.questions[state.index] ?? null;
        },
        isLastQuestion(state): boolean {
            return state.index >= state.questions.length - 1;
        },
        currentAnswered(state): boolean {
            return isAnswered(state.answers[state.index] ?? null);
        },
        //Questions done so far, for the progress bar.
        progress(state): number {
            return progressPercent(state.index, state.questions.length);
        },
    },

    actions: {
        //Loads the content and picks out its questions. The content must be
        //approved; the server refuses anything the learner may not open.
        async load(contentId: number): Promise<void> {
            this.$reset();
            this.contentId = contentId;
            this.isLoading = true;

            const response = await ContentDataSource.getContent(contentId);
            this.isLoading = false;
            this.hasLoaded = true;

            if (response.error != null || response.data == null) {
                this.loadError = response.error;
                return;
            }
            if (response.data.status !== 'approved') {
                this.loadError = new Exception({
                    exceptionType: ExceptionType.FORBIDDEN,
                    message: 'This content is not available.',
                    statusCode: 403,
                });
                return;
            }

            this.title = response.data.title;
            this.level = response.data.level;
            this.questions = response.data.content.flat()
                .filter((block) => QUESTION_BLOCK_TYPES.includes(block.itemType));
            this.answers = this.questions.map(blankAnswerFor);
        },

        //Records the answer to the question on screen.
        setAnswer(answer: $TestAnswer): void {
            if (this.result != null) return;
            this.answers[this.index] = answer;
        },

        //Moves to the next question once this one is answered. There is no going back.
        next(): void {
            if (!this.currentAnswered || this.isLastQuestion) return;
            this.index += 1;
        },

        //Sends every answer to be marked. An empty gap goes as no answer.
        async submit(): Promise<void> {
            if (this.contentId == null || this.isSubmitting || this.result != null) return;
            if (!this.isLastQuestion || !this.currentAnswered) return;

            this.isSubmitting = true;
            this.submitError = null;
            const answers = this.answers.map((answer) =>
                typeof answer === 'string' ? (answer.trim() === '' ? null : answer.trim()) : answer);

            const response = await TestAttemptDataSource.submit(this.contentId, answers);
            this.isSubmitting = false;

            if (response.error != null || response.data == null) {
                this.submitError = response.error;
                return;
            }
            this.result = response.data;
        },

        //Starts the same test again from the first question.
        retry(): void {
            this.answers = this.questions.map(blankAnswerFor);
            this.index = 0;
            this.result = null;
            this.submitError = null;
        },
    },
});
