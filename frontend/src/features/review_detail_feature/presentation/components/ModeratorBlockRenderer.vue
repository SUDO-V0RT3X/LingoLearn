<script setup lang="ts">
//One page as a moderator reviews it. Text, images and audio go through the
//learner's own blocks, so they look exactly as a learner will see them;
//question blocks go through ModeratorQuestionBlock, which also shows the
//answers a learner never sees.
import { ContentBlockTypes, QUESTION_BLOCK_TYPES, isBlockOfType, type $ContentBlock } from '@/features/shared/models/contentType'
import TextBlock from '@/features/learner_experience/presentation/components/blocks/TextBlock.vue'
import ImageBlock from '@/features/learner_experience/presentation/components/blocks/ImageBlock.vue'
import AudioBlock from '@/features/learner_experience/presentation/components/blocks/AudioBlock.vue'
import ModeratorQuestionBlock from './ModeratorQuestionBlock.vue'
import { useI18n } from 'vue-i18n'

defineProps<{ blocks: $ContentBlock[] }>()

const { t } = useI18n()

const isQuestion = (block: $ContentBlock) => QUESTION_BLOCK_TYPES.includes(block.itemType)
</script>

<template>
  <div class="moderator-blocks">
    <template v-for="(block, index) in blocks" :key="index">
      <TextBlock v-if="isBlockOfType(block, ContentBlockTypes.text)" :value="block.value" />
      <ImageBlock v-else-if="isBlockOfType(block, ContentBlockTypes.image)" :value="block.value" />
      <AudioBlock v-else-if="isBlockOfType(block, ContentBlockTypes.audio)" :value="block.value" />
      <ModeratorQuestionBlock v-else-if="isQuestion(block)" :block="block" />
      <p v-else class="ui-alert ui-alert--warning moderator-blocks__unknown">
        {{ t('moderation.question.unknownBlock', { type: block.itemType }) }}
      </p>
    </template>
    <p v-if="blocks.length === 0" class="moderator-blocks__empty">{{ t('moderation.question.emptyPage') }}</p>
  </div>
</template>

<style scoped>
.moderator-blocks__unknown { margin: 0 0 var(--space-4); }

.moderator-blocks__empty {
  margin: 0;
  color: var(--ink-3);
  font-style: italic;
}
</style>
