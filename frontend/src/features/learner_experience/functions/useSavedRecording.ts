import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { RecordingDataSource } from '@/features/learner_experience/datasources/recordingDataSource'
import type { MicRecorder } from './useMicRecorder'

//Where the learner's recording stands with their account:
//  unsaved      — nothing on the account yet
//  loading      — fetching the one saved last time
//  saving       — sending a new recording
//  saved        — the current recording is the one on the account
//  saveFailed   — the new recording could not be saved; it still plays here
//  loadFailed   — a saved recording exists but could not be fetched
//  deleting / deleteFailed — removing it from the account
export type RecordingSaveStatus =
    | 'unsaved' | 'loading' | 'saving' | 'saved' | 'saveFailed' | 'loadFailed' | 'deleting' | 'deleteFailed'

export interface SavedRecording {
    //null when recordings are not kept on an account here (no content id).
    status: Ref<RecordingSaveStatus | null>;
    //Deletes the recording: from the account when it is kept there, and from the page.
    remove: () => Promise<void>;
}

//Keeps a learner's read-aloud recording on their account for one piece of
//content: loads last time's on opening, saves each new one, and deletes it on
//request. Without a content id it keeps nothing and "delete" only clears the
//recording from the page: the viewer passes none for the builder's preview and
//for content with no example reading, where a recording is a temporary take. Call from setup, once per
//content: the viewer is remounted for each piece of content.
export function useSavedRecording(contentId: number | null, mic: MicRecorder): SavedRecording {
    const status = ref<RecordingSaveStatus | null>(contentId == null ? null : 'unsaved')

    if (contentId == null) {
        return { status, remove: async () => mic.reset() }
    }

    //Bumped by every new recording and every delete, so a slower earlier answer
    //can never overwrite what the learner did since.
    let generation = 0
    let active = true

    async function loadSaved(): Promise<void> {
        const started = generation
        status.value = 'loading'
        const response = await RecordingDataSource.getMine(contentId!)
        if (!active || started !== generation) return
        if (response.error) {
            status.value = 'loadFailed'
        } else if (response.data) {
            mic.load(response.data)
            status.value = 'saved'
        } else {
            status.value = 'unsaved'
        }
    }

    async function save(recording: Blob): Promise<void> {
        const mine = ++generation
        status.value = 'saving'
        const response = await RecordingDataSource.save(contentId!, recording)
        if (!active || mine !== generation) return
        status.value = response.error ? 'saveFailed' : 'saved'
    }

    async function remove(): Promise<void> {
        const mine = ++generation
        status.value = 'deleting'
        const response = await RecordingDataSource.remove(contentId!)
        if (!active || mine !== generation) return
        if (response.error) {
            status.value = 'deleteFailed'
            return
        }
        mic.reset()
        status.value = 'unsaved'
    }

    mic.onRecorded((recording) => { void save(recording) })
    onMounted(() => { void loadSaved() })
    onBeforeUnmount(() => { active = false })

    return { status, remove }
}
