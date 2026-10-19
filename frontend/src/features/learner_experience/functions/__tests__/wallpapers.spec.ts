import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { CHILD_WALLPAPERS, WALLPAPERS, isKnownWallpaper, wallpaperStorageKey, wallpapersFor } from '../wallpapers'

//Typed loosely: vue-i18n's fully typed te() is too deep for TypeScript here (TS2589).
const te = (i18n.global as unknown as { te: (key: string, locale: string) => boolean }).te

describe('wallpapers', () => {
  it('every wallpaper has a name in both languages', () => {
    for (const locale of ['english', 'zulu'] as const) {
      for (const wallpaper of [...WALLPAPERS, ...CHILD_WALLPAPERS]) {
        expect(te(`learner.wallpaper.names.${wallpaper.id}`, locale)).toBe(true)
      }
    }
  })

  it('a child is offered the bright set, an adult the calm one', () => {
    expect(wallpapersFor(true)).toBe(CHILD_WALLPAPERS)
    expect(wallpapersFor(false)).toBe(WALLPAPERS)
    expect(isKnownWallpaper(WALLPAPERS[1].css, true)).toBe(false)
    expect(isKnownWallpaper(CHILD_WALLPAPERS[1].css, true)).toBe(true)
  })

  it('keeps each learner\'s choice under their own key', () => {
    expect(wallpaperStorageKey(7)).toBe('lingolearn_learner_wallpaper:7')
    expect(wallpaperStorageKey(8)).not.toBe(wallpaperStorageKey(7))
  })
})
