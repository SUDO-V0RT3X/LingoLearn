import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxonomyDataSource } from '../taxonomyDataSource';
import { Endpoints } from '@/core/endpoints/endpoints';
import type {
  LevelType,
  TagType,
  CreateTagInput,
  UpdateTagInput,
  UpdateLevelInput,
  TagWithUsage,
  ContentTagType,
} from '../../models/TaxonomyTypes';

describe('TaxonomyDataSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getLevels', () => {
    it('returns levels array when endpoint succeeds', async () => {
      const mockLevels: LevelType[] = [
        { id: 1, level_number: 1, name: 'Level 1', description: 'Beginner', pass_mark: 70, created_at: '', updated_at: '' },
        { id: 2, level_number: 2, name: 'Level 2', description: 'Elementary', pass_mark: 70, created_at: '', updated_at: '' },
      ];

      vi.spyOn(Endpoints.Taxonomy, 'getLevels').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: mockLevels, error: null }),
      } as any);

      const result = await TaxonomyDataSource.getLevels();
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockLevels);
    });

    it('returns error when endpoint returns error response', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getLevels').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } }),
      } as any);

      const result = await TaxonomyDataSource.getLevels();
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to fetch');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getLevels').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.getLevels();
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to load levels. Please try again.');
    });
  });

  describe('updateLevel', () => {
    it('returns updated level when endpoint succeeds', async () => {
      const mockUpdated: LevelType = {
        id: 3,
        level_number: 3,
        name: 'Intermediate',
        description: 'Level 3 description',
        pass_mark: 75,
        created_at: '',
        updated_at: '',
      };

      vi.spyOn(Endpoints.Taxonomy, 'updateLevel').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
      } as any);

      const result = await TaxonomyDataSource.updateLevel(3, { pass_mark: 75 });
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockUpdated);
      expect(result.data?.pass_mark).toBe(75);
    });

    it('returns error when endpoint returns error response', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'updateLevel').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: null, error: { message: 'Level not found' } }),
      } as any);

      const result = await TaxonomyDataSource.updateLevel(99, { pass_mark: 75 });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Level not found');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'updateLevel').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network failure')),
      } as any);

      const result = await TaxonomyDataSource.updateLevel(3, { pass_mark: 75 });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to update level. Please try again.');
    });
  });

  describe('getTags', () => {
    it('returns tags with optional filterType', async () => {
      const mockTags: TagType[] = [
        { id: 1, name: 'travel', tag_type: 'theme', description: 'Travel theme', created_at: '', updated_at: '' },
      ];

      const getTagsSpy = vi.spyOn(Endpoints.Taxonomy, 'getTags').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: mockTags, error: null }),
      } as any);

      const result = await TaxonomyDataSource.getTags('theme');
      expect(getTagsSpy).toHaveBeenCalledWith('theme');
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockTags);
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getTags').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.getTags();
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to load tags. Please try again.');
    });
  });

  describe('createTag', () => {
    it('creates tag successfully', async () => {
      const input: CreateTagInput = { name: 'art', tag_type: 'theme', description: 'Visual arts' };
      const createdTag: TagType = { id: 10, ...input, description: input.description ?? '', created_at: '', updated_at: '' };

      const createSpy = vi.spyOn(Endpoints.Taxonomy, 'createTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: createdTag, error: null }),
      } as any);

      const result = await TaxonomyDataSource.createTag(input);
      expect(createSpy).toHaveBeenCalledWith(input);
      expect(result.error).toBeNull();
      expect(result.data).toEqual(createdTag);
    });

    it('returns error when tag creation fails', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'createTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: null, error: { message: 'Tag already exists' } }),
      } as any);

      const result = await TaxonomyDataSource.createTag({ name: 'dup', tag_type: 'theme' });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Tag already exists');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'createTag').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.createTag({ name: 'err', tag_type: 'theme' });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to create tag. Please try again.');
    });
  });

  describe('getContentTags', () => {
    it('retrieves content tags successfully', async () => {
      const contentTags: ContentTagType[] = [
        { id: 1, content_id: 15, tag_id: 2, tag_name: 'food', tag_type: 'theme', created_at: '' },
      ];

      vi.spyOn(Endpoints.Taxonomy, 'getContentTags').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: contentTags, error: null }),
      } as any);

      const result = await TaxonomyDataSource.getContentTags(15);
      expect(result.error).toBeNull();
      expect(result.data).toEqual(contentTags);
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getContentTags').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.getContentTags(15);
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to load content tags. Please try again.');
    });
  });

  describe('getTagsWithUsage', () => {
    it('returns tags with usage counts when endpoint succeeds', async () => {
      const mockTags: TagWithUsage[] = [
        { id: 1, name: 'travel', tag_type: 'theme', description: '', created_at: '', updated_at: '', usage_count: 5 },
        { id: 2, name: 'quiz', tag_type: 'test', description: '', created_at: '', updated_at: '', usage_count: 0 },
      ];

      vi.spyOn(Endpoints.Taxonomy, 'getTagsWithUsage').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: mockTags, error: null }),
      } as any);

      const result = await TaxonomyDataSource.getTagsWithUsage();
      expect(result.error).toBeNull();
      expect(result.data).toEqual(mockTags);
    });

    it('passes filterType to endpoint when provided', async () => {
      const endpointSpy = vi.spyOn(Endpoints.Taxonomy, 'getTagsWithUsage').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: [], error: null }),
      } as any);

      await TaxonomyDataSource.getTagsWithUsage('theme');
      expect(endpointSpy).toHaveBeenCalledWith('theme');
    });

    it('returns error when endpoint returns error response', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getTagsWithUsage').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: null, error: { message: 'Unauthorized' } }),
      } as any);

      const result = await TaxonomyDataSource.getTagsWithUsage();
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Unauthorized');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'getTagsWithUsage').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.getTagsWithUsage();
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to load tags with usage. Please try again.');
    });
  });

  describe('updateTag', () => {
    it('updates tag successfully', async () => {
      const input: UpdateTagInput = { name: 'folklore', tag_type: 'theme', description: 'Updated' };
      const updatedTag: TagType = { id: 3, name: 'folklore', tag_type: 'theme', description: 'Updated', created_at: '', updated_at: '' };

      const updateSpy = vi.spyOn(Endpoints.Taxonomy, 'updateTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: updatedTag, error: null }),
      } as any);

      const result = await TaxonomyDataSource.updateTag(3, input);
      expect(updateSpy).toHaveBeenCalledWith(3, input);
      expect(result.error).toBeNull();
      expect(result.data).toEqual(updatedTag);
    });

    it('returns error when tag update fails', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'updateTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: null, error: { message: 'Tag name already exists' } }),
      } as any);

      const result = await TaxonomyDataSource.updateTag(3, { name: 'duplicate' });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Tag name already exists');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'updateTag').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.updateTag(3, { name: 'err' });
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to update tag. Please try again.');
    });
  });

  describe('deleteTag', () => {
    it('deletes tag successfully', async () => {
      const deleteSpy = vi.spyOn(Endpoints.Taxonomy, 'deleteTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({ data: { message: 'Tag deleted successfully' }, error: null }),
      } as any);

      const result = await TaxonomyDataSource.deleteTag(5);
      expect(deleteSpy).toHaveBeenCalledWith(5);
      expect(result.error).toBeNull();
      expect(result.data).toEqual({ message: 'Tag deleted successfully' });
    });

    it('returns error when delete tag is rejected (e.g. Table IV Test 15 restrict)', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'deleteTag').mockReturnValue({
        callWithParser: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Cannot delete tag because it is currently assigned to content' },
        }),
      } as any);

      const result = await TaxonomyDataSource.deleteTag(5);
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Cannot delete tag because it is currently assigned to content');
    });

    it('returns fallback error when exception is thrown', async () => {
      vi.spyOn(Endpoints.Taxonomy, 'deleteTag').mockReturnValue({
        callWithParser: vi.fn().mockRejectedValue(new Error('Network crash')),
      } as any);

      const result = await TaxonomyDataSource.deleteTag(5);
      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Failed to delete tag. Please try again.');
    });
  });
});
