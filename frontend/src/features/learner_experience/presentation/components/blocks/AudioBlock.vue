<script setup lang="ts">

import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { $AudioBlockValue } from '@/features/shared/models/contentType'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource'

const props = defineProps<{ value: $AudioBlockValue }>()

const { t } = useI18n()

//Uploads are stored as relative paths, so the API origin has to be put back.
const source = computed(() => MediaDataSource.resolveUrl(props.value.fileUrl))

//The transcript is what makes this block usable with the sound off.
const showTranscript = ref(false)

</script>

<template>
  <div class="audio-block">
    <p v-if="value.title" class="audio-block__title">{{ value.title }}</p>
    <audio v-if="value.fileUrl" :src="source" controls preload="none"></audio>
    <button
      v-if="value.transcript"
      class="audio-block__transcript-toggle"
      @click="showTranscript = !showTranscript"
    >
      {{ showTranscript ? t('learner.blocks.hideTranscript') : t('learner.blocks.showTranscript') }}
    </button>
    <p v-if="showTranscript && value.transcript" class="audio-block__transcript">
      {{ value.transcript }}
    </p>
  </div>
</template>

<style scoped>
.audio-block {
  background: var(--surface-2);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  margin: 0 0 var(--space-5);
}
.audio-block__title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin: 0 0 var(--space-2);
}
.audio-block audio {
  width: 100%;
}
.audio-block__transcript-toggle {
  margin-top: var(--space-2);
  font: inherit;
  font-size: var(--text-xs);
  font-weight: 600;
  background: none;
  border: none;
  color: var(--primary);
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}
.audio-block__transcript {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--ink-2);
}
</style>
