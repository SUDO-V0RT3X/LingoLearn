import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type { ReviewQueueRow } from "../models/ReviewQueueTypes";

// The review queue's call. Returns the rows or a FAILED Exception, and never throws.
export class ReviewQueueDataSource {
    static async getReviewQueue(): Promise<$DataSourceResponse<ReviewQueueRow[]>> {
        try {
            const responseParser = (response: AxiosResponse) => response.data as ReviewQueueRow[];
            const response = await Endpoints.ReviewQueue.getReviewQueue().callWithParser(responseParser);

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
            console.error('Exception in ReviewQueueDataSource.getReviewQueue:', error);
            return {
                data: null,
                error: new Exception({
                    exceptionType: ExceptionType.FAILED,
                    message: 'Failed to load review queue. Please try again.',
                    statusCode: 500,
                }),
            };
        }
    }
}
