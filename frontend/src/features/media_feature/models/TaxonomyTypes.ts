// Frontend types for taxonomy resources: levels, tags, and content tags.

export type TagKind = 'test' | 'theme';

export interface LevelType {
  id: number;
  level_number: number;
  name: string;
  description: string;
  pass_mark: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateLevelInput {
  name?: string;
  description?: string;
  pass_mark?: number;
}

export interface TagType {
  id: number;
  name: string;
  tag_type: TagKind;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTagInput {
  name: string;
  tag_type: TagKind;
  description?: string;
}

export interface UpdateTagInput {
  name?: string;
  tag_type?: TagKind;
  description?: string;
}

export interface TagWithUsage extends TagType {
  usage_count: number;
}

export interface ContentTagType {
  id: number;
  content_id: number;
  tag_id: number;
  tag_name: string;
  tag_type: TagKind;
  created_at: string;
}

export const MAX_TAGS_PER_CONTENT = 10;

