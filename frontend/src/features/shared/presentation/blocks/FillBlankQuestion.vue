<script setup lang="ts">
import { MAX_ANSWER_LENGTH } from '@/core/limits'

//A fill in the blank question as a learner meets it: the sentence with a box
//where the gap is. It never says whether the word is right, because the
//accepted spellings are not sent to a learner. Marking happens on the server.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { BLANK_MARKER, type $LearnerFillBlankValue } from '@/features/shared/models/contentType'

const props = defineProps<{ value: $LearnerFillBlankValue }>()

const { t } = useI18n()

//What the learner has typed into the gap so far.
const answer = defineModel<string>('answer', { default: '' })

//The sentence either side of the gap. The submit checks allow exactly one
//marker; should one ever be missing the box goes at the end, and any extra
//marker stays as text, so there is only ever one box to answer in.
const around = computed(() => {
  const [before, ...rest] = props.value.sentence.split(BLANK_MARKER)
  return { before, after: rest.join(BLANK_MARKER) }
})

</script>

<template>
  <div class="question-block">
    <p v-if="value.title" class="question-block__title">{{ value.title }}</p>
    <p class="question-block__sentence">
      {{ around.before }}<input
        v-model="answer"
        class="question-block__gap"
        type="text"
        :maxlength="MAX_ANSWER_LENGTH"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :aria-label="t('learner.blocks.missingWord')"
      >{{ around.after }}
    </p>
  </div>
</template>

<style scoped src="./questionBlock.css"></style>

<style scoped>
/* The gap reads as a box to type in, not an underline: a border all round,
   rounded corners and the same focus ring as every other input. */
.question-block__sentence .question-block__gap {
  min-height: 40px;
  padding: var(--space-1) var(--space-3);
  border: 2px solid var(--rule-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  line-height: 1.4;
  vertical-align: middle;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.question-block__sentence .question-block__gap:hover {
  border-color: var(--ink-3);
}
.question-block__sentence .question-block__gap:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--focus-ring);
}
</style>
