export type ContentType = 'lesson' | 'test' // lesson = no questios, test = has questions

// 4 possible states the content can be in baesed on moderator
export type ContentStatus = 'draft' | 'pending' | 'approved' | 'rejected' 

export type StatusFilter = 'all' | ContentStatus

export interface ContentItem {
  id: number
  title: string
  type: ContentType
  level: number
  language: 'english' | 'zulu' | null
  childFriendly: boolean
  updatedAt: string // timestamp
  status: ContentStatus
  moderatorNote?: string
  reviewedBy?: string
  reviewedAt?: string // when the moderator decided (ISO timestamp)
}

export const STATUS_FILTERS: StatusFilter[] = ['all', 'draft', 'pending', 'approved', 'rejected']