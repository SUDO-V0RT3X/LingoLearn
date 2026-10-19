import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { ReviewQueueRow } from "@/features/review_queue_feature/models/ReviewQueueTypes";

// GET /api/reviewQueue/getReviewQueue: everything waiting for a moderator's decision.
export class ReviewQueueEndpoints {
    getReviewQueue(): $Endpoint<ReviewQueueRow[]> {
        return new $Endpoint<ReviewQueueRow[]>({
            method: RequestMethod.GET,
            route: '/api/reviewQueue/getReviewQueue',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

}
