import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { ChallengeAnswer, ChallengeOutcome, EligibilityReport, SavedChallengeAnswers, StartedChallenge } from "../models/ProgressTypes";

//shared by all the methods below
function normalize<T>(response: { data: T | null; error: Exception | null }, failMessage: string): $DataSourceResponse<T> {
    if (response.error != null || response.data == null) {
        return {
            data: null, //prefers the endpoint's own error if it has one
            error: response.error || new Exception({ exceptionType: ExceptionType.FAILED, message: failMessage, statusCode: 500 }),
        };
    }
    return { data: response.data, error: null };
}

function failed<T>(message: string): $DataSourceResponse<T> {
    return { data: null, error: new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode: 500 }) };
}

//The level-up challenge's calls. Every method returns data or an Exception
//carrying the server's status and reason, and never throws.
export class ProgressDataSource {
    //LIN-46: the full breakdown: level, tests passed, eligible or why not, cooldown
    static async checkEligibility(): Promise<$DataSourceResponse<EligibilityReport>> {
        const message = 'Could not check whether you can level up. Please try again.';
        try {
            const responseParser = (response: AxiosResponse) => response.data as EligibilityReport;
            return normalize(await Endpoints.Progress.checkEligibility().callWithParser(responseParser), message);
        } catch {
            return failed(message);
        }
    }

    //reads the learner's real current level from learner_levels table
    static async getMyLevel(): Promise<$DataSourceResponse<{ level: number }>> {
        const message = 'Failed to load your level. Please try again.';
        try {
            const responseParser = (response: AxiosResponse) => response.data as { level: number };
            return normalize(await Endpoints.Progress.getMyLevel().callWithParser(responseParser), message);
        } catch {
            return failed(message);
        }
    }

    //LIN-47: starts the challenge (or resumes the one already started)
    static async startChallenge(): Promise<$DataSourceResponse<StartedChallenge>> {
        const message = 'Could not start the challenge. Please try again.';
        try {
            const responseParser = (response: AxiosResponse) => response.data as StartedChallenge;
            return normalize(await Endpoints.Progress.startChallenge().callWithParser(responseParser), message);
        } catch {
            return failed(message);
        }
    }

    //Keeps the answers to the questions moved past on the server, so leaving and
    //resuming carries on from the next question. Nothing is marked here.
    static async saveChallengeAnswers(challengeId: number, answers: ChallengeAnswer[]): Promise<$DataSourceResponse<SavedChallengeAnswers>> {
        const message = 'Your answers so far were not saved.';
        try {
            const responseParser = (response: AxiosResponse) => response.data as SavedChallengeAnswers;
            return normalize(await Endpoints.Progress.saveChallengeAnswers(challengeId, answers).callWithParser(responseParser), message);
        } catch {
            return failed(message);
        }
    }

    //LIN-48/49: sends the answers; the server marks them, then levels up or starts the cooldown
    static async submitChallenge(challengeId: number, answers: ChallengeAnswer[]): Promise<$DataSourceResponse<ChallengeOutcome>> {
        const message = 'Your answers were not sent. Please try again.';
        try {
            const responseParser = (response: AxiosResponse) => response.data as ChallengeOutcome;
            return normalize(await Endpoints.Progress.submitChallenge(challengeId, answers).callWithParser(responseParser), message);
        } catch {
            return failed(message);
        }
    }
}
