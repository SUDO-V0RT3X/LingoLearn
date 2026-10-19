<script setup lang="ts">

import { useI18n } from 'vue-i18n'
import ChoiceAnswersField from './ChoiceAnswersField.vue';

const { t } = useI18n();

//Two-way bindings for each $MultipleChoiceBlockValue field.
const title = defineModel<string>('title', {default:''});
const question = defineModel<string>('question', {default:''});
const options = defineModel<string[]>('options', {default:() => ['','']});
const correctOption = defineModel<number>('correctOption', {default:0});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

</script>

<template>
    <fieldset v-if="editable" class="choiceBlockFields">
        <legend class="choiceBlock__legend">{{ t('common.blockTypes.multipleChoice') }}</legend>
        <label class="choiceBlockField">
            <span class="choiceBlockField__label">{{ t('builder.fields.title') }}</span>
            <input class="choiceBlockField__input" type="text" v-model="title" maxlength="120"
                   :placeholder="t('builder.fields.headingPlaceholder')">
        </label>
        <label class="choiceBlockField">
            <span class="choiceBlockField__label">{{ t('builder.fields.question') }}</span>
            <input class="choiceBlockField__input" type="text" v-model="question" maxlength="2000"
                   :placeholder="t('builder.fields.questionPlaceholder')">
        </label>
        <ChoiceAnswersField v-model:options="options" v-model:correct-option="correctOption" :editable="true"/>
    </fieldset>

    <!-- Read only: the question as an author or moderator reads it, right answer marked. -->
    <div v-else class="choiceBlockPreview">
        <h4 :class="['choiceBlockPreview__title',{'choiceBlockPreview__title--empty':!title}]">
            {{ title || t('builder.choice.untitled') }}
        </h4>
        <p v-if="question" class="choiceBlockPreview__question">{{ question }}</p>
        <p v-else class="choiceBlockPreview__missing">{{ t('builder.choice.noQuestion') }}</p>
        <ChoiceAnswersField v-model:options="options" v-model:correct-option="correctOption" :editable="false"/>
    </div>
</template>

<style scoped>
.choiceBlockFields{
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
.choiceBlock__legend{
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
.choiceBlockField{
    display: flex;
    align-items: center;
    gap: var(--space-3);
}
.choiceBlockField__label{
    flex: none;
    width: var(--block-label-width, 88px);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.choiceBlockField__input{
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
.choiceBlockField__input::placeholder{ color: var(--ink-3); }
.choiceBlockField__input:focus{
    outline: none;
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
}

/* Read only stacks like real content rather than a one line summary. */
.choiceBlockPreview{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
}
.choiceBlockPreview__title{
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    overflow-wrap: anywhere;
}
.choiceBlockPreview__title--empty{
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
}
.choiceBlockPreview__missing{
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-3);
}
.choiceBlockPreview__question{
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}

</style>
