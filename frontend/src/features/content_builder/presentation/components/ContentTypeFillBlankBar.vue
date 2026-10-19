<script setup lang="ts">
import { MAX_ANSWER_LENGTH } from '@/core/limits'

import { computed } from 'vue'
import { Translation, useI18n } from 'vue-i18n'
import { BLANK_MARKER } from '@/features/shared/models/contentType';

const { t } = useI18n();

//Two-way bindings for each $FillBlankBlockValue field.
const title = defineModel<string>('title', {default:''});
const sentence = defineModel<string>('sentence', {default:''});
const accepted = defineModel<string[]>('accepted', {default:() => ['']});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

//A question needs somewhere for an answer to go, and one spelling to accept.
const MIN_ACCEPTED = 1;
const MAX_ACCEPTED = 6;

//The sentence cut around every marker, so the gap can be drawn as a gap. A
//sentence with no marker is one part, which reads as the plain sentence.
const sentenceParts = computed(() => sentence.value.split(BLANK_MARKER));

//Writes one accepted spelling back, leaving the rest as they are.
function writeAccepted(index:number, text:string){
    accepted.value = accepted.value.map((answer,at) => at === index ? text : answer);
}

function addAccepted(){
    if (accepted.value.length >= MAX_ACCEPTED) return;
    accepted.value = [...accepted.value, ''];
}

function removeAccepted(index:number){
    if (accepted.value.length <= MIN_ACCEPTED) return;
    accepted.value = accepted.value.filter((_,at) => at !== index);
}

</script>

<template>
    <fieldset v-if="editable" class="blankBlockFields">
        <legend class="blankBlock__legend">{{ t('common.blockTypes.fillBlank') }}</legend>
        <label class="blankBlockField">
            <span class="blankBlockField__label">{{ t('builder.fields.title') }}</span>
            <input class="blankBlockField__input" type="text" v-model="title" maxlength="120"
                   :placeholder="t('builder.fields.headingPlaceholder')">
        </label>
        <label class="blankBlockField">
            <span class="blankBlockField__label">{{ t('builder.fillBlank.sentence') }}</span>
            <input class="blankBlockField__input" type="text" v-model="sentence" maxlength="2000"
                   :placeholder="t('builder.fillBlank.sentencePlaceholder', {marker: BLANK_MARKER})">
        </label>
        <Translation keypath="builder.fillBlank.markerHint" tag="p" class="blankBlock__hint" scope="global">
            <template #marker><code>{{ BLANK_MARKER }}</code></template>
        </Translation>

        <!-- Every spelling an author is willing to count as right. -->
        <div class="blankAnswers">
            <span class="blankBlockField__label">{{ t('builder.fillBlank.accepts') }}</span>
            <div class="blankAnswers__list">
                <div v-for="(answer,index) in accepted" :key="index" class="blankAnswer">
                    <input class="blankBlockField__input" type="text" :value="answer" :maxlength="MAX_ANSWER_LENGTH"
                           :placeholder="t('builder.fillBlank.spelling', {n: index + 1})"
                           :aria-label="t('builder.fillBlank.spelling', {n: index + 1})"
                           @input="writeAccepted(index,($event.target as HTMLInputElement).value)">
                    <button type="button" class="blankAnswer__remove" :title="t('builder.fillBlank.removeThis')"
                            :aria-label="t('builder.fillBlank.remove', {n: index + 1})"
                            :disabled="accepted.length <= MIN_ACCEPTED" @click="removeAccepted(index)">×</button>
                </div>
            </div>
            <button type="button" class="blankAnswers__add"
                    :disabled="accepted.length >= MAX_ACCEPTED" @click="addAccepted">{{ t('builder.fillBlank.add') }}</button>
            <p class="blankBlock__hint">{{ t('builder.fillBlank.neverShown') }}</p>
        </div>
    </fieldset>

    <!-- Read only: the sentence as an author or moderator reads it, gap drawn as a gap. -->
    <div v-else class="blankBlockPreview">
        <h4 :class="['blankBlockPreview__title',{'blankBlockPreview__title--empty':!title}]">
            {{ title || t('builder.fillBlank.untitled') }}
        </h4>
        <p v-if="sentence" class="blankBlockPreview__sentence">
            <template v-for="(part,index) in sentenceParts" :key="index">
                <span v-if="index > 0" class="blankBlockPreview__gap" :aria-label="t('builder.fillBlank.gap')"></span>{{ part }}
            </template>
        </p>
        <p v-else class="blankBlockPreview__missing">{{ t('builder.fillBlank.noSentence') }}</p>
        <p class="blankBlockPreview__accepted">
            <span class="blankBlockPreview__acceptedLabel">{{ t('builder.fillBlank.acceptsLabel') }}</span>
            <span v-if="accepted.some(answer => answer)">{{ accepted.filter(answer => answer).join(', ') }}</span>
            <span v-else class="blankBlockPreview__missing">{{ t('builder.fillBlank.noSpelling') }}</span>
        </p>
    </div>
</template>

<style scoped>
.blankBlockFields{
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
}
/* The row above the block already names its type, so the legend is kept for
   screen readers only. */
.blankBlock__legend{
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
.blankBlockField{
    display: flex;
    align-items: center;
    gap: var(--space-3);
}
.blankBlockField__label{
    flex: none;
    width: var(--block-label-width, 88px);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.blankBlockField__input{
    flex: 1;
    min-width: 0;
    min-height: 36px;
    padding: 6px 10px;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-sm);
    transition: border-color .15s ease, box-shadow .15s ease;
}
.blankBlockField__input::placeholder{ color: var(--ink-3); }
.blankBlockField__input:focus{
    outline: none;
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
}

/* Read only stacks like real content rather than a one line summary. */
.blankBlockPreview{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
}
.blankBlockPreview__title{
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    overflow-wrap: anywhere;
}
.blankBlockPreview__title--empty{
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
}
.blankBlockPreview__missing{
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-3);
}
.blankBlock__hint{
    margin: 0 0 0 calc(var(--block-label-width, 88px) + var(--space-3));
    font-size: var(--text-xs);
    color: var(--ink-3);
}
.blankBlock__hint code{
    padding: 1px 5px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink);
    background: var(--surface-2);
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
}

/* Laid out like the other fields: the label in the left column, the list beside it. */
.blankAnswers{
    display: grid;
    grid-template-columns: var(--block-label-width, 88px) minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: var(--space-2);
    align-items: start;
    min-width: 0;
    margin-top: var(--space-1);
}
.blankAnswers > .blankBlockField__label{ padding-top: 10px; }
.blankAnswers > .blankAnswers__add,
.blankAnswers > .blankBlock__hint{ grid-column: 2; margin: 0; }
.blankAnswers__list{
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}
.blankAnswer{
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}
.blankAnswer__remove{
    flex: none;
    width: 30px;
    height: 30px;
    font: inherit;
    font-size: var(--text-md);
    line-height: 1;
    color: var(--ink-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
}
.blankAnswer__remove:hover:not(:disabled){ color: var(--danger); background: var(--danger-soft); }
.blankAnswer__remove:disabled{
    cursor: not-allowed;
    opacity: .35;
}
.blankAnswers__add{
    justify-self: start;
    min-height: 32px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--primary);
    background: transparent;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease;
}
.blankAnswers__add:hover:not(:disabled){ border-color: var(--primary); background: var(--primary-soft); }
.blankAnswers__add:disabled{
    cursor: not-allowed;
    opacity: .45;
}

.blankBlockPreview__sentence{
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.9;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}
.blankBlockPreview__gap{
    display: inline-block;
    width: 72px;
    height: 1.3em;
    margin: 0 4px;
    vertical-align: text-bottom;
    background: var(--surface-2);
    border-bottom: 2px solid var(--ink-3);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}
.blankBlockPreview__accepted{
    margin: var(--space-1) 0 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}
.blankBlockPreview__acceptedLabel{
    margin-right: 5px;
    font-weight: 600;
    color: var(--ink);
}

</style>
