import type { ContentStatus } from '../models/AuthorDashboardTypes'
import { mediaT } from './localizeMediaMessage'

// helper functions to get the label and badge class for a given content status, and to determine whether the row action should be "Edit" or "View" based on the content status.

export interface StatusMeta {
  label: string
  badgeClass: string
}

// badgeClass is a design-system modifier (main.css); a draft keeps the plain badge.
// The label is looked up on each call so it follows the interface language.
const BADGE_CLASS: Record<ContentStatus, string> = {
  draft: '',
  pending: 'ui-badge--warning',
  approved: 'ui-badge--success',
  rejected: 'ui-badge--danger',
}

export function getStatusMeta(status: ContentStatus): StatusMeta {
  return { label: mediaT(`common.status.${status}`), badgeClass: BADGE_CLASS[status] }
}

// draft not submitted yet, still theirs to shape thus can edit
// rejected sent back and needs fixing before resubmission so can edit
// Pending and approved are locked so nobody can alter something -  security risk if they can

const EDITABLE_STATUSES: ContentStatus[] = ['draft', 'rejected']

export function getRowAction(status: ContentStatus): 'edit' | 'view' {
  return EDITABLE_STATUSES.includes(status) ? 'edit' : 'view'
}

// The row button's text, in the interface language ("Edit" / "View" in English).
export function getRowActionLabel(status: ContentStatus): string {
  return mediaT(`media.dashboard.rowAction.${getRowAction(status)}`)
}