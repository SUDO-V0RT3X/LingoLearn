<script setup lang="ts">

import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { contentBuilderScreenState } from '../state';
import { $ContentBlock, ContentBlockTypes, emptyValueFor } from '@/features/shared/models/contentType';
import { blockTypeLabel } from '@/features/content_builder/functions/blockTypeLabel';

let state = contentBuilderScreenState();
const { t } = useI18n();

//Position of the untyped block on the selected page.
const props = defineProps({
  block: {type:Number, required: true,},
});

//Types offered to the author: every block type except the untyped placeholder, which is last.
//The enum values are stored data; the buttons carry each type's translated name.
let types:Ref<ContentBlockTypes[]> = ref(Object.values(ContentBlockTypes))
types.value.pop();

//Gives the block this type, with an empty value.
function selectClick(type:ContentBlockTypes){
    let content = new $ContentBlock(type,emptyValueFor(type));
    state.writeBlock(props.block,content);
}

</script>

<template>
    <div class="instantiateBlockWrapper">
        <span class="instantiateBlockPrompt">{{ t('builder.blocks.pickType') }}</span>
        <button v-for="type in types" :key="type" @click.stop="selectClick(type)" class="blockOption" >
            {{ blockTypeLabel(type) }}
        </button>
    </div>
</template>

<style scoped>
.instantiateBlockWrapper{
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
}
.instantiateBlockPrompt{
    flex-basis: 100%;
    font-size: var(--text-sm);
    color: var(--ink-2);
}
.blockOption{
    min-height: 32px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-pill);
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.blockOption:hover{
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-soft);
}

</style>
