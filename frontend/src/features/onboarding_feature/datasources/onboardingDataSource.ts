// Import API endpoint definitions and configuration
import { Endpoints } from '@/core/endpoints/endpoints';
// Import custom exception models for error handling and error classification
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
// Import standardized response wrapper for data sources
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType';
// Import Axios response type definition
import type { AxiosResponse } from 'axios';
// Import data transfer models specifically for the onboarding feature
import type { ChildDateOfBirth, LearnerAccess, OnboardingInput, OnboardingSettings } from '../models/OnboardingTypes';

/**
 * Helper function to generate a standardized failure response wrapper
 * when an unhandled execution exception or network failure occurs.
 * 
 * @template T - The expected data payload type
 * @param message - The user-friendly error message to attach to the exception
 * @returns A standardized data source response object with null data and a populated exception
 */
function failedResponse<T>(message: string): $DataSourceResponse<T> {
  return {
    data: null,
    error: new Exception({
      exceptionType: ExceptionType.FAILED,
      message,
      statusCode: 500,
    }),
  };
}

/**
 * Data Source class handling all remote API calls related to learner onboarding.
 * Encapsulates network communication and maps backend responses into strongly typed frontend models.
 */
export class OnboardingDataSource {

  /**
   * Fetches the learner's saved onboarding configuration and settings from the server.
   * 
   * @returns A promise resolving to a standardized response containing either the `OnboardingSettings` or an `Exception`.
   */
  static async getSettings(): Promise<$DataSourceResponse<OnboardingSettings>> {
    try {
      // Parser callback to cast the raw Axios HTTP response data to the target model type
      const parser = (response: AxiosResponse) => response.data as OnboardingSettings;
      
      // Execute the GET endpoint call passing the response parser
      const response = await Endpoints.Onboarding.getSettings().callWithParser(parser);
      
      // Check if the API request returned an explicit error or missing payload
      if (response.error != null || response.data == null) {
        return { 
          data: null, 
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No onboarding settings returned.',
            statusCode: 500,
          }) 
        };
      }
      
      // Return successful response with parsed data
      return { data: response.data, error: null };
    } catch (error) {
      // Catch unexpected code execution failures, log them, and return a safe fallback error
      console.error('Exception in OnboardingDataSource.getSettings:', error);
      return failedResponse('Failed to load learner setup. Please try again.');
    }
  }

  /**
   * Sends user-selected onboarding preferences to the backend to be persisted.
   * 
   * @param input - The payload containing the target language, birth year, interface language, and daily goal
   * @returns A promise resolving to a standardized response containing the updated `OnboardingSettings` or an `Exception`.
   */
  static async saveSettings(input: OnboardingInput): Promise<$DataSourceResponse<OnboardingSettings>> {
    try {
      // Parser callback to cast the raw Axios HTTP response data to the target model type
      const parser = (response: AxiosResponse) => response.data as OnboardingSettings;
      
      // Execute the POST/PUT endpoint call with the input payload and response parser
      const response = await Endpoints.Onboarding.saveSettings(input).callWithParser(parser);
      
      // Check if the API request returned an explicit error or missing payload
      if (response.error != null || response.data == null) {
        return { 
          data: null, 
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No onboarding settings returned.',
            statusCode: 500,
          }) 
        };
      }
      
      // Return successful response with newly saved data settings
      return { data: response.data, error: null };
    } catch (error) {
      // Catch unexpected code execution failures, log them, and return a safe fallback error
      console.error('Exception in OnboardingDataSource.saveSettings:', error);
      return failedResponse('Failed to save learner setup. Please try again.');
    }
  }

  /**
   * Fetches the learner's evaluated access permissions based on their stored age and parent links.
   * 
   * @returns A promise resolving to a standardized response containing either `LearnerAccess` or an `Exception`.
   */
  static async getAccess(): Promise<$DataSourceResponse<LearnerAccess>> {
    try {
      // Parser callback to cast the raw Axios HTTP response data to the LearnerAccess model type
      const parser = (response: AxiosResponse) => response.data as LearnerAccess;
      
      // Execute the GET endpoint call passing the response parser
      const response = await Endpoints.Onboarding.getAccess().callWithParser(parser);
      
      // Check if the API request returned an explicit error or missing payload
      if (response.error != null || response.data == null) {
        return { 
          data: null, 
          error: response.error ?? new Exception({
            exceptionType: ExceptionType.FAILED,
            message: 'No learner access information returned.',
            statusCode: 500,
          }) 
        };
      }
      
      // Return successful response with parsed access permissions
      return { data: response.data, error: null };
    } catch (error) {
      // Catch unexpected code execution failures, log them, and return a safe fallback error
      console.error('Exception in OnboardingDataSource.getAccess:', error);
      return failedResponse('Failed to evaluate learner access. Please try again.');
    }
  }

  /**
   * A linked guardian reads a child's saved date of birth.
   *
   * @param childId - The linked child's learner id
   */
  static async getChildDateOfBirth(childId: number): Promise<$DataSourceResponse<ChildDateOfBirth>> {
    try {
      const parser = (response: AxiosResponse) => response.data as ChildDateOfBirth;
      const response = await Endpoints.Onboarding.getChildDateOfBirth(childId).callWithParser(parser);
      if (response.error != null || response.data == null) {
        return { data: null, error: response.error ?? new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'No date of birth returned.',
          statusCode: 500,
        }) };
      }
      return { data: response.data, error: null };
    } catch (error) {
      console.error('Exception in OnboardingDataSource.getChildDateOfBirth:', error);
      return failedResponse("Failed to load your child's date of birth. Please try again.");
    }
  }

  /**
   * A linked guardian corrects a child's date of birth.
   *
   * @param childId - The linked child's learner id
   * @param dateOfBirth - The corrected date, 'YYYY-MM-DD'
   */
  static async setChildDateOfBirth(childId: number, dateOfBirth: string): Promise<$DataSourceResponse<ChildDateOfBirth>> {
    try {
      const parser = (response: AxiosResponse) => response.data as ChildDateOfBirth;
      const response = await Endpoints.Onboarding.setChildDateOfBirth(childId, dateOfBirth).callWithParser(parser);
      if (response.error != null || response.data == null) {
        return { data: null, error: response.error ?? new Exception({
          exceptionType: ExceptionType.FAILED,
          message: 'No date of birth returned.',
          statusCode: 500,
        }) };
      }
      return { data: response.data, error: null };
    } catch (error) {
      console.error('Exception in OnboardingDataSource.setChildDateOfBirth:', error);
      return failedResponse("Failed to save your child's date of birth. Please try again.");
    }
  }
}
