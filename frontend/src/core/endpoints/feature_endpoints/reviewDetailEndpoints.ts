import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { AuthorFeedbackRow, ReviewDetailRow } from "@/features/review_detail_feature/models/ReviewDetailTypes";

export class ReviewDetailEndpoints {
    //GET /api/reviewDetail/getMyFeedback — decisions on the author's own content.
    getMyFeedback(): $Endpoint<AuthorFeedbackRow[]> {
        return new $Endpoint<AuthorFeedbackRow[]>({
            method: RequestMethod.GET,
            route: '/api/reviewDetail/getMyFeedback',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //POST /api/reviewDetail/decideContent/:id — approve or reject, with a reason
    //when rejecting. The reply is the content with its decision history.
    decideContent(id: number, decision: 'approved' | 'rejected', reason: string): $Endpoint<ReviewDetailRow> {
        return new $Endpoint<ReviewDetailRow>({
            method: RequestMethod.POST,
            route: '/api/reviewDetail/decideContent',
            pathParameters: [String(id)],
            queryParameters: null,
            jsonBody: { decision, reason },
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }

    getReviewDetail(id: number): $Endpoint<ReviewDetailRow> {
        return new $Endpoint<ReviewDetailRow>({
            method: RequestMethod.GET,
            route: '/api/reviewDetail/getReviewDetail',
            pathParameters: [String(id)],
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }
}