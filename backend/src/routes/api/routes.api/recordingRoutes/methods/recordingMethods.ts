// A learner's saved read-aloud recording: one per learner and content, a row in
// learner_recordings pointing at a file in uploads/recordings/. Every query is
// scoped to the learner asking, so nobody can reach another learner's recording.
import { pool } from '../../../../../config/db/db_init.js';
import { ApiError } from '../../../../../shared/errors/ApiError.js';
import { ContentMethods } from '../../contentRoutes/methods/contentMethods.js';
import { requireLearnerMayOpen } from '../../contentRoutes/functions/learnerGate.js';
import { removeRecording, sweepOrphanRecordings, writeRecording, type RecordingFormat } from '../functions/recordingFiles.js';
import type { SavedRecording, StoredRecording } from '../types/recordingType.js';

/** The refusal when the learner has no recording saved for this content. The frontend reads its 404 as "none yet". */
export const NO_SAVED_RECORDING = 'no saved recording';

type RecordingRow = { content_id: number; file_name: string; mime_type: RecordingFormat; size_bytes: number; updated_at: Date };

function toStored(row: RecordingRow): StoredRecording {
    return {
        contentId: row.content_id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        updatedAt: row.updated_at.toISOString(),
    };
}

export class RecordingMethods {
    //Refuses content the learner may not read: 404 when it is missing or not
    //approved, 403 when the learner gate says no (the reader's own rules).
    static async requireReadable(learnerId: number, contentId: number): Promise<void> {
        const content = await ContentMethods.getContent(contentId);
        if (content.status !== 'approved') throw new ApiError(404, 'content not found');
        await requireLearnerMayOpen(learnerId, content);
    }

    //The learner's saved recording for this content. 404 when there is none.
    static async getMine(learnerId: number, contentId: number): Promise<StoredRecording> {
        const { rows } = await pool.query<RecordingRow>(
            `SELECT content_id, file_name, mime_type, size_bytes, updated_at
               FROM learner_recordings WHERE learner_id = $1 AND content_id = $2`,
            [learnerId, contentId]);
        if (rows.length === 0) throw new ApiError(404, NO_SAVED_RECORDING);
        return toStored(rows[0]);
    }

    //Saves a checked recording as the learner's one for this content, replacing
    //any earlier one, whose file is then removed.
    static async save(learnerId: number, contentId: number, buffer: Buffer, mimeType: RecordingFormat): Promise<SavedRecording> {
        const fileName = await writeRecording(buffer);
        let row: RecordingRow & { previous_file: string | null };
        try {
            const { rows } = await pool.query<RecordingRow & { previous_file: string | null }>(
                `WITH previous AS (
                     SELECT file_name FROM learner_recordings WHERE learner_id = $1 AND content_id = $2
                 )
                 INSERT INTO learner_recordings (learner_id, content_id, file_name, mime_type, size_bytes)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (learner_id, content_id) DO UPDATE
                    SET file_name = EXCLUDED.file_name, mime_type = EXCLUDED.mime_type,
                        size_bytes = EXCLUDED.size_bytes, updated_at = now()
                 RETURNING content_id, file_name, mime_type, size_bytes, updated_at,
                           (SELECT file_name FROM previous) AS previous_file`,
                [learnerId, contentId, fileName, mimeType, buffer.length]);
            row = rows[0];
        } catch (e) {
            await removeRecording(fileName);
            throw e;
        }

        if (row.previous_file && row.previous_file !== fileName) await removeRecording(row.previous_file);
        const { fileName: _stored, ...saved } = toStored(row);
        return saved;
    }

    //Deletes the learner's recording for this content, row and file. 404 when there is none.
    static async remove(learnerId: number, contentId: number): Promise<void> {
        const { rows } = await pool.query<{ file_name: string }>(
            `DELETE FROM learner_recordings WHERE learner_id = $1 AND content_id = $2 RETURNING file_name`,
            [learnerId, contentId]);
        if (rows.length === 0) throw new ApiError(404, NO_SAVED_RECORDING);
        await removeRecording(rows[0].file_name);
    }

    //Removes files no recording points at any more (see sweepOrphanRecordings).
    static async sweepOrphans(): Promise<number> {
        const { rows } = await pool.query<{ file_name: string }>(`SELECT file_name FROM learner_recordings`);
        return sweepOrphanRecordings(new Set(rows.map((row) => row.file_name)));
    }
}
