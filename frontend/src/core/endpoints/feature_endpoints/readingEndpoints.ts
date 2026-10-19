import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { $ReadingProgress } from "@/features/learner_experience/models/learnerTypes";

//Request definitions for saved reading progress.
export class ReadingEndpoints {
    //PUT /api/reading/saveProgress/:contentId with the 0-based page the learner is on.
    saveProgress(contentId: number, page: number, totalPages: number): $Endpoint<$ReadingProgress> {
        return new $Endpoint<$ReadingProgress>({
            method: RequestMethod.PUT,
            route: '/api/reading/saveProgress',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: { page, totalPages },
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }

    //GET /api/reading/getProgress/:contentId — the page to resume at.
    getProgress(contentId: number): $Endpoint<$ReadingProgress> {
        return new $Endpoint<$ReadingProgress>({
            method: RequestMethod.GET,
            route: '/api/reading/getProgress',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }
}
