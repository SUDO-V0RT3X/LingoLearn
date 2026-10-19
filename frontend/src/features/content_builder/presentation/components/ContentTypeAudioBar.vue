<script setup lang="ts">
import { MAX_TRANSCRIPT_LENGTH } from '@/core/limits'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource';
import AudioUploadField from './AudioUploadField.vue';

const { t } = useI18n();

//Two-way bindings for each $AudioBlockValue field.
const title = defineModel<string>('title', {default:''});
const fileUrl = defineModel<string>('fileUrl', {default:''});
const transcript = defineModel<string>('transcript', {default:''});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

//Uploads are stored relative, so the read only player needs the API origin put back.
const playableUrl = computed(() => MediaDataSource.resolveUrl(fileUrl.value));

</script>

<template>
    <div v-if="editable" class="mediaBlockFields">
        <label class="mediaBlockField">
            <span class="mediaBlockField__label">{{ t('builder.fields.title') }}</span>
            <input class="mediaBlockField__input" type="text" v-model="title" maxlength="120"
                   :placeholder="t('builder.audio.titlePlaceholder')">
        </label>
        <AudioUploadField v-model:file-url="fileUrl" :upload-title="title"/>
        <label class="mediaBlockField">
            <span class="mediaBlockField__label">{{ t('builder.fields.transcript') }}</span>
            <textarea class="mediaBlockField__input" v-model="transcript" rows="2" :maxlength="MAX_TRANSCRIPT_LENGTH"
                      :placeholder="t('builder.fields.transcriptPlaceholder')"></textarea>
        </label>
    </div>

    <!-- Read only: renders as a learner sees it, with a placeholder player. No file is loaded. -->
    <div v-else class="mediaBlockPreview">
        <h4 :class="['mediaBlockPreview__title',{'mediaBlockPreview__title--empty':!title}]">
            {{ title || t('builder.audio.untitled') }}
        </h4>
        <audio v-if="fileUrl" class="audioPlayer" :src="playableUrl" controls></audio>
        <div v-else class="audioStub">
            <span class="audioStub__play" aria-hidden="true">▶</span>
            <span class="audioStub__track" aria-hidden="true"></span>
            <span class="audioStub__file mediaBlockPreview__missing">{{ t('builder.fields.noFile') }}</span>
        </div>
        <p v-if="transcript" class="mediaBlockPreview__text">
            <span class="audioStub__label">{{ t('builder.fields.transcriptLabel') }}</span> {{ transcript }}
        </p>
        <p v-else class="mediaBlockPreview__text mediaBlockPreview__missing">{{ t('builder.fields.noTranscript') }}</p>
    </div>
</template>

<style scoped src="./blockMedia.css"></style>
<style scoped>
.audioPlayer{
    display: block;
    width: 100%;
    min-width: 0;
    height: 40px;
}
.audioStub{
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    min-width: 0;
}
.audioStub__play{
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    font-size: 10px;
    color: var(--ink-3);
    background: var(--surface);
    border: 1px solid var(--rule);
}
.audioStub__track{
    flex: 1;
    min-width: 24px;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface-3);
}
.audioStub__file{
    flex: none;
    max-width: 55%;
    padding-right: var(--space-1);
    font-size: var(--text-xs);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.audioStub__label{
    font-weight: 600;
    color: var(--ink);
}

</style>
