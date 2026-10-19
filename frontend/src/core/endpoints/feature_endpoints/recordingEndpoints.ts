import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { $SavedRecording } from "@/features/learner_experience/models/learnerTypes";

//Request definitions for a learner's saved read-aloud recording. Each acts on
//the signed-in learner's own recording for one piece of content.
export class RecordingEndpoints {
    //GET /api/recordings/:contentId — the audio, as a Blob (an <audio src> could
    //not send the Authorization header). 404 when none is saved.
    getMine(contentId: number): $Endpoint<Blob> {
        return new $Endpoint<Blob>({
            method: RequestMethod.GET,
            route: '/api/recordings',
            pathParameters: [String(contentId)],
            responseType: 'blob',
            responseParser: null,
        });
    }

    //PUT /api/recordings/:contentId — saves the recording, replacing any earlier one.
    save(contentId: number, recording: Blob, filename: string): $Endpoint<$SavedRecording> {
        const form = new FormData();
        form.append('file', recording, filename);
        return new $Endpoint<$SavedRecording>({
            method: RequestMethod.PUT,
            route: '/api/recordings',
            pathParameters: [String(contentId)],
            formData: form,
            responseParser: null,
        });
    }

    //DELETE /api/recordings/:contentId — removes it. 404 when there was none.
    remove(contentId: number): $Endpoint<null> {
        return new $Endpoint<null>({
            method: RequestMethod.DELETE,
            route: '/api/recordings',
            pathParameters: [String(contentId)],
            responseParser: null,
        });
    }
}
