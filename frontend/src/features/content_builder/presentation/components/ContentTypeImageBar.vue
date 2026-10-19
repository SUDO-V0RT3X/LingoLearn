<script setup lang="ts">

//The image block: a caption, an uploaded picture and its alt text. The picture
//is uploaded like an audio clip is (AudioUploadField): pick a file, it is
//checked and sent, and the block keeps the link the server answers with.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { fileNameFromUrl } from '@/features/content_builder/functions/fileName';
import { MediaDataSource } from '@/features/media_feature/datasources/mediaDataSource';
import { IMAGE_ACCEPT, validateImage } from '@/features/media_feature/functions/validateImage';
import { reasonOr } from '../state';

const { t } = useI18n();

//Two-way bindings for each $ImageBlockValue field.
const title = defineModel<string>('title', {default:''});
const fileUrl = defineModel<string>('fileUrl', {default:''});
const altText = defineModel<string>('altText', {default:''});

//editable shows input fields; otherwise the block renders as content.
defineProps({
  editable: {type:Boolean, default: false,},
});

//Only an uploaded image is ever loaded; anything else (an old typed link) is
//shown by name, and the server refuses it on submit.
const UPLOAD_PREFIX = '/uploads/images/';
const isUploaded = computed(() => fileUrl.value.startsWith(UPLOAD_PREFIX));

//File name shown in place of the full link.
const fileName = computed(() => fileNameFromUrl(fileUrl.value));

//Uploads are stored relative, so the preview needs the API origin put back.
const previewUrl = computed(() => isUploaded.value ? MediaDataSource.resolveUrl(fileUrl.value) : '');

const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const uploadError = ref('');
//Set when the preview cannot be loaded, so a broken picture never shows.
const previewFailed = ref(false);
watch(fileUrl, () => { previewFailed.value = false; });

//Sends the chosen picture and stores the link it comes back with. The file is
//checked in the browser first, so an unusable one never reaches the server.
async function upload(event:Event){
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadError.value = '';
    const problem = validateImage(file);
    if (problem){
        uploadError.value = problem;
        input.value = '';
        return;
    }

    isUploading.value = true;
    const result = await MediaDataSource.uploadImage(file);
    isUploading.value = false;
    input.value = '';

    if (result.error || !result.data){
        //The server's reason for a refused file, in the interface language; anything
        //else (offline, a failing server) reads as the general failure.
        uploadError.value = reasonOr(result.error, t('builder.upload.failed'));
        return;
    }

    fileUrl.value = result.data.fileUrl;
}

</script>

<template>
    <div v-if="editable" class="mediaBlockFields">
        <label class="mediaBlockField">
            <span class="mediaBlockField__label">{{ t('builder.image.caption') }}</span>
            <input class="mediaBlockField__input" type="text" v-model="title"
                   maxlength="120"
                   :placeholder="t('builder.image.captionPlaceholder')">
        </label>

        <div class="imageUpload">
            <span class="mediaBlockField__label">{{ t('builder.image.image') }}</span>
            <div class="imageUpload__body">
                <div class="imageUpload__row">
                    <button type="button" class="imageUpload__button" :disabled="isUploading"
                            @click="fileInput?.click()">
                        {{ isUploading ? t('builder.upload.uploading') : fileUrl ? t('builder.image.changeImage') : t('builder.image.chooseImage') }}
                    </button>
                    <span :class="['imageUpload__name',{'imageUpload__name--missing':!fileName}]">
                        {{ fileName || t('builder.image.noImage') }}
                    </span>
                </div>
                <input ref="fileInput" class="imageUpload__input" type="file" :accept="IMAGE_ACCEPT"
                       :aria-label="t('builder.image.chooseToUpload')" @change="upload">
                <p class="imageUpload__hint">{{ t('builder.image.formats') }}</p>
                <p v-if="uploadError" class="imageUpload__error" role="alert">{{ uploadError }}</p>
                <img v-if="previewUrl && !previewFailed" class="imageUpload__preview" :src="previewUrl"
                     :alt="altText" @error="previewFailed = true">
                <p v-else-if="fileUrl && !isUploaded" class="imageUpload__error" role="alert">
                    {{ t('builder.image.notUploaded') }}
                </p>
            </div>
        </div>

        <label class="mediaBlockField">
            <span class="mediaBlockField__label">{{ t('builder.image.altText') }}</span>
            <input class="mediaBlockField__input" type="text" v-model="altText"
                   maxlength="2000"
                   :placeholder="t('builder.image.altPlaceholder')">
        </label>
    </div>

    <!-- Read only: renders as a learner sees it. Only an uploaded image is loaded. -->
    <figure v-else class="mediaBlockPreview imageView">
        <figcaption :class="['mediaBlockPreview__title',{'mediaBlockPreview__title--empty':!title}]">
            {{ title || t('builder.image.noCaption') }}
        </figcaption>
        <img v-if="previewUrl && !previewFailed" class="imageView__img" :src="previewUrl"
             :alt="altText" @error="previewFailed = true">
        <div v-else class="imageView__frame" role="img" :aria-label="altText || t('builder.image.noDescription')">
            <span class="imageView__label">{{ t('builder.image.image') }}</span>
            <span :class="['imageView__file',{'mediaBlockPreview__missing':!fileName}]">
                {{ fileName || t('builder.fields.noFile') }}
            </span>
        </div>
        <p v-if="!altText" class="mediaBlockPreview__text mediaBlockPreview__missing">{{ t('builder.image.noAltText') }}</p>
    </figure>
</template>

<style scoped src="./blockMedia.css"></style>
<style scoped>

.imageUpload{
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
}
.imageUpload__body{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
}
.imageUpload__row{ display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.imageUpload__button{
    flex: none;
    padding: var(--space-1) var(--space-3);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--ink);
    border: 1px solid var(--rule-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
}
.imageUpload__button:hover{ background: var(--surface-2); }
.imageUpload__button:disabled{ cursor: progress; opacity: 0.6; }
.imageUpload__name{
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.imageUpload__name--missing{ font-style: italic; color: var(--ink-3); }
.imageUpload__input{ display: none; }
.imageUpload__hint{ margin: 0; font-size: var(--text-xs); color: var(--ink-3); }
.imageUpload__error{ margin: 0; font-size: var(--text-xs); color: var(--danger); }
.imageUpload__preview{
    display: block;
    max-width: 100%;
    max-height: 180px;
    object-fit: contain;
    border: 1px solid var(--rule);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
}

.imageView{ margin: 0; }
.imageView__img{
    display: block;
    width: 100%;
    max-height: 260px;
    object-fit: contain;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
}
.imageView__frame{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    height: 120px;
    padding: var(--space-2);
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    min-width: 0;
}
.imageView__label{
    font-size: var(--text-xs);
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.imageView__file{
    max-width: 100%;
    font-size: var(--text-xs);
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

</style>
