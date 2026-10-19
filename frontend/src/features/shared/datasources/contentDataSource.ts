import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { $ApprovedContentFilter, $ContentDraft, $ContentRecord, $ContentSubmission, $ContentSummary } from "../models/contentType";

// The content builder's calls to the content API. Every method returns data or a
// FAILED Exception, and never throws.
export class ContentDataSource {

    //Loads the content with this id.
    static async getContent(contentId: number): Promise<$DataSourceResponse<$ContentRecord>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as $ContentRecord;
            const response = await Endpoints.Content.getContent(contentId).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'No data returned from API',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.getContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to load this draft. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    //Lists everything the signed-in author has written.
    static async getMyContent(): Promise<$DataSourceResponse<$ContentSummary[]>> {
        return ContentDataSource.list(Endpoints.Content.getMyContent(), 'Failed to load your content. Please try again.');
    }

    //Lists everything waiting for a moderator's decision.
    static async getPendingContent(): Promise<$DataSourceResponse<$ContentSummary[]>> {
        return ContentDataSource.list(Endpoints.Content.getPendingContent(), 'Failed to load the review queue. Please try again.');
    }

    //Lists approved content a learner may read, narrowed by the filter.
    static async getApprovedContent(filter: $ApprovedContentFilter = {}): Promise<$DataSourceResponse<$ContentSummary[]>> {
        return ContentDataSource.list(Endpoints.Content.getApprovedContent(filter), 'Failed to load content. Please try again.');
    }

    //Shared by the three list calls: run the request, return rows or an Exception.
    private static async list(endpoint: { callWithParser: (parser: (response: AxiosResponse) => $ContentSummary[]) => Promise<$DataSourceResponse<$ContentSummary[]>> }, message: string): Promise<$DataSourceResponse<$ContentSummary[]>> {
        try {
            const response = await endpoint.callWithParser((result: AxiosResponse) => result.data as $ContentSummary[]);
            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message,
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.list:', error);
            return {
                data: null,
                error: new Exception({ exceptionType: ExceptionType.FAILED, message, statusCode: 500 }),
            };
        }
    }

    //Saves new content as a draft; the record returned carries its new id.
    static async createContent(draft: $ContentDraft): Promise<$DataSourceResponse<$ContentRecord>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as $ContentRecord;
            const response = await Endpoints.Content.createContent(draft).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'No data returned from API',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.createContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to save this draft. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    //Saves changes to a draft. Fails once the content has been submitted.
    static async editContent(contentId: number, draft: $ContentDraft): Promise<$DataSourceResponse<$ContentRecord>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as $ContentRecord;
            const response = await Endpoints.Content.editContent(contentId, draft).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'No data returned from API',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.editContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to save this draft. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    //Submits a draft with its level and tags for review; the record returned is pending.
    static async submitContent(contentId: number, submission: $ContentSubmission): Promise<$DataSourceResponse<$ContentRecord>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as $ContentRecord;
            const response = await Endpoints.Content.submitContent(contentId, submission).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'No data returned from API',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.submitContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to submit this draft. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    //Deletes a draft. Fails once the content has been submitted.
    static async deleteContent(contentId: number): Promise<$DataSourceResponse<{ message: string }>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as { message: string };
            const response = await Endpoints.Content.deleteContent(contentId).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'No data returned from API',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ContentDataSource.deleteContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to delete this draft. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }
}
