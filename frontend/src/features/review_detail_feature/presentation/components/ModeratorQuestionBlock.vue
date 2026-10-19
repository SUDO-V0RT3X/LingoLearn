<script setup lang="ts">
//A question block as a moderator checks it: the question exactly as a learner
//will read it, plus what a learner never sees. The right option is marked, every
//spelling a gap accepts is listed, and a listening question shows its
//transcript. Problems that would make the question unmarkable are flagged, so
//they can be sent back before a learner meets them.
import { computed } from 'vue'
import {
  BLANK_MARKER, ContentBlockTypes, isBlockOfType, type $ContentBlock,
} from '@/features/shared/models/contentType'
import { MediaEndpoints } from '@/core/endpoints/feature_endpoints/mediaEndpoints'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ block: $ContentBlock }>()

const { t } = useI18n()

const choice = computed(() => {
  const block = props.block
  if (isBlockOfType(block, ContentBlockTypes.multipleChoice) || isBlockOfType(block, ContentBlockTypes.listenChoose)) {
    return block.value
  }
  return null
})
const questionText = computed(() => (isBlockOfType(props.block, ContentBlockTypes.multipleChoice) ? props.block.value.question : ''))
const gap = computed(() => (isBlockOfType(props.block, ContentBlockTypes.fillBlank) ? props.block.value : null))
const listen = computed(() => (isBlockOfType(props.block, ContentBlockTypes.listenChoose) ? props.block.value : null))

//Each option with whether it is the one marked right.
const options = computed(() => {
  const value = choice.value
  if (!value) return []
  const list = Array.isArray(value.options) ? value.options : []
  return list.map((text, position) => ({
    position,
    text: typeof text === 'string' ? text.trim() : '',
    correct: position === value.correctOption,
  }))
})
const hasValidCorrect = computed(() => options.value.some(option => option.correct && option.text !== ''))

//The gap sentence split around the marker, and the spellings that fill it.
const sentence = computed(() => {
  const text = gap.value?.sentence ?? ''
  const [before, ...rest] = text.split(BLANK_MARKER)
  return { before: before ?? '', after: rest.join(BLANK_MARKER), hasGap: text.includes(BLANK_MARKER) }
})
const accepted = computed(() => (Array.isArray(gap.value?.accepted) ? gap.value.accepted : [])
  .filter((spelling): spelling is string => typeof spelling === 'string' && spelling.trim() !== ''))

const audioSource = computed(() => (listen.value?.fileUrl ? MediaEndpoints.resolveUrl(listen.value.fileUrl) : ''))
//The block type's name in the interface language.
const BLOCK_TYPE_KEYS: Partial<Record<ContentBlockTypes, string>> = {
  [ContentBlockTypes.multipleChoice]: 'common.blockTypes.multipleChoice',
  [ContentBlockTypes.fillBlank]: 'common.blockTypes.fillBlank',
  [ContentBlockTypes.listenChoose]: 'common.blockTypes.listenChoose',
}
const kindLabel = computed(() => {
  const key = BLOCK_TYPE_KEYS[props.block.itemType]
  return key ? t(key) : props.block.itemType
})
const title = computed(() => {
  const value = props.block.value as { title?: unknown }
  return typeof value.title === 'string' ? value.title : ''
})
</script>

<template>
  <div class="mq" data-testid="moderator-question">
    <div class="mq__head">
      <span class="ui-badge ui-badge--info">{{ kindLabel }}</span>
      <span v-if="title" class="mq__title">{{ title }}</span>
    </div>

    <!-- Multiple choice, and listen and choose: the options with the right one marked. -->
    <template v-if="choice">
      <template v-if="listen">
        <audio v-if="audioSource" class="mq__audio" :src="audioSource" controls preload="none"></audio>
        <p v-else class="ui-alert ui-alert--warning">{{ t('moderation.question.noAudio') }}</p>
        <div class="mq__reveal">
          <p class="mq__label">{{ t('moderation.question.transcript') }}</p>
          <p v-if="listen.transcript" class="mq__transcript" data-testid="transcript">{{ listen.transcript }}</p>
          <p v-else class="mq__missing">{{ t('moderation.question.noTranscript') }}</p>
        </div>
      </template>
      <p v-else class="mq__question">{{ questionText || t('moderation.question.noQuestion') }}</p>

      <ul class="mq__options">
        <li
          v-for="option in options"
          :key="option.position"
          class="mq__option"
          :class="{ 'mq__option--correct': option.correct, 'mq__option--empty': option.text === '' }"
          :data-correct="option.correct"
        >
          <span class="mq__marker" aria-hidden="true">
            <svg v-if="option.correct" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="mq__option-text">{{ option.text || t('moderation.question.emptyOption') }}</span>
          <span v-if="option.correct" class="mq__answer-tag">{{ t('moderation.question.correctAnswer') }}</span>
        </li>
      </ul>
      <p v-if="!hasValidCorrect" class="ui-alert ui-alert--warning" role="note">{{ t('moderation.question.noValidCorrect') }}</p>
    </template>

    <!-- Fill in the blank: the sentence with its gap, and every accepted spelling. -->
    <template v-else-if="gap">
      <p class="mq__question">
        {{ sentence.before }}<span class="mq__gap" :aria-label="t('moderation.question.gap')">{{ accepted[0] ?? '' }}</span>{{ sentence.after }}
      </p>
      <p v-if="!sentence.hasGap" class="ui-alert ui-alert--warning" role="note">{{ t('moderation.question.noGapMarker', { marker: BLANK_MARKER }) }}</p>
      <div class="mq__reveal">
        <p class="mq__label">{{ t('moderation.question.acceptedAnswers') }} <span class="mq__hint">{{ t('moderation.question.acceptedHint') }}</span></p>
        <ul v-if="accepted.length" class="mq__spellings">
          <li v-for="spelling in accepted" :key="spelling" class="ui-chip mq__spelling">{{ spelling }}</li>
        </ul>
        <p v-else class="ui-alert ui-alert--warning" role="note">{{ t('moderation.question.noAccepted') }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mq {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  margin: 0 0 var(--space-4);
  border: 1px solid var(--rule);
  border-left: 4px solid var(--info);
  border-radius: var(--radius);
  background: var(--surface);
}

.mq__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.mq__title {
  font-weight: 600;
  color: var(--ink-2);
  font-size: var(--text-sm);
}

.mq__question {
  margin: 0;
  font-size: var(--text-lg);
  line-height: 1.7;
}

.mq__audio { width: 100%; }

.mq__options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mq__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
}

.mq__option--correct {
  border-color: var(--success);
  background: var(--success-soft);
  font-weight: 600;
}

.mq__option--empty .mq__option-text {
  color: var(--ink-3);
  font-style: italic;
  font-weight: 400;
}

.mq__marker {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 50%;
  border: 2px solid var(--rule-strong);
}

.mq__option--correct .mq__marker {
  border-color: var(--success);
  background: var(--success);
  color: var(--on-primary);
}

.mq__marker svg { width: 14px; height: 14px; }

.mq__option-text { flex: 1; min-width: 0; overflow-wrap: anywhere; }

.mq__answer-tag {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--success);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mq__gap {
  display: inline-block;
  min-width: 4em;
  margin: 0 var(--space-1);
  padding: 0 var(--space-2);
  border-bottom: 2px solid var(--success);
  background: var(--success-soft);
  color: var(--success);
  font-weight: 600;
  text-align: center;
}

.mq__reveal {
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.mq__label {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-3);
}

.mq__hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.mq__transcript { margin: 0; line-height: 1.6; }

.mq__missing { margin: 0; color: var(--ink-3); font-style: italic; }

.mq__spellings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.mq__spelling {
  border-color: var(--success);
  color: var(--success);
  font-weight: 600;
  font-size: var(--text-sm);
}
</style>
