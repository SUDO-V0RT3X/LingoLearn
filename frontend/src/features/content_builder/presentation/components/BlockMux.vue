<script setup lang="ts">

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { contentBuilderScreenState } from '../state';
import ContentTypeTextBar from './ContentTypeTextBar.vue';
import ContentTypeImageBar from './ContentTypeImageBar.vue';
import ContentTypeAudioBar from './ContentTypeAudioBar.vue';
import ContentTypeMultipleChoiceBar from './ContentTypeMultipleChoiceBar.vue';
import ContentTypeFillBlankBar from './ContentTypeFillBlankBar.vue';
import ContentTypeListenChooseBar from './ContentTypeListenChooseBar.vue';
import InstantiateBlockOptions from './InstantiateBlockOptions.vue';
import { $ContentBlock, ContentBlockTypes, emptyValueFor, isBlockOfType,
         type $AudioBlockValue, type $FillBlankBlockValue, type $ImageBlockValue,
         type $ListenChooseBlockValue, type $MultipleChoiceBlockValue,
         type $TextBlockValue } from '@/features/shared/models/contentType';

let state = contentBuilderScreenState();
const { t } = useI18n();

const props = defineProps({
  page: {type:Number, required: true,},
  block: {type:Number, required: true,},
  //Always renders read only, for screens that show content without editing it.
  readonly: {type:Boolean, default: false,},
});

//Type of this block, which picks the component to render.
const type = computed(() => state.getTypeForPageAndBlock(props.page, props.block))

//True only for the block open for editing; every other block renders read only.
const editable = computed(() => !props.readonly && state.isBlockEditable(props.page, props.block))

//----------------------------------------------------------------------------
// Typed values. Each block type has: a value computed narrowed with isBlockOfType,
// a patch that writes changed fields over the current value, and one two-way
// computed per field for its component's v-models.
//----------------------------------------------------------------------------
//This block's value if it is a text block, otherwise null.
const textValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.text) ? block.value : null;
})

//Writes changed text fields over the current value.
function patchText(fields:Partial<$TextBlockValue>){
    const current = textValue.value ?? emptyValueFor(ContentBlockTypes.text);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.text,{...current, ...fields}));
}

//Two-way text fields.
const title = computed({
    get: () => textValue.value?.title ?? '',
    set: (value:string) => patchText({title:value}),
})
const text = computed({
    get: () => textValue.value?.text ?? '',
    set: (value:string) => patchText({text:value}),
})

//This block's value if it is an image block, otherwise null.
const imageValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.image) ? block.value : null;
})

//Writes changed image fields over the current value.
function patchImage(fields:Partial<$ImageBlockValue>){
    const current = imageValue.value ?? emptyValueFor(ContentBlockTypes.image);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.image,{...current, ...fields}));
}

//Two-way image fields: caption, placeholder file link and alt text.
const imageTitle = computed({
    get: () => imageValue.value?.title ?? '',
    set: (value:string) => patchImage({title:value}),
})
const imageFileUrl = computed({
    get: () => imageValue.value?.fileUrl ?? '',
    set: (value:string) => patchImage({fileUrl:value}),
})
const altText = computed({
    get: () => imageValue.value?.altText ?? '',
    set: (value:string) => patchImage({altText:value}),
})

//This block's value if it is an audio block, otherwise null.
const audioValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.audio) ? block.value : null;
})

//Writes changed audio fields over the current value.
function patchAudio(fields:Partial<$AudioBlockValue>){
    const current = audioValue.value ?? emptyValueFor(ContentBlockTypes.audio);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.audio,{...current, ...fields}));
}

//Two-way audio fields: title, placeholder file link and transcript.
const audioTitle = computed({
    get: () => audioValue.value?.title ?? '',
    set: (value:string) => patchAudio({title:value}),
})
const audioFileUrl = computed({
    get: () => audioValue.value?.fileUrl ?? '',
    set: (value:string) => patchAudio({fileUrl:value}),
})
const transcript = computed({
    get: () => audioValue.value?.transcript ?? '',
    set: (value:string) => patchAudio({transcript:value}),
})

//This block's value if it is a multiple choice block, otherwise null.
const choiceValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.multipleChoice) ? block.value : null;
})

//Writes changed multiple choice fields over the current value.
function patchChoice(fields:Partial<$MultipleChoiceBlockValue>){
    const current = choiceValue.value ?? emptyValueFor(ContentBlockTypes.multipleChoice);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.multipleChoice,{...current, ...fields}));
}

//Two-way multiple choice fields: heading, question, answers and which one is right.
const choiceTitle = computed({
    get: () => choiceValue.value?.title ?? '',
    set: (value:string) => patchChoice({title:value}),
})
const question = computed({
    get: () => choiceValue.value?.question ?? '',
    set: (value:string) => patchChoice({question:value}),
})
const choiceOptions = computed({
    get: () => choiceValue.value?.options ?? [],
    set: (value:string[]) => patchChoice({options:value}),
})
const correctOption = computed({
    get: () => choiceValue.value?.correctOption ?? 0,
    set: (value:number) => patchChoice({correctOption:value}),
})

//This block's value if it is a fill in the blank block, otherwise null.
const blankValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.fillBlank) ? block.value : null;
})

//Writes changed fill in the blank fields over the current value.
function patchBlank(fields:Partial<$FillBlankBlockValue>){
    const current = blankValue.value ?? emptyValueFor(ContentBlockTypes.fillBlank);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.fillBlank,{...current, ...fields}));
}

//Two-way fill in the blank fields: heading, the sentence and the spellings it accepts.
const blankTitle = computed({
    get: () => blankValue.value?.title ?? '',
    set: (value:string) => patchBlank({title:value}),
})
const sentence = computed({
    get: () => blankValue.value?.sentence ?? '',
    set: (value:string) => patchBlank({sentence:value}),
})
const accepted = computed({
    get: () => blankValue.value?.accepted ?? [],
    set: (value:string[]) => patchBlank({accepted:value}),
})

//This block's value if it is a listen and choose block, otherwise null.
const listenValue = computed(() => {
    const block = state.contentState[props.page]?.[props.block];
    return isBlockOfType(block, ContentBlockTypes.listenChoose) ? block.value : null;
})

//Writes changed listen and choose fields over the current value.
function patchListen(fields:Partial<$ListenChooseBlockValue>){
    const current = listenValue.value ?? emptyValueFor(ContentBlockTypes.listenChoose);
    state.writeBlock(props.block, new $ContentBlock(ContentBlockTypes.listenChoose,{...current, ...fields}));
}

//Two-way listen and choose fields: the clip, what is said in it, and the answers.
const listenTitle = computed({
    get: () => listenValue.value?.title ?? '',
    set: (value:string) => patchListen({title:value}),
})
const listenFileUrl = computed({
    get: () => listenValue.value?.fileUrl ?? '',
    set: (value:string) => patchListen({fileUrl:value}),
})
const listenTranscript = computed({
    get: () => listenValue.value?.transcript ?? '',
    set: (value:string) => patchListen({transcript:value}),
})
const listenOptions = computed({
    get: () => listenValue.value?.options ?? [],
    set: (value:string[]) => patchListen({options:value}),
})
const listenCorrectOption = computed({
    get: () => listenValue.value?.correctOption ?? 0,
    set: (value:number) => patchListen({correctOption:value}),
})
</script>

<template>
    <ContentTypeTextBar v-if="type==ContentBlockTypes.text"
                        v-model:title="title" v-model:text="text" :editable="editable"/>
    <ContentTypeImageBar v-else-if="type==ContentBlockTypes.image"
                         v-model:title="imageTitle" v-model:file-url="imageFileUrl" v-model:alt-text="altText"
                         :editable="editable"/>
    <ContentTypeAudioBar v-else-if="type==ContentBlockTypes.audio"
                         v-model:title="audioTitle" v-model:file-url="audioFileUrl" v-model:transcript="transcript"
                         :editable="editable"/>
    <ContentTypeMultipleChoiceBar v-else-if="type==ContentBlockTypes.multipleChoice"
                                  v-model:title="choiceTitle" v-model:question="question"
                                  v-model:options="choiceOptions" v-model:correct-option="correctOption"
                                  :editable="editable"/>
    <ContentTypeFillBlankBar v-else-if="type==ContentBlockTypes.fillBlank"
                             v-model:title="blankTitle" v-model:sentence="sentence" v-model:accepted="accepted"
                             :editable="editable"/>
    <ContentTypeListenChooseBar v-else-if="type==ContentBlockTypes.listenChoose"
                                v-model:title="listenTitle" v-model:file-url="listenFileUrl"
                                v-model:transcript="listenTranscript" v-model:options="listenOptions"
                                v-model:correct-option="listenCorrectOption" :editable="editable"/>
    <InstantiateBlockOptions v-else-if="type==ContentBlockTypes.pendingSelection && !props.readonly" :block="props.block"/>
    <span v-else-if="type==ContentBlockTypes.pendingSelection" class="blockMuxUnbuilt">{{ t('builder.blocks.noTypeYet') }}</span>
    <span v-else class="blockMuxUnbuilt">{{ t('builder.blocks.noEditor') }}</span>
</template>

<style scoped>
.blockMuxUnbuilt{
    font-size: var(--text-sm);
    color: var(--ink-3);
    font-style: italic;
}

</style>
