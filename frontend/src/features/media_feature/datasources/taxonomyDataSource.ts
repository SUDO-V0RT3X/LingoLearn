// Data source for taxonomy operations (levels, tags, content tags).

import { Endpoints } from "@/core/endpoints/endpoints";
import { Exception, ExceptionType } from "@/core/exceptions/models/ExceptionType";
import { $DataSourceResponse } from "@/core/http/models/DataSourceResponseType";
import type { AxiosResponse } from "axios";
import type {
  LevelType,
  TagType,
  TagKind,
  CreateTagInput,
  UpdateTagInput,
  UpdateLevelInput,
  TagWithUsage,
  ContentTagType,
} from "../models/TaxonomyTypes";
import { mediaT } from "../functions/localizeMediaMessage";

// This file's own fallback messages, in the interface language.
const t = (key: string) => mediaT(`media.taxonomy.errors.${key}`);

export class TaxonomyDataSource {
  // Fetch all reading/learning levels
  static async getLevels(): Promise<$DataSourceResponse<LevelType[]>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as LevelType[];
      const response = await Endpoints.Taxonomy.getLevels().callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('loadLevels'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('loadLevelsRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Update a level's rules (admin only)
  static async updateLevel(levelNumber: number, input: UpdateLevelInput): Promise<$DataSourceResponse<LevelType>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as LevelType;
      const response = await Endpoints.Taxonomy.updateLevel(levelNumber, input).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('updateLevel'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('updateLevelRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Fetch tags, with optional type filtering ('test' | 'theme')
  static async getTags(filterType?: TagKind): Promise<$DataSourceResponse<TagType[]>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as TagType[];
      const response = await Endpoints.Taxonomy.getTags(filterType).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('loadTags'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('loadTagsRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Create a new tag (test or theme)
  static async createTag(input: CreateTagInput): Promise<$DataSourceResponse<TagType>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as TagType;
      const response = await Endpoints.Taxonomy.createTag(input).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('createTag'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('createTagRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Fetch tags with usage counts (admin only)
  static async getTagsWithUsage(filterType?: TagKind): Promise<$DataSourceResponse<TagWithUsage[]>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as TagWithUsage[];
      const response = await Endpoints.Taxonomy.getTagsWithUsage(filterType).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('loadUsage'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('loadUsageRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Update an existing tag (admin only)
  static async updateTag(tagId: number, input: UpdateTagInput): Promise<$DataSourceResponse<TagType>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as TagType;
      const response = await Endpoints.Taxonomy.updateTag(tagId, input).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('updateTag'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('updateTagRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Delete a tag by ID (admin only)
  static async deleteTag(tagId: number): Promise<$DataSourceResponse<{ message: string }>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as { message: string };
      const response = await Endpoints.Taxonomy.deleteTag(tagId).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('deleteTag'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('deleteTagRetry'),
          statusCode: 500,
        }),
      };
    }
  }

  // Fetch tags associated with a specific piece of content
  static async getContentTags(contentId: number): Promise<$DataSourceResponse<ContentTagType[]>> {
    try {
      const responseParser = (res: AxiosResponse) => res.data as ContentTagType[];
      const response = await Endpoints.Taxonomy.getContentTags(contentId).callWithParser(responseParser);

      if (response.error != null || response.data == null) {
        return {
          data: null,
          error: response.error || new Exception({
            exceptionType: ExceptionType.FAILED,
            message: t('loadContentTags'),
            statusCode: 500,
          }),
        };
      }

      return { data: response.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: new Exception({
          exceptionType: ExceptionType.FAILED,
          message: t('loadContentTagsRetry'),
          statusCode: 500,
        }),
      };
    }
  }
}
