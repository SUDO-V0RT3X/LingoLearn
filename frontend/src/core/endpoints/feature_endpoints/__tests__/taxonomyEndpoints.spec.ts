import { describe, it, expect } from 'vitest';
import { TaxonomyEndpoints } from '../taxonomyEndpoints';
import { RequestMethod } from '@/core/http/functions/httpService';

describe('TaxonomyEndpoints', () => {
  const endpoints = new TaxonomyEndpoints();

  it('getLevels builds GET endpoint for /api/taxonomy/getLevels', () => {
    const endpoint = endpoints.getLevels();
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getLevels');
    expect(endpoint.queryParameters).toBeNull();
    expect(endpoint.jsonBody).toBeNull();
  });

  it('getTags without filter builds GET endpoint for /api/taxonomy/getTags without query parameters', () => {
    const endpoint = endpoints.getTags();
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getTags');
    expect(endpoint.queryParameters).toBeNull();
  });

  it('getTags with filter builds GET endpoint for /api/taxonomy/getTags with type query param', () => {
    const endpoint = endpoints.getTags('theme');
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getTags');
    expect(endpoint.queryParameters).toEqual({ type: 'theme' });

    const testEndpoint = endpoints.getTags('test');
    expect(testEndpoint.queryParameters).toEqual({ type: 'test' });
  });

  it('createTag builds POST endpoint for /api/taxonomy/createTag with jsonBody and headers', () => {
    const tagInput = {
      name: 'nature',
      tag_type: 'theme' as const,
      description: 'Flora and fauna',
    };
    const endpoint = endpoints.createTag(tagInput);

    expect(endpoint.method).toBe(RequestMethod.POST);
    expect(endpoint.route).toBe('/api/taxonomy/createTag');
    expect(endpoint.jsonBody).toEqual(tagInput);
    expect(endpoint.additionalHeaders).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('getContentTags builds GET endpoint for /api/taxonomy/getContentTags/:contentId', () => {
    const endpoint = endpoints.getContentTags(42);
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getContentTags/42');
    expect(endpoint.jsonBody).toBeNull();
  });

  it('getTagsWithUsage builds GET endpoint for /api/taxonomy/getTagsWithUsage without filter', () => {
    const endpoint = endpoints.getTagsWithUsage();
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getTagsWithUsage');
    expect(endpoint.queryParameters).toBeNull();
    expect(endpoint.jsonBody).toBeNull();
  });

  it('getTagsWithUsage builds GET endpoint for /api/taxonomy/getTagsWithUsage with type filter', () => {
    const endpoint = endpoints.getTagsWithUsage('theme');
    expect(endpoint.method).toBe(RequestMethod.GET);
    expect(endpoint.route).toBe('/api/taxonomy/getTagsWithUsage');
    expect(endpoint.queryParameters).toEqual({ type: 'theme' });
  });

  it('updateTag builds PUT endpoint for /api/taxonomy/updateTag/:tagId with jsonBody and headers', () => {
    const updateInput = { name: 'folklore', tag_type: 'theme' as const, description: 'Updated' };
    const endpoint = endpoints.updateTag(10, updateInput);
    expect(endpoint.method).toBe(RequestMethod.PUT);
    expect(endpoint.route).toBe('/api/taxonomy/updateTag/10');
    expect(endpoint.jsonBody).toEqual(updateInput);
    expect(endpoint.additionalHeaders).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('deleteTag builds DELETE endpoint for /api/taxonomy/deleteTag/:tagId', () => {
    const endpoint = endpoints.deleteTag(10);
    expect(endpoint.method).toBe(RequestMethod.DELETE);
    expect(endpoint.route).toBe('/api/taxonomy/deleteTag/10');
    expect(endpoint.jsonBody).toBeNull();
  });

  it('updateLevel builds PUT endpoint for /api/taxonomy/updateLevel/:levelNumber with jsonBody and headers', () => {
    const updateInput = { name: 'Intermediate', pass_mark: 75 };
    const endpoint = endpoints.updateLevel(3, updateInput);
    expect(endpoint.method).toBe(RequestMethod.PUT);
    expect(endpoint.route).toBe('/api/taxonomy/updateLevel/3');
    expect(endpoint.jsonBody).toEqual(updateInput);
    expect(endpoint.additionalHeaders).toEqual({
      'Content-Type': 'application/json',
    });
  });
});
