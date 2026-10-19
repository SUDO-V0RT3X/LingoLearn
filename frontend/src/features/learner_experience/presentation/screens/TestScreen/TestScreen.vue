<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ContentBlockTypes, isBlockOfType } from '@/features/shared/models/contentType'
import { isAnswered, testRunnerStore } from '@/features/learner_experience/presentation/state/testRunnerStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { friendlyError, levelLabel } from '@/features/learner_experience/functions/learnerCopy'
import MultipleChoiceQuestion from '@/features/shared/presentation/blocks/MultipleChoiceQuestion.vue'
import FillBlankQuestion from '@/features/shared/presentation/blocks/FillBlankQuestion.vue'
import ListenChooseQuestion from '@/features/shared/presentation/blocks/ListenChooseQuestion.vue'
import TestResults from '@/features/learner_experience/presentation/components/TestResults.vue'
import LeaveGuardDialog from '@/features/shared/presentation/leaveGuard/LeaveGuardDialog.vue'
import { useLeaveGuard } from '@/features/shared/presentation/leaveGuard/useLeaveGuard'

//The forward-only test: one question at a time, "Next" only, then the
//server marks every answer at once and the results replace the questions.
const store = testRunnerStore()
const theme = themeStore()
const route = useRoute()
const { t } = useI18n()
const { questions, index, isLoading, loadError, isSubmitting, submitError, result } = storeToRefs(store)

//The route pattern is digits only, so this always parses.
function routeContentId(): number {
    return Number(route.params.contentId)
}

//The answer to the question on screen, typed for each kind of question.
const choiceAnswer = computed<number | null>({
    get: () => {
        const answer = store.answers[store.index]
        return typeof answer === 'number' ? answer : null
    },
    set: (value) => store.setAnswer(value),
})
const typedAnswer = computed<string>({
    get: () => {
        const answer = store.answers[store.index]
        return typeof answer === 'string' ? answer : ''
    },
    set: (value) => store.setAnswer(value),
})

//The question on screen, narrowed to its kind so each component gets its own value.
const choiceBlock = computed(() => {
    const block = store.currentQuestion ?? undefined
    return isBlockOfType(block, ContentBlockTypes.multipleChoice) ? block : null
})
const listenBlock = computed(() => {
    const block = store.currentQuestion ?? undefined
    return isBlockOfType(block, ContentBlockTypes.listenChoose) ? block : null
})
const gapBlock = computed(() => {
    const block = store.currentQuestion ?? undefined
    return isBlockOfType(block, ContentBlockTypes.fillBlank) ? block : null
})

//Enter, or the button: the next question, or marking after the last one.
async function advance(): Promise<void> {
    if (!store.currentAnswered || isSubmitting.value) return
    if (store.isLastQuestion) await store.submit()
    else store.next()
}

//A test part-way through, answers unsent: leaving would lose them, and coming
//back starts again at question 1, so leaving asks first. Not before the first
//answer (nothing to lose), and not once the results are showing.
const { asking: askingToLeave, stay: stayHere, leave: leaveAnyway } = useLeaveGuard(() =>
    questions.value.length > 0 && result.value == null && loadError.value == null
    && (index.value > 0 || store.answers.some(isAnswered)))

onMounted(() => store.load(routeContentId()))
watch(() => route.params.contentId, () => store.load(routeContentId()))

</script>

<template>
  <main class="ui-page ui-page--narrow test-screen" :class="{ 'test-screen--child': theme.isChild }">
    <div v-if="isLoading" class="ui-card test-screen__state" role="status">
      <span class="ui-spinner" aria-hidden="true" />
      <span>{{ theme.isChild ? t('learner.test.loadingChild') : t('learner.test.loading') }}</span>
    </div>

    <div v-else-if="loadError" class="ui-card ui-empty" data-testid="test-error">
      <h1 class="ui-empty__title">{{ loadError.statusCode === 403 ? t('learner.test.cantTakeYet') : t('learner.test.didntLoad') }}</h1>
      <p>{{ friendlyError(loadError) }}</p>
      <div class="ui-row test-screen__center">
        <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('learner.reader.backToExplore') }}</RouterLink>
        <button v-if="loadError.statusCode !== 403" type="button" class="ui-btn" @click="store.load(routeContentId())">{{ t('common.states.retry') }}</button>
      </div>
    </div>

    <TestResults
      v-else-if="result"
      :result="result"
      :title="store.title"
      :is-child="theme.isChild"
      @retry="store.retry()"
    />

    <div v-else-if="questions.length === 0" class="ui-card ui-empty" data-testid="no-questions">
      <h1 class="ui-empty__title">{{ t('learner.test.noTestTitle') }}</h1>
      <p>{{ t('learner.test.noTestBody') }}</p>
      <div class="ui-row test-screen__center">
        <RouterLink :to="{ name: 'reader', params: { contentId: String(routeContentId()) } }" class="ui-btn">{{ t('learner.test.backToReading') }}</RouterLink>
        <RouterLink :to="{ name: 'explore' }" class="ui-btn ui-btn--primary">{{ t('common.nav.explore') }}</RouterLink>
      </div>
    </div>

    <template v-else>
      <header class="test-screen__head">
        <p class="ui-eyebrow">{{ theme.isChild ? t('learner.test.eyebrowChild') : t('learner.card.test') }} · {{ levelLabel(store.level) }}</p>
        <h1 class="ui-title test-screen__title">{{ store.title }}</h1>
        <div class="test-screen__progress-row">
          <span class="test-screen__count" data-testid="question-count">{{ t('learner.test.questionCount', { current: index + 1, total: questions.length }) }}</span>
          <span class="ui-progress test-screen__progress" role="progressbar" :aria-valuenow="store.progress" aria-valuemin="0" aria-valuemax="100">
            <span class="ui-progress__bar" :style="{ width: `${store.progress}%` }" />
          </span>
        </div>
      </header>

      <form class="ui-card test-screen__card" @submit.prevent="advance">
        <Transition name="question" mode="out-in">
          <div :key="index" class="test-screen__question" data-testid="question">
            <MultipleChoiceQuestion v-if="choiceBlock" v-model:answer="choiceAnswer" :value="choiceBlock.value" />
            <ListenChooseQuestion v-else-if="listenBlock" v-model:answer="choiceAnswer" :value="listenBlock.value" :allow-transcript="false" />
            <FillBlankQuestion v-else-if="gapBlock" v-model:answer="typedAnswer" :value="gapBlock.value" />
          </div>
        </Transition>

        <div v-if="submitError" class="ui-alert ui-alert--error" role="alert" data-testid="submit-error">
          {{ t('learner.test.submitError', { error: friendlyError(submitError) }) }}
        </div>

        <div class="test-screen__footer">
          <p class="test-screen__note">
            {{ theme.isChild ? t('learner.test.noGoingBackChild') : t('learner.test.noGoingBack') }}
          </p>
          <button
            v-if="!store.isLastQuestion"
            type="submit"
            class="ui-btn ui-btn--primary ui-btn--lg"
            :disabled="!store.currentAnswered"
            data-testid="next"
          >{{ t('common.states.next') }} &rsaquo;</button>
          <button
            v-else
            type="submit"
            class="ui-btn ui-btn--accent ui-btn--lg"
            :disabled="!store.currentAnswered || isSubmitting"
            data-testid="submit"
          >
            <span v-if="isSubmitting" class="ui-spinner test-screen__btn-spinner" aria-hidden="true" />
            {{ isSubmitting ? t('learner.test.marking') : (submitError ? t('learner.test.sendAgain') : t('learner.test.finish')) }}
          </button>
        </div>
      </form>
    </template>

    <LeaveGuardDialog
      v-if="askingToLeave"
      :title="t('learner.test.leaveTitle')"
      :body="t('learner.test.leaveBody')"
      :stay-label="t('learner.test.leaveStay')"
      :leave-label="t('learner.test.leaveGo')"
      @stay="stayHere"
      @leave="leaveAnyway"
    />
  </main>
</template>

<style scoped>
.test-screen__state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--ink-2);
}
.test-screen__center {
  justify-content: center;
  margin-top: var(--space-4);
}
.test-screen__head {
  margin-bottom: var(--space-4);
}
.test-screen__title {
  font-size: var(--text-2xl);
}
.test-screen__progress-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.test-screen__count {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}
.test-screen__progress {
  flex: 1;
  display: block;
}
.test-screen__progress .ui-progress__bar {
  display: block;
}
.test-screen__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}
.test-screen__question :deep(.question-block) {
  margin: 0;
  border: none;
  padding: 0;
}
.test-screen__question :deep(.question-block__prompt),
.test-screen__question :deep(.question-block__sentence) {
  font-size: var(--text-lg);
}
.test-screen__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--rule);
}
.test-screen__note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-3);
}
.test-screen__btn-spinner {
  width: 16px;
  height: 16px;
  border-width: 2px;
}
.test-screen--child .test-screen__card {
  border: 3px solid var(--tone-4);
}

.question-enter-active,
.question-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.question-leave-to { transform: translateX(-20px); opacity: 0; }
.question-enter-from { transform: translateX(20px); opacity: 0; }

@media (max-width: 640px) {
  .test-screen__card {
    padding: var(--space-4);
  }
}
</style>
