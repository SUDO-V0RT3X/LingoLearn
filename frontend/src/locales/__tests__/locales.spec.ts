import { describe, it, expect } from 'vitest'
import { localeModules } from '@/i18n'
import common from '@/locales/common'

//Every leaf key of a messages object, as dotted paths.
function leaves(value: unknown, prefix = ''): Map<string, string> {
  const found = new Map<string, string>()
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      for (const [path, text] of leaves(child, prefix ? `${prefix}.${key}` : key)) found.set(path, text)
    }
  } else {
    found.set(prefix, String(value))
  }
  return found
}

//The {placeholders} a message uses, sorted.
const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort()

describe('translations', () => {
  for (const [name, module] of Object.entries(localeModules)) {
    describe(name, () => {
      const english = leaves(module.english)
      const zulu = leaves(module.zulu)

      it('nominal: every English key has an isiZulu value, and the reverse', () => {
        expect([...zulu.keys()].sort()).toEqual([...english.keys()].sort())
      })

      it('every isiZulu message is filled in', () => {
        const empty = [...zulu].filter(([, text]) => text.trim() === '').map(([key]) => key)
        expect(empty).toEqual([])
      })

      it('both languages use the same {placeholders}', () => {
        const mismatched = [...english]
          .filter(([key, text]) => JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(zulu.get(key) ?? '')))
          .map(([key]) => key)
        expect(mismatched).toEqual([])
      })
    })
  }

  it('a server message mapped by more than one slice is defined once in common', () => {
    const mappedBy = new Map<string, string[]>()
    for (const [name, module] of Object.entries(localeModules)) {
      if (name === 'common') continue
      for (const message of Object.keys(module.serverMessages ?? {})) mappedBy.set(message, [...(mappedBy.get(message) ?? []), name])
    }
    const shared = [...mappedBy].filter(([, names]) => names.length > 1).map(([message]) => message)
    expect(shared.filter((message) => !(message in common.serverMessages))).toEqual([])
  })

  it('no two files claim the same namespace', () => {
    const owners = new Map<string, string[]>()
    for (const [name, module] of Object.entries(localeModules)) {
      for (const namespace of Object.keys(module.english)) owners.set(namespace, [...(owners.get(namespace) ?? []), name])
    }
    const clashes = [...owners].filter(([, names]) => names.length > 1)
    expect(clashes).toEqual([])
  })
})
