<script setup lang="ts">

//A multiple choice question as a learner meets it. It shows the question and
//lets the learner pick; it never says whether the pick is right, because the
//answer is not sent to a learner. Marking happens on the server.
import { computed, useId } from 'vue'
import type { $LearnerMultipleChoiceValue } from '@/features/shared/models/contentType'
import { answerableOptions } from './answerableOptions'

const props = defineProps<{ value: $LearnerMultipleChoiceValue }>()

//Position in value.options of the learner's pick, or null before they pick.
const answer = defineModel<number | null>('answer', { default: null })

const options = computed(() => answerableOptions(props.value.options))

//One radio group per question, so two questions on a page stay separate.
const groupName = useId()

</script>

<template>
  <fieldset class="question-block">
    <legend class="question-block__prompt">
      <span v-if="value.title" class="question-block__title">{{ value.title }}</span>
      {{ value.question }}
    </legend>
    <label v-for="option in options" :key="option.position" class="question-block__option">
      <input
        type="radio"
        :name="groupName"
        :value="option.position"
        :checked="answer === option.position"
        @change="answer = option.position"
      >
      <span>{{ option.text }}</span>
    </label>
  </fieldset>
</template>

<style scoped src="./questionBlock.css"></style>
