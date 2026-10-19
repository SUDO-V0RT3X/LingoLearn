import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { $SavedRecording } from "../models/learnerTypes";

// A learner's saved read-aloud recording (one per piece of content). Every
// method returns data or an Exception, and never throws.

const failed = (message: string) => new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode: 500 });

//The name the upload carries, from what the browser recorded. The server reads
//the type and the first bytes, never the name; this only keeps it readable.
export function recordingFileName(type: string): string {
    const bare = type.split(';')[0].trim().toLowerCase();
    if (bare === 'audio/ogg') return 'recording.ogg';
    if (bare === 'audio/mp4' || bare === 'audio/x-m4a' || bare === 'audio/m4a') return 'recording.m4a';
    return 'recording.webm';
}

export class RecordingDataSource {
    //The learner's saved recording for this content as audio; data is null when
    //they have none yet (404), error is set for anything else.
    static async getMine(contentId: number): Promise<$DataSourceResponse<Blob | null>> {
        try {
            const response = await Endpoints.Recordings.getMine(contentId)
                .callWithParser((result: AxiosResponse) => result.data as Blob);
            if (response.error?.statusCode === 404) return new $DataSourceResponse<Blob | null>(null, null);
            if (response.error != null || !(response.data instanceof Blob) || response.data.size === 0) {
                return new $DataSourceResponse<Blob | null>(null, response.error ?? failed('Failed to load your recording.'));
            }
            return new $DataSourceResponse<Blob | null>(response.data, null);
        } catch (error) {
            console.error('Exception in RecordingDataSource.getMine:', error);
            return new $DataSourceResponse<Blob | null>(null, failed('Failed to load your recording.'));
        }
    }

    //Saves the recording to the learner's account, replacing any earlier one.
    static async save(contentId: number, recording: Blob): Promise<$DataSourceResponse<$SavedRecording>> {
        try {
            const response = await Endpoints.Recordings.save(contentId, recording, recordingFileName(recording.type))
                .callWithParser((result: AxiosResponse) => result.data as $SavedRecording);
            if (response.error != null || response.data == null) {
                return new $DataSourceResponse<$SavedRecording>(null, response.error ?? failed('Failed to save your recording.'));
            }
            return response;
        } catch (error) {
            console.error('Exception in RecordingDataSource.save:', error);
            return new $DataSourceResponse<$SavedRecording>(null, failed('Failed to save your recording.'));
        }
    }

    //Deletes the learner's recording. One that was already gone (404) counts as deleted.
    static async remove(contentId: number): Promise<$DataSourceResponse<true>> {
        try {
            const response = await Endpoints.Recordings.remove(contentId).callWithParser(() => null);
            if (response.error != null && response.error.statusCode !== 404) {
                return new $DataSourceResponse<true>(null, response.error);
            }
            return new $DataSourceResponse<true>(true, null);
        } catch (error) {
            console.error('Exception in RecordingDataSource.remove:', error);
            return new $DataSourceResponse<true>(null, failed('Failed to delete your recording.'));
        }
    }
}
