// Shapes used by the saved read-aloud recording routes (migrations/506_learner_recordings.sql).
import type { RecordingFormat } from '../functions/recordingFiles.js';

//What the server says about a learner's saved recording; the audio itself is
//fetched from GET /api/recordings/:contentId.
export interface SavedRecording {
    contentId: number;
    mimeType: RecordingFormat;
    sizeBytes: number;
    updatedAt: string;
}

//Where a saved recording is on disk, for streaming it back.
export interface StoredRecording extends SavedRecording {
    fileName: string;
}
