import { mediaT } from './localizeMediaMessage'

// Formats an ISO date string into a relative time string (e.g., "Just now", "5 h ago", "Yesterday", "3 days ago", etc.)
export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const then = new Date(isoDate)
  const diffMs = now.getTime() - then.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = Math.floor(diffHours / 24)

  const t = mediaT
  if (diffHours < 1) return t('media.relativeTime.justNow')
  if (diffHours < 24) return t('media.relativeTime.hoursAgo', { n: Math.round(diffHours) })
  if (diffDays === 1) return t('media.relativeTime.yesterday')
  return t('media.relativeTime.daysAgo', { n: diffDays })
}

