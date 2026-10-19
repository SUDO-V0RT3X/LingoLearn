import { computed, ref, onBeforeUnmount, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

//What the reader screen gets back: the recorder's state plus its controls.
export interface MicRecorder {
    isRecording: Ref<boolean>;
    hasRecording: Ref<boolean>;
    recordedUrl: Ref<string | null>;
    //The current recording itself, for saving it; null when there is none.
    recordedBlob: Ref<Blob | null>;
    //Why recording could not start, in the interface language; null when it did.
    error: Readonly<Ref<string | null>>;
    start: () => Promise<void>;
    stop: () => void;
    reset: () => void;
    //Makes a recording saved earlier the current one, as if just recorded.
    load: (recording: Blob) => void;
    //Calls back with each new recording the learner finishes (not one loaded).
    onRecorded: (callback: (recording: Blob) => void) => void;
}

//Records the learner reading aloud. Call it from a component's setup. The clip
//is an in-memory Blob URL; saving it to the learner's account is
//useSavedRecording's job, which listens through onRecorded.
export function useMicRecorder(): MicRecorder {
    const isRecording = ref(false)
    const hasRecording = ref(false)
    const recordedUrl = ref<string | null>(null)
    const recordedBlob = ref<Blob | null>(null)
    const micFailed = ref(false)
    const { t } = useI18n()
    const error = computed<string | null>(() => micFailed.value ? t('learner.recording.micError') : null)

    let mediaRecorder: MediaRecorder | null = null
    let chunks: Blob[] = []
    let stream: MediaStream | null = null
    const listeners: Array<(recording: Blob) => void> = []
    //Set on unmount: a recording cut off by leaving the page is dropped, not kept or saved.
    let unmounted = false

    //Makes this clip the current recording, freeing the previous one's URL.
    function use(recording: Blob): void {
        if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
        recordedBlob.value = recording
        recordedUrl.value = URL.createObjectURL(recording)
        hasRecording.value = true
    }

    async function start(): Promise<void> {
        micFailed.value = false
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            chunks = []
            const recorder = new MediaRecorder(stream)
            mediaRecorder = recorder
            recorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) chunks.push(event.data)
            }
            recorder.onstop = () => {
                if (unmounted) return
                //The browser's own format: WebM in Chrome and Firefox, MP4 in Safari.
                const type = recorder.mimeType || chunks[0]?.type || 'audio/webm'
                const recording = new Blob(chunks, { type })
                use(recording)
                stream?.getTracks().forEach((track) => track.stop())
                for (const listener of listeners) listener(recording)
            }
            recorder.start()
            isRecording.value = true
        } catch {
            micFailed.value = true
        }
    }

    function stop(): void {
        if (mediaRecorder && isRecording.value) {
            mediaRecorder.stop()
            isRecording.value = false
        }
    }

    function reset(): void {
        if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
        recordedUrl.value = null
        recordedBlob.value = null
        hasRecording.value = false
    }

    function load(recording: Blob): void {
        use(recording)
    }

    function onRecorded(callback: (recording: Blob) => void): void {
        listeners.push(callback)
    }

    //Without this the microphone stays on in the tab after navigating away.
    onBeforeUnmount(() => {
        unmounted = true
        stream?.getTracks().forEach((track) => track.stop())
        if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
    })

    return { isRecording, hasRecording, recordedUrl, recordedBlob, error, start, stop, reset, load, onRecorded }
}
