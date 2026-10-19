import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { AuthorFeedbackRow, ReviewDetailRow } from "../models/ReviewDetailTypes";

// The moderation screen's calls. Every method returns data or a FAILED
// Exception, and never throws.
export class ReviewDetailDataSource {
    //Loads the decisions made on the signed-in author's own content.
    static async getMyFeedback(): Promise<$DataSourceResponse<AuthorFeedbackRow[]>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as AuthorFeedbackRow[];
            const response = await Endpoints.ReviewDetail.getMyFeedback().callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'Failed to load your feedback. Please try again.',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ReviewDetailDataSource.getMyFeedback:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to load your feedback. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    //Records the moderator's decision and returns the updated content.
    static async decideContent(id: number, decision: 'approved' | 'rejected', reason: string): Promise<$DataSourceResponse<ReviewDetailRow>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as ReviewDetailRow;
            const response = await Endpoints.ReviewDetail.decideContent(id, decision, reason).callWithParser(responseParser);

            if (response.error != null || response.data == null) {
                return {
                    data: null,
                    error: response.error || new Exception({
                        exceptionType: ExceptionType.FAILED,
                        message: 'The decision was not saved. Please try again.',
                        statusCode: 500,
                    }),
                };
            }

            return { data: response.data, error: null };
        } catch (error) {
            console.error('Exception in ReviewDetailDataSource.decideContent:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'The decision was not saved. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }

    static async getReviewDetail(id: number): Promise<$DataSourceResponse<ReviewDetailRow>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as ReviewDetailRow;
            const response = await Endpoints.ReviewDetail.getReviewDetail(id).callWithParser(responseParser);

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
            console.error('Exception in ReviewDetailDataSource.getReviewDetail:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to load item. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }
}
