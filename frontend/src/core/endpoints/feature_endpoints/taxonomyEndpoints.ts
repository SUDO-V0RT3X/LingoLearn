// Frontend endpoint definitions for taxonomy resources: levels, tags, content_tags.

import { RequestMethod } from "@/core/http/functions/httpService";
import { $Endpoint } from "../models/EndpointType";
import type {
  LevelType,
  TagType,
  TagKind,
  CreateTagInput,
  UpdateTagInput,
  UpdateLevelInput,
  TagWithUsage,
  ContentTagType,
} from "@/features/media_feature/models/TaxonomyTypes";

export class TaxonomyEndpoints {
  // Fetch all levels
  getLevels(): $Endpoint<LevelType[]> {
    return new $Endpoint<LevelType[]>({
      method: RequestMethod.GET,
      route: '/api/taxonomy/getLevels',
      pathParameters: null,
      queryParameters: null,
      jsonBody: null,
      responseParser: null,
    });
  }

  // Update a level's rules (admin only)
  updateLevel(levelNumber: number, input: UpdateLevelInput): $Endpoint<LevelType> {
    return new $Endpoint<LevelType>({
      method: RequestMethod.PUT,
      route: `/api/taxonomy/updateLevel/${levelNumber}`,
      pathParameters: null,
      queryParameters: null,
      jsonBody: input,
      additionalHeaders: {
        'Content-Type': 'application/json',
      },
      responseParser: null,
    });
  }

  // Fetch all tags, with optional type filter ('test' | 'theme')
  getTags(filterType?: TagKind): $Endpoint<TagType[]> {
    return new $Endpoint<TagType[]>({
      method: RequestMethod.GET,
      route: '/api/taxonomy/getTags',
      pathParameters: null,
      queryParameters: filterType ? { type: filterType } : null,
      jsonBody: null,
      responseParser: null,
    });
  }

  // Create a new tag (test or theme)
  createTag(input: CreateTagInput): $Endpoint<TagType> {
    return new $Endpoint<TagType>({
      method: RequestMethod.POST,
      route: '/api/taxonomy/createTag',
      pathParameters: null,
      queryParameters: null,
      jsonBody: input,
      additionalHeaders: {
        'Content-Type': 'application/json',
      },
      responseParser: null,
    });
  }

  // Fetch tags with usage counts (admin only)
  getTagsWithUsage(filterType?: TagKind): $Endpoint<TagWithUsage[]> {
    return new $Endpoint<TagWithUsage[]>({
      method: RequestMethod.GET,
      route: '/api/taxonomy/getTagsWithUsage',
      pathParameters: null,
      queryParameters: filterType ? { type: filterType } : null,
      jsonBody: null,
      responseParser: null,
    });
  }

  // Update an existing tag (admin only)
  updateTag(tagId: number, input: UpdateTagInput): $Endpoint<TagType> {
    return new $Endpoint<TagType>({
      method: RequestMethod.PUT,
      route: `/api/taxonomy/updateTag/${tagId}`,
      pathParameters: null,
      queryParameters: null,
      jsonBody: input,
      additionalHeaders: {
        'Content-Type': 'application/json',
      },
      responseParser: null,
    });
  }

  // Delete a tag by ID (admin only)
  deleteTag(tagId: number): $Endpoint<{ message: string }> {
    return new $Endpoint<{ message: string }>({
      method: RequestMethod.DELETE,
      route: `/api/taxonomy/deleteTag/${tagId}`,
      pathParameters: null,
      queryParameters: null,
      jsonBody: null,
      responseParser: null,
    });
  }

  // Fetch tags linked to a piece of content
  getContentTags(contentId: number): $Endpoint<ContentTagType[]> {
    return new $Endpoint<ContentTagType[]>({
      method: RequestMethod.GET,
      route: `/api/taxonomy/getContentTags/${contentId}`,
      pathParameters: null,
      queryParameters: null,
      jsonBody: null,
      responseParser: null,
    });
  }
}
