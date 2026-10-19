import type { Exception } from '@/core/exceptions/models/ExceptionType'
import { CONTENT_LEVELS } from '@/features/shared/models/contentType'
import { APP_NAME } from '@/core/brand'
import { i18n, localizeServerMessage } from '@/i18n'

// Small pure helpers that turn what the server sends into what a learner reads,
// in the interface language. Each call reads the current locale, so a template
// that calls them re-renders when the language changes.

//Typed loosely on purpose: the full message schema is too deep for the
//compiler to instantiate from a plain .ts file.
type Translate = (key: string, values?: Record<string, unknown>) => string
const t: Translate = (key, values = {}) => (i18n as unknown as { global: { t: Translate } }).global.t(key, values)

//"Level 2 · A1+" for a level number, "Level 9" for one the scale does not name.
//The reference label (A1, B2...) reads the same in every language.
export function levelLabel(level: number | null | undefined): string {
    if (level == null) return t('learner.noLevel')
    const named = CONTENT_LEVELS.find((option) => option.value === level)
    const base = t('common.level', { level })
    return named ? `${base} · ${named.label}` : base
}

//Messages this app makes itself (the learner stores and datasource), so they
//can be shown in the interface language too.
const CLIENT_MESSAGES: Record<string, string> = {
    'This content is not available to read.': 'learner.errors.notAvailableToRead',
    'This content is not available.': 'learner.errors.notAvailable',
    'Failed to send your answers. Please try again.': 'learner.errors.sendAnswersFailed',
    'Failed to load your learning. Please try again.': 'learner.errors.loadLearningFailed',
    'Failed to save your place.': 'learner.errors.savePlaceFailed',
    'Failed to load your place.': 'learner.errors.loadPlaceFailed',
    //The Exception default when a failed response carried no message.
    'An error occurred': 'common.states.genericError',
}

//What a learner is told when something fails. The server's messages are
//written for developers ("this content is above your level"), so the common
//ones get friendlier words; anything else is shown as sent (in isiZulu when
//its wording is known), capitalised.
export function friendlyError(error: Exception | null | undefined): string {
    if (error == null) return ''
    const message = error.message ?? ''
    if (error.statusCode === 0) return t('learner.errors.offline', { app: APP_NAME })
    if (/above your level/i.test(message)) return t('learner.errors.aboveLevel')
    if (/child-friendly/i.test(message)) return t('learner.errors.notChildFriendly')
    if (/setup must be completed/i.test(message)) return t('learner.errors.setupRequired')
    if (/parent link/i.test(message)) return t('learner.errors.parentLink')
    //What the server tells anyone opening a draft, pending or rejected piece by
    //its address. For a learner that only means it isn't there to read.
    if (/belongs to another author/i.test(message)) return t('learner.errors.notAvailableToRead')
    if (error.statusCode === 404) return t('learner.errors.notFound')
    if (!message) return t('common.states.genericError')
    const clientKey = CLIENT_MESSAGES[message]
    if (clientKey) return t(clientKey)
    const counts = /^expected (\d+) answers, got (\d+)$/i.exec(message)
    if (counts) return t('learner.errors.answerCount', { expected: counts[1], got: counts[2] })
    const shown = localizeServerMessage(message)
    return shown.charAt(0).toUpperCase() + shown.slice(1)
}

//A theme tag as a learner reads it: "daily-life" is "Daily life" (or its
//isiZulu name). Tags the app has no name for are tidied the same way.
export function tagLabel(slug: string): string {
    const camel = slug.replace(/[-_\s]+([a-z0-9])/gi, (_, letter: string) => letter.toUpperCase())
    const key = `common.tags.${camel}`
    const te = (i18n as unknown as { global: { te: (key: string) => boolean } }).global.te
    if (camel && te(key)) return t(key)
    const words = slug.replace(/[-_]+/g, ' ').trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
}

//How many of five stars a score earns, rounded to the nearest whole star.
export function starsFor(percent: number): number {
    const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))
    return Math.round(clamped / 20)
}

//How far a learner is through something, as a whole percentage for a progress bar.
export function progressPercent(done: number, total: number): number {
    if (!(total > 0)) return 0
    return Math.min(100, Math.max(0, Math.round((done / total) * 100)))
}
