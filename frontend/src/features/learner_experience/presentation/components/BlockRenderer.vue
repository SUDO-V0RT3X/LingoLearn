<script setup lang="ts">

import { useI18n } from 'vue-i18n'
import { ContentBlockTypes, isBlockOfType, type $ContentBlock } from '@/features/shared/models/contentType'
import TextBlock from './blocks/TextBlock.vue'
import ImageBlock from './blocks/ImageBlock.vue'
import AudioBlock from './blocks/AudioBlock.vue'
import MultipleChoiceQuestion from '@/features/shared/presentation/blocks/MultipleChoiceQuestion.vue'
import FillBlankQuestion from '@/features/shared/presentation/blocks/FillBlankQuestion.vue'
import ListenChooseQuestion from '@/features/shared/presentation/blocks/ListenChooseQuestion.vue'

//One page: the blocks in the order the author placed them. Blocks carry no id,
//so position is their identity.
defineProps<{ blocks: $ContentBlock[] }>()

const { t } = useI18n()

</script>

<template>
  <div class="block-renderer">
    <template v-for="(block, index) in blocks" :key="index">
      <TextBlock v-if="isBlockOfType(block, ContentBlockTypes.text)" :value="block.value" />
      <ImageBlock v-else-if="isBlockOfType(block, ContentBlockTypes.image)" :value="block.value" />
      <AudioBlock v-else-if="isBlockOfType(block, ContentBlockTypes.audio)" :value="block.value" />
      <MultipleChoiceQuestion v-else-if="isBlockOfType(block, ContentBlockTypes.multipleChoice)" :value="block.value" />
      <FillBlankQuestion v-else-if="isBlockOfType(block, ContentBlockTypes.fillBlank)" :value="block.value" />
      <ListenChooseQuestion v-else-if="isBlockOfType(block, ContentBlockTypes.listenChoose)" :value="block.value" />
      <div v-else class="block-renderer__unknown">
        {{ t('learner.blocks.unknown', { type: block.itemType }) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.block-renderer__unknown {
  font-size: 0.8rem;
  color: #c0392b;
  padding: 6px 0;
}
</style>
