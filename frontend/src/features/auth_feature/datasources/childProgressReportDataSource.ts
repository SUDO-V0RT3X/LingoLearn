// This datasource calls the one read-only child progress report endpoint.
import { Endpoints } from '@/core/endpoints/endpoints'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import type { AxiosResponse } from 'axios'
import type { ChildProgressReport, ReportLanguage } from '../models/childProgressReportType'

// This helper creates the bearer header used by the protected report route.
function authorizationHeader(token?: string | null): Record<string, string> {
  // Return the Authorization header when a session token exists.
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// This helper converts an unexpected request failure into the shared response type.
function failedReportRequest(): $DataSourceResponse<ChildProgressReport> {
  // Return a frontend exception when no HTTP response was available.
  return new $DataSourceResponse<ChildProgressReport>(
    null,
    new Exception({
      exceptionType: ExceptionType.FAILED, // Classify the failure as a general request failure.
      message: 'Failed to load child progress. Please try again.', // Display a stable retry message.
      statusCode: 500, // Record the fallback status used for unexpected failures.
    }),
  )
}

// This class exposes the report request to the Vue page.
export class ChildProgressReportDataSource {
  /** Fetches one linked learner report in the requested or active language. */
  static async getReport(
    childId: number,
    language?: ReportLanguage,
    token?: string | null,
  ): Promise<$DataSourceResponse<ChildProgressReport>> {
    try {
      // Parse the backend JSON body as the report contract.
      const parser = (response: AxiosResponse) => response.data as ChildProgressReport
      // Call the prepared endpoint with the bearer token and optional language.
      return await Endpoints.Auth.getChildProgressReport(
        authorizationHeader(token),
        childId,
        language,
      ).callWithParser(parser)
    } catch (error) {
      // Log failures that occur outside the shared endpoint response handling.
      console.error('Exception in ChildProgressReportDataSource.getReport:', error)
      // Return the shared fallback error response.
      return failedReportRequest()
    }
  }
}
