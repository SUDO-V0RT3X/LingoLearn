import { describe, expect, it } from 'vitest'
import { learnerInterfaceLanguage } from '../learnerInterfaceLanguage'

describe('learnerInterfaceLanguage', () => {
  it('nominal: a learner of English reads English, whatever was chosen', () => {
    expect(learnerInterfaceLanguage('english', 'zulu')).toBe('english')
    expect(learnerInterfaceLanguage(' English ', 'zulu')).toBe('english')
  })

  it('nominal: a learner of isiZulu keeps their choice', () => {
    expect(learnerInterfaceLanguage('zulu', 'zulu')).toBe('zulu')
    expect(learnerInterfaceLanguage('zulu', 'english')).toBe('english')
  })

  it('boundary: no valid choice is English', () => {
    expect(learnerInterfaceLanguage('zulu', 'tshivenda')).toBe('english')
    expect(learnerInterfaceLanguage('zulu', null)).toBe('english')
    expect(learnerInterfaceLanguage(undefined, undefined)).toBe('english')
  })
})
