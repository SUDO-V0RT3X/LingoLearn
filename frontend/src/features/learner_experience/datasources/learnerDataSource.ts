import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { $Endpoint } from "@/core/endpoints/models/EndpointType";
import type { AxiosResponse } from "axios";
import type { $MyLearning, $ReadingProgress, $TestAnswer, $TestResult } from "../models/learnerTypes";

// The learner experience's calls to the tests, My Learning and reading-progress
// API. Every method returns data or an Exception, and never throws.

//Runs one request: the server's own error when it sent one, otherwise a FAILED
//Exception carrying this message.
async function run<T>(endpoint: () => $Endpoint<T>, message: string): Promise<$DataSourceResponse<T>> {
    const failed = () => new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode: 500 });
    try {
        const response = await endpoint().callWithParser((result: AxiosResponse) => result.data as T);
        if (response.error != null || response.data == null) {
            return { data: null, error: response.error ?? failed() };
        }
        return { data: response.data, error: null };
    } catch (error) {
        console.error('Exception in LearnerDataSource:', error);
        return { data: null, error: failed() };
    }
}

export class TestAttemptDataSource {
    //Sends the learner's answers to be marked; the result says which were right.
    static async submit(contentId: number, answers: $TestAnswer[]): Promise<$DataSourceResponse<$TestResult>> {
        return run(() => Endpoints.TestAttempts.submit(contentId, answers), 'Failed to send your answers. Please try again.');
    }

    //Loads the learner's level, statistics, history and continue reading.
    static async getMyLearning(): Promise<$DataSourceResponse<$MyLearning>> {
        return run(() => Endpoints.TestAttempts.getMyLearning(), 'Failed to load your learning. Please try again.');
    }
}

export class ReadingDataSource {
    //Remembers the 0-based page the learner is on.
    static async saveProgress(contentId: number, page: number, totalPages: number): Promise<$DataSourceResponse<$ReadingProgress>> {
        return run(() => Endpoints.Reading.saveProgress(contentId, page, totalPages), 'Failed to save your place.');
    }

    //Loads the page to resume at.
    static async getProgress(contentId: number): Promise<$DataSourceResponse<$ReadingProgress>> {
        return run(() => Endpoints.Reading.getProgress(contentId), 'Failed to load your place.');
    }
}
