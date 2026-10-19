import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { clearValidity, localizeValidity } from '../localizedValidity'

function formWith(html: string): HTMLFormElement {
  const form = document.createElement('form')
  form.innerHTML = html
  document.body.appendChild(form)
  return form
}

function eventOn(type: string, target: Element): Event {
  const event = new Event(type)
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('localizedValidity', () => {
  it('words an empty required field in the interface language', () => {
    const form = formWith('<input name="a" required>')
    const input = form.querySelector('input')!
    localizeValidity(eventOn('invalid', input))
    expect(input.validationMessage).toBe('Please fill in this field.')

    i18n.global.locale.value = 'zulu'
    localizeValidity(eventOn('invalid', input))
    expect(input.validationMessage).toBe('Sicela ugcwalise le nkambu.')
    form.remove()
  })

  it('words a bad email address, and a radio group with nothing chosen', () => {
    const form = formWith('<input type="email" value="nope" required><input type="radio" name="r" required>')
    const [email, radio] = Array.from(form.querySelectorAll('input'))
    localizeValidity(eventOn('invalid', email))
    expect(email.validationMessage).toContain('Enter an email address')
    localizeValidity(eventOn('invalid', radio))
    expect(radio.validationMessage).toBe('Please choose one of these.')
    form.remove()
  })

  it('forgets every message in the form once something changes', () => {
    const form = formWith('<input name="a" required><input name="b" required>')
    const [a, b] = Array.from(form.querySelectorAll('input'))
    localizeValidity(eventOn('invalid', a))
    localizeValidity(eventOn('invalid', b))
    b.value = 'x'
    clearValidity(eventOn('input', b))
    expect(b.validity.valid).toBe(true)
    //a is still empty, but no longer stuck on our message: the browser decides again.
    expect(a.validity.customError).toBe(false)
    form.remove()
  })

  it('words a pattern mismatch with the field\'s own rule, or the general one without', () => {
    i18n.global.locale.value = 'english'
    const form = formWith('<input name="a" pattern="[a-z]+" value="1" data-pattern-message="Use only letters."><input name="b" pattern="[a-z]+" value="1">')
    const [ruled, plain] = Array.from(form.querySelectorAll('input'))
    localizeValidity(eventOn('invalid', ruled))
    expect(ruled.validationMessage).toBe('Use only letters.')
    localizeValidity(eventOn('invalid', plain))
    expect(plain.validationMessage).toBe('Please check this field.')
    form.remove()
  })

  it('leaves a valid field alone', () => {
    const form = formWith('<input name="a" value="ok" required>')
    const input = form.querySelector('input')!
    localizeValidity(eventOn('invalid', input))
    expect(input.validity.valid).toBe(true)
    form.remove()
  })
})
