import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type { ChallengeAnswer, ChallengeOutcome, EligibilityReport, SavedChallengeAnswers, StartedChallenge } from "@/features/progress_feature/models/ProgressTypes";

//describes the http calls of the level-up challenge. The server works out who
//is asking, their level and their eligibility, so nothing of that is sent.
export class ProgressEndpoints {
    //where the learner stands: level, tests passed, cooldown, and whether they may start
    checkEligibility(): $Endpoint<EligibilityReport> {
        return new $Endpoint<EligibilityReport>({
            method: RequestMethod.GET,
            route: '/api/progress/checkEligibility',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //this is used to show the learner level
    getMyLevel(): $Endpoint<{ level: number }> {
        return new $Endpoint<{ level: number }>({
            method: RequestMethod.GET,
            route: '/api/progress/getMyLevel',
            pathParameters: null,
            queryParameters: null,
            jsonBody: null,
            responseParser: null,
        });
    }

    //starts (or resumes) the challenge: the questions come without their answers
    startChallenge(): $Endpoint<StartedChallenge> {
        return new $Endpoint<StartedChallenge>({
            method: RequestMethod.POST,
            route: '/api/progress/startChallenge',
            pathParameters: null,
            queryParameters: null,
            jsonBody: {},
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }

    //keeps the answers to the questions moved past, so the challenge can be resumed
    saveChallengeAnswers(challengeId: number, answers: ChallengeAnswer[]): $Endpoint<SavedChallengeAnswers> {
        return new $Endpoint<SavedChallengeAnswers>({
            method: RequestMethod.POST,
            route: '/api/progress/saveChallengeAnswers',
            pathParameters: null,
            queryParameters: null,
            jsonBody: { challengeId, answers },
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }

    //submitting for grading: only the answers, the server marks them
    submitChallenge(challengeId: number, answers: ChallengeAnswer[]): $Endpoint<ChallengeOutcome> {
        return new $Endpoint<ChallengeOutcome>({
            method: RequestMethod.POST,
            route: '/api/progress/submitChallenge',
            pathParameters: null,
            queryParameters: null,
            jsonBody: { challengeId, answers },
            additionalHeaders: { 'Content-Type': 'application/json' },
            responseParser: null,
        });
    }
}
