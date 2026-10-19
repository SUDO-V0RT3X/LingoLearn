import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { $MyLearning, $TestAnswer, $TestResult } from "@/features/learner_experience/models/learnerTypes";

//Request definitions for learner tests and the My Learning dashboard.
export class TestAttemptEndpoints {
    //POST /api/testAttempts/submit — the server marks the answers and records the attempt.
    submit(contentId: number, answers: $TestAnswer[]): $Endpoint<$TestResult> {
        return new $Endpoint<$TestResult>({
            method: RequestMethod.POST,
            route: '/api/testAttempts/submit',
            pathParameters: null,
            queryParameters: null,
            jsonBody: { contentId, answers },
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }

    //GET /api/testAttempts/myLearning — level, statistics, history and continue reading.
    getMyLearning(): $Endpoint<$MyLearning> {
        return new $Endpoint<$MyLearning>({
            method: RequestMethod.GET,
            route: '/api/testAttempts/myLearning',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }
}
