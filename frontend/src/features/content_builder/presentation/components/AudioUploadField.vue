<script setup lang="ts">

//The upload control every block that holds a clip uses: audio blocks and
//listen and choose questions. It owns nothing but the link, which it writes
//back once the server has the file.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fileNameFromUrl } from '@/features/content_builder/functions/fileName';
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource';
import { validateAudio } from '@/features/media_feature/functions/validateAudio';
import { reasonOr } from '../state';

const { t } = useI18n();

//Relative link to the stored clip, e.g. /uploads/audio/<file>.mp3
const fileUrl = defineModel<string>('fileUrl', {default:''});

const props = defineProps({
  //Sent with the upload so the clip is named in the author's media list.
  uploadTitle: {type:String, default:''},
});

//File name shown in place of the full link.
const fileName = computed(() => fileNameFromUrl(fileUrl.value));

//Uploads are stored relative, so the player needs the API origin put back.
const playableUrl = computed(() => MediaDataSource.resolveUrl(fileUrl.value));

const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const uploadError = ref('');

//Sends the chosen clip and stores the link it comes back with. The file is
//checked in the browser first, so an unusable clip never reaches the server.
async function upload(event:Event){
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    uploadError.value = '';
    const problem = await validateAudio(file);
    if (problem){
        uploadError.value = problem;
        return;
    }

    isUploading.value = true;
    const result = await MediaDataSource.uploadAudio(file, props.uploadTitle);
    isUploading.value = false;

    if (result.error || !result.data){
        //The server's reason for a refused file, in the interface language; anything
        //else (offline, a failing server) reads as the general failure.
        uploadError.value = reasonOr(result.error, t('builder.upload.failed'));
        return;
    }

    fileUrl.value = result.data.fileUrl;
    if (fileInput.value) fileInput.value.value = '';
}

</script>

<template>
    <div class="audioUpload">
        <span class="audioUpload__label">{{ t('builder.upload.file') }}</span>
        <div class="audioUpload__row">
            <button type="button" class="audioUpload__button" :disabled="isUploading" @click="fileInput?.click()">
                {{ isUploading ? t('builder.upload.uploading') : fileUrl ? t('builder.upload.changeFile') : t('builder.upload.chooseFile') }}
            </button>
            <span :class="['audioUpload__name',{'audioUpload__name--missing':!fileName}]">
                {{ fileName || t('builder.fields.noFile') }}
            </span>
        </div>
        <input ref="fileInput" class="audioUpload__input" type="file" accept="audio/*" @change="upload">
        <p v-if="uploadError" class="audioUpload__error" role="alert">{{ uploadError }}</p>
    </div>
    <audio v-if="fileUrl" class="audioPlayer" :src="playableUrl" controls></audio>
</template>

<style scoped>
/* Laid out like the other block fields: the label in the left column. */
.audioUpload{
    display: grid;
    grid-template-columns: var(--block-label-width, 88px) minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: var(--space-1);
    align-items: center;
}
.audioUpload__label{
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.audioUpload__row{
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-1);
    padding-right: var(--space-3);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
}
.audioUpload__button{
    flex: none;
    min-height: 30px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease;
}
.audioUpload__button:hover:not(:disabled){ border-color: var(--primary); color: var(--primary); }
.audioUpload__button:disabled{ cursor: progress; opacity: .6; }
.audioUpload__name{
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.audioUpload__name--missing{ font-style: italic; color: var(--ink-3); }
.audioUpload__input{ display: none; }
.audioUpload__error{
    grid-column: 2;
    margin: 0;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-xs);
    color: var(--danger);
    background: var(--danger-soft);
    border-radius: var(--radius-sm);
}
.audioPlayer{
    display: block;
    width: calc(100% - var(--block-label-width, 88px) - var(--space-3));
    min-width: 0;
    height: 40px;
    margin-left: calc(var(--block-label-width, 88px) + var(--space-3));
}

</style>
