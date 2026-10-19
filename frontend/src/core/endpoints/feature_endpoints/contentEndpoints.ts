import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { $ApprovedContentFilter, $ContentDraft, $ContentRecord, $ContentSubmission, $ContentSummary } from "@/features/shared/models/contentType";

//Request definitions for the content API.
export class ContentEndpoints {
    //GET /api/content/getContent/:contentId
    getContent(contentId: number): $Endpoint<$ContentRecord> {
        return new $Endpoint<$ContentRecord>({
            method: RequestMethod.GET,
            route: '/api/content/getContent',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //GET /api/content/getMyContent — everything this author has written.
    getMyContent(): $Endpoint<$ContentSummary[]> {
        return new $Endpoint<$ContentSummary[]>({
            method: RequestMethod.GET,
            route: '/api/content/getMyContent',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //GET /api/content/getPendingContent — the moderator's review queue.
    getPendingContent(): $Endpoint<$ContentSummary[]> {
        return new $Endpoint<$ContentSummary[]>({
            method: RequestMethod.GET,
            route: '/api/content/getPendingContent',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //GET /api/content/getApprovedContent — what a learner may read.
    getApprovedContent(filter: $ApprovedContentFilter = {}): $Endpoint<$ContentSummary[]> {
        const queryParameters: Record<string, string> = {};
        if (filter.level !== undefined) queryParameters.level = String(filter.level);
        if (filter.language !== undefined) queryParameters.language = filter.language;
        if (filter.childFriendlyOnly) queryParameters.childFriendlyOnly = 'true';

        return new $Endpoint<$ContentSummary[]>({
            method: RequestMethod.GET,
            route: '/api/content/getApprovedContent',
            pathParameters: null,
            queryParameters: Object.keys(queryParameters).length > 0 ? queryParameters : null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //POST /api/content/createContent with the pages and anything already filled in.
    createContent(draft: $ContentDraft): $Endpoint<$ContentRecord> {
        return new $Endpoint<$ContentRecord>({
            method: RequestMethod.POST,
            route: '/api/content/createContent',
            pathParameters: null,
            queryParameters: null,
            jsonBody: { ...draft },
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    //PUT /api/content/editContent/:contentId with the pages and draft fields.
    editContent(contentId: number, draft: $ContentDraft): $Endpoint<$ContentRecord> {
        return new $Endpoint<$ContentRecord>({
            method: RequestMethod.PUT,
            route: '/api/content/editContent',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: { ...draft },
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    //POST /api/content/submitContent/:contentId with content, level and chosen tags.
    submitContent(contentId: number, submission: $ContentSubmission): $Endpoint<$ContentRecord> {
        return new $Endpoint<$ContentRecord>({
            method: RequestMethod.POST,
            route: '/api/content/submitContent',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: submission,
            additionalHeaders: {
                'Content-Type': 'application/json',
            },
            responseParser: null,
        });
    }

    //DELETE /api/content/deleteContent/:contentId
    deleteContent(contentId: number): $Endpoint<{ message: string }> {
        return new $Endpoint<{ message: string }>({
            method: RequestMethod.DELETE,
            route: '/api/content/deleteContent',
            pathParameters: [String(contentId)],
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }
}
