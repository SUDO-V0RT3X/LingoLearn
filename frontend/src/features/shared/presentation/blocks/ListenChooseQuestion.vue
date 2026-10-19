<script setup lang="ts">

//A listening question as a learner meets it: a clip, then answers to pick from.
//It never says whether the pick is right, because the answer is not sent to a
//learner. Marking happens on the server.
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { $LearnerListenChooseValue } from '@/features/shared/models/contentType'
import { MediaEndpoints } from '@/core/endpoints/feature_endpoints/mediaEndpoints'
import { answerableOptions } from './answerableOptions'

//A test or the challenge passes allowTranscript false: there the transcript is
//the answer. (The server does not send it to a learner either.) The reader and
//the author's preview keep it, for anyone who cannot hear the clip.
const props = withDefaults(defineProps<{ value: $LearnerListenChooseValue; allowTranscript?: boolean }>(), {
  allowTranscript: true,
})

const { t } = useI18n()

//Position in value.options of the learner's pick, or null before they pick.
const answer = defineModel<number | null>('answer', { default: null })

const options = computed(() => answerableOptions(props.value.options))

//Uploads are stored as relative paths, so the API origin has to be put back.
const source = computed(() => MediaEndpoints.resolveUrl(props.value.fileUrl))

//Hidden until asked for: shown up front it would answer the question, but a
//learner who cannot hear the clip still needs a way in.
const showTranscript = ref(false)

//One radio group per question, so two questions on a page stay separate.
const groupName = useId()

</script>

<template>
  <fieldset class="question-block">
    <legend class="question-block__prompt">
      <span v-if="value.title" class="question-block__title">{{ value.title }}</span>
      {{ t('learner.blocks.listenPrompt') }}
    </legend>
    <audio v-if="value.fileUrl" :src="source" controls preload="none"></audio>
    <button
      v-if="allowTranscript && value.transcript"
      type="button"
      class="question-block__transcript-toggle"
      :aria-expanded="showTranscript"
      @click="showTranscript = !showTranscript"
    >
      {{ showTranscript ? t('learner.blocks.hideTranscript') : t('learner.blocks.showTranscript') }}
    </button>
    <p v-if="allowTranscript && showTranscript && value.transcript" class="question-block__transcript">
      {{ value.transcript }}
    </p>
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
