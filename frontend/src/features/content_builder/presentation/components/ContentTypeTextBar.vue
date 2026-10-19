<script setup lang="ts">

import { useI18n } from 'vue-i18n'

const { t } = useI18n();

//Two-way bindings for each $TextBlockValue field.
const title = defineModel<string>('title', {default:''});
const text = defineModel<string>('text', {default:''});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

</script>

<template>
    <div v-if="editable" class="textBlockFields">
        <label class="textBlockField">
            <span class="textBlockField__label">{{ t('builder.fields.title') }}</span>
            <input class="textBlockField__input" type="text" v-model="title"
                   maxlength="120"
                   :placeholder="t('builder.fields.headingPlaceholder')">
        </label>
        <label class="textBlockField">
            <span class="textBlockField__label">{{ t('builder.fields.text') }}</span>
            <input class="textBlockField__input" type="text" v-model="text"
                   maxlength="2000"
                   :placeholder="t('builder.fields.textPlaceholder')">
        </label>
    </div>

    <!-- Read only: renders as a learner sees it, heading then body. -->
    <div v-else class="textBlockPreview">
        <h4 :class="['textBlockPreview__title',{'textBlockPreview__title--empty':!title}]">
            {{ title || t('builder.fields.untitledBlock') }}
        </h4>
        <p v-if="text" class="textBlockPreview__text">{{ text }}</p>
    </div>
</template>

<style scoped>
.textBlockFields{
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}
.textBlockField{
    display: flex;
    align-items: center;
    gap: var(--space-3);
}
.textBlockField__label{
    flex: none;
    width: var(--block-label-width, 88px);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.textBlockField__input{
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
.textBlockField__input::placeholder{ color: var(--ink-3); }
.textBlockField__input:focus{
    outline: none;
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
}

/* Read only stacks like real content rather than a one line summary. */
.textBlockPreview{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
}
.textBlockPreview__title{
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    overflow-wrap: anywhere;
}
.textBlockPreview__title--empty{
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
}
.textBlockPreview__text{
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}

</style>
