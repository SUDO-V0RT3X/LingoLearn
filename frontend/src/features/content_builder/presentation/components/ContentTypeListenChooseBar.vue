<script setup lang="ts">
import { MAX_TRANSCRIPT_LENGTH } from '@/core/limits'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource';
import AudioUploadField from './AudioUploadField.vue';
import ChoiceAnswersField from './ChoiceAnswersField.vue';

const { t } = useI18n();

//Two-way bindings for each $ListenChooseBlockValue field.
const title = defineModel<string>('title', {default:''});
const fileUrl = defineModel<string>('fileUrl', {default:''});
const transcript = defineModel<string>('transcript', {default:''});
const options = defineModel<string[]>('options', {default:() => ['','']});
const correctOption = defineModel<number>('correctOption', {default:0});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

//Uploads are stored relative, so the read only player needs the API origin put back.
const playableUrl = computed(() => MediaDataSource.resolveUrl(fileUrl.value));

</script>

<template>
    <fieldset v-if="editable" class="listenBlockFields">
        <legend class="listenBlock__legend">{{ t('common.blockTypes.listenChoose') }}</legend>
        <label class="listenBlockField">
            <span class="listenBlockField__label">{{ t('builder.fields.title') }}</span>
            <input class="listenBlockField__input" type="text" v-model="title" maxlength="120"
                   :placeholder="t('builder.listen.titlePlaceholder')">
        </label>
        <AudioUploadField v-model:file-url="fileUrl" :upload-title="title"/>
        <label class="listenBlockField">
            <span class="listenBlockField__label">{{ t('builder.fields.transcript') }}</span>
            <textarea class="listenBlockField__input" v-model="transcript" rows="2" :maxlength="MAX_TRANSCRIPT_LENGTH"
                      :placeholder="t('builder.fields.transcriptPlaceholder')"></textarea>
        </label>
        <ChoiceAnswersField v-model:options="options" v-model:correct-option="correctOption" :editable="true"/>
    </fieldset>

    <!-- Read only: the question as an author or moderator meets it, right answer marked. -->
    <div v-else class="listenBlockPreview">
        <h4 :class="['listenBlockPreview__title',{'listenBlockPreview__title--empty':!title}]">
            {{ title || t('builder.listen.untitled') }}
        </h4>
        <audio v-if="fileUrl" class="audioPlayer" :src="playableUrl" controls></audio>
        <p v-else class="listenBlockPreview__missing">{{ t('builder.fields.noFile') }}</p>
        <p v-if="transcript" class="listenBlockPreview__transcript">
            <span class="listenBlockPreview__transcriptLabel">{{ t('builder.fields.transcriptLabel') }}</span> {{ transcript }}
        </p>
        <p v-else class="listenBlockPreview__missing">{{ t('builder.fields.noTranscript') }}</p>
        <ChoiceAnswersField v-model:options="options" v-model:correct-option="correctOption" :editable="false"/>
    </div>
</template>

<style scoped>
.listenBlockFields{
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
.listenBlock__legend{
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
.listenBlockField{
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
}
.listenBlockField__label{
    flex: none;
    width: var(--block-label-width, 88px);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.listenBlockField__input{
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
.listenBlockField__input::placeholder{ color: var(--ink-3); }
.listenBlockField__input:focus{
    outline: none;
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
}

/* Read only stacks like real content rather than a one line summary. */
.listenBlockPreview{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
}
.listenBlockPreview__title{
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.3;
    color: var(--ink);
    overflow-wrap: anywhere;
}
.listenBlockPreview__title--empty{
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
}
.listenBlockPreview__missing{
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-3);
}
.listenBlockField .listenBlockField__label{ padding-top: 10px; }
textarea.listenBlockField__input{ resize: vertical; min-height: 64px; line-height: 1.5; }
.audioPlayer{
    display: block;
    width: 100%;
    min-width: 0;
    height: 40px;
    margin: var(--space-1) 0;
}
.listenBlockPreview__transcript{
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.6;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}
.listenBlockPreview__transcriptLabel{
    font-weight: 600;
    color: var(--ink);
}

</style>
