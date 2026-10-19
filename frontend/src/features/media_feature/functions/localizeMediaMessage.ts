// A server error from the media or taxonomy routes, in the interface language.
// Most are fixed sentences (localizeServerMessage looks them up); a few carry a
// value the user chose (a file name, a tag name), so they are recognised by
// shape here and rebuilt from this slice's wording with the value kept.
import { i18n, localizeServerMessage } from '@/i18n'

type Rebuild = (match: RegExpMatchArray) => string
type Translate = (key: string, values: Record<string, unknown>) => string

/**
 * A message from the locale files, for plain .ts code (stores, validators, data
 * sources). Called when the message is needed, so it is in the current language.
 * Typed plainly: vue-i18n's own key typing is too deep for template-literal keys.
 */
export function mediaT(key: string, values: Record<string, unknown> = {}): string {
  return (i18n.global as unknown as { t: Translate }).t(key, values)
}

const t = mediaT

const PATTERNS: Array<[RegExp, Rebuild]> = [
  [/^A tag named "(.*)" already exists$/, (m) => t('media.serverPatterns.tagExists', { name: m[1] })],
  [/^Unsupported file type "(.*)"\. Allowed: MP3, WAV, OGG, WebM\.$/, (m) => t('media.files.audioFormat', { type: m[1] })],
  [/^Unsupported file type "(.*)"\. Allowed: PNG, JPEG, WebP, GIF\.$/, (m) => t('media.files.imageFormat', { type: m[1] })],
  [/^Filename "(.*)" does not end with an allowed extension \((.*)\)\.$/, (m) => t('media.files.extension', { name: m[1], extensions: m[2] })],
  [/^File is ([\d.]+) MB\. The maximum allowed size is 5 MB\.$/, (m) => t('media.files.size', { size: m[1] })],
]

export function localizeMediaMessage(message: string | null | undefined): string {
  if (!message) return ''
  if (i18n.global.locale.value !== 'zulu') return message
  for (const [pattern, rebuild] of PATTERNS) {
    const match = message.match(pattern)
    if (match) return rebuild(match)
  }
  return localizeServerMessage(message)
}
