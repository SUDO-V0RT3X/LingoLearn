import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import MultipleChoiceQuestion from '../MultipleChoiceQuestion.vue'
import FillBlankQuestion from '../FillBlankQuestion.vue'
import ListenChooseQuestion from '../ListenChooseQuestion.vue'
import { answerableOptions } from '../answerableOptions'
import { i18n } from '@/i18n'

//The author's preview renders these with the whole value, answer included, so
//every component is also tested against a value that still carries its answer.
const fullChoice = { title: 'Greetings', question: 'How do you say hello?',
                     options: ['Hamba kahle', 'Sawubona', 'Ngiyabonga'], correctOption: 1 }
const fullGap = { title: 'Greetings', sentence: 'You say [] in the morning.', accepted: ['sawubona'] }
const fullListen = { title: 'At the door', fileUrl: '/uploads/audio/knock.mp3', transcript: 'Ubani lowo?',
                     options: ['Who is that?', 'Where are you?'], correctOption: 0 }

//What a learner could learn from the page: its text and every attribute value.
const everythingShown = (wrapper: ReturnType<typeof mount>) =>
  wrapper.text() + wrapper.findAll('*').map(el => Object.values(el.attributes()).join(' ')).join(' ')

describe('answerableOptions', () => {
  it('nominal: keeps each answer with its position', () => {
    expect(answerableOptions(['a', 'b'])).toEqual([{ position: 0, text: 'a' }, { position: 1, text: 'b' }])
  })

  it('skips an empty answer box but keeps the positions of the rest', () => {
    expect(answerableOptions(['a', '  ', 'c'])).toEqual([{ position: 0, text: 'a' }, { position: 2, text: 'c' }])
  })

  it('boundary: no answers', () => {
    expect(answerableOptions([])).toEqual([])
  })
})

describe('MultipleChoiceQuestion', () => {
  it('nominal: shows the question and one choice per answer, with none picked', () => {
    const question = mount(MultipleChoiceQuestion, { props: { value: fullChoice } })
    expect(question.find('legend').text()).toContain('How do you say hello?')
    expect(question.findAll('label').map(l => l.text())).toEqual(['Hamba kahle', 'Sawubona', 'Ngiyabonga'])
    expect(question.findAll('input[type="radio"]').some(r => (r.element as HTMLInputElement).checked)).toBe(false)
  })

  it('picking an answer sends its position up', async () => {
    const question = mount(MultipleChoiceQuestion, { props: { value: fullChoice } })
    await question.findAll('input[type="radio"]')[2].trigger('change')
    expect(question.emitted('update:answer')?.at(-1)).toEqual([2])
  })

  it('an answer after an empty box still sends its original position', async () => {
    const question = mount(MultipleChoiceQuestion, {
      props: { value: { ...fullChoice, options: ['Hamba kahle', '', 'Sawubona'] } },
    })
    expect(question.findAll('label')).toHaveLength(2)
    await question.findAll('input[type="radio"]')[1].trigger('change')
    expect(question.emitted('update:answer')?.at(-1)).toEqual([2])
  })

  it('shows a pick made elsewhere', () => {
    const question = mount(MultipleChoiceQuestion, { props: { value: fullChoice, answer: 0 } })
    expect(question.findAll('input[type="radio"]').map(r => (r.element as HTMLInputElement).checked))
      .toEqual([true, false, false])
  })

  it('gives nothing away, even when handed the answer', () => {
    const question = mount(MultipleChoiceQuestion, { props: { value: fullChoice } })
    expect(everythingShown(question)).not.toMatch(/correct|right answer/i)
    expect(question.findAll('input[type="radio"]').map(r => r.attributes('value'))).toEqual(['0', '1', '2'])
  })

  it('two questions on one page do not share a selection', () => {
    //Mounted together, as on a real page: ids are only unique within one app.
    const page = mount(defineComponent({
      components: { MultipleChoiceQuestion },
      setup: () => ({ value: fullChoice }),
      template: '<MultipleChoiceQuestion :value="value"/><MultipleChoiceQuestion :value="value"/>',
    }))
    const names = page.findAllComponents(MultipleChoiceQuestion)
      .map(q => q.find('input[type="radio"]').attributes('name'))
    expect(names).toHaveLength(2)
    expect(names[0]).not.toBe(names[1])
  })
})

describe('FillBlankQuestion', () => {
  it('nominal: puts one box where the gap is', () => {
    const question = mount(FillBlankQuestion, { props: { value: fullGap } })
    const sentence = question.find('.question-block__sentence')
    expect(sentence.findAll('input')).toHaveLength(1)
    expect(sentence.text()).toBe('You say  in the morning.')
    expect(sentence.text()).not.toContain('[]')
  })

  it('typing sends what the learner wrote up', async () => {
    const question = mount(FillBlankQuestion, { props: { value: fullGap } })
    await question.find('input').setValue('sawubona')
    expect(question.emitted('update:answer')?.at(-1)).toEqual(['sawubona'])
  })

  it('a sentence with no marker still gets one box, at the end', () => {
    const question = mount(FillBlankQuestion, { props: { value: { ...fullGap, sentence: 'Say hello:' } } })
    expect(question.findAll('input')).toHaveLength(1)
    expect(question.find('.question-block__sentence').text()).toBe('Say hello:')
  })

  it('a second marker stays as text, so there is only ever one box', () => {
    const question = mount(FillBlankQuestion, { props: { value: { ...fullGap, sentence: 'A [] and a [].' } } })
    expect(question.findAll('input')).toHaveLength(1)
    expect(question.find('.question-block__sentence').text()).toContain('and a [].')
  })

  it('brackets around the marker stay as text either side of the box', () => {
    const question = mount(FillBlankQuestion, { props: { value: { ...fullGap, sentence: 'You say [[]] in the morning.' } } })
    expect(question.findAll('input')).toHaveLength(1)
    expect(question.find('.question-block__sentence').text()).toBe('You say [] in the morning.')
  })

  it('gives nothing away, even when handed the accepted spellings', () => {
    const question = mount(FillBlankQuestion, { props: { value: fullGap } })
    expect(everythingShown(question)).not.toContain('sawubona')
  })
})

describe('ListenChooseQuestion', () => {
  it('nominal: plays the clip and offers the answers', () => {
    const question = mount(ListenChooseQuestion, { props: { value: fullListen } })
    expect(question.find('audio').attributes('src')).toContain('/uploads/audio/knock.mp3')
    expect(question.findAll('label').map(l => l.text())).toEqual(['Who is that?', 'Where are you?'])
  })

  it('keeps the transcript hidden until the learner asks for it', async () => {
    const question = mount(ListenChooseQuestion, { props: { value: fullListen } })
    expect(question.text()).not.toContain('Ubani lowo?')
    await question.find('.question-block__transcript-toggle').trigger('click')
    expect(question.text()).toContain('Ubani lowo?')
    expect(question.find('.question-block__transcript-toggle').attributes('aria-expanded')).toBe('true')
  })

  it('picking an answer sends its position up', async () => {
    const question = mount(ListenChooseQuestion, { props: { value: fullListen } })
    await question.findAll('input[type="radio"]')[1].trigger('change')
    expect(question.emitted('update:answer')?.at(-1)).toEqual([1])
  })

  it('boundary: no clip and no transcript leaves out the player and the toggle', () => {
    const question = mount(ListenChooseQuestion, {
      props: { value: { ...fullListen, fileUrl: '', transcript: '' } },
    })
    expect(question.find('audio').exists()).toBe(false)
    expect(question.find('.question-block__transcript-toggle').exists()).toBe(false)
  })

  it('gives nothing away, even when handed the answer', () => {
    const question = mount(ListenChooseQuestion, { props: { value: fullListen } })
    expect(everythingShown(question)).not.toMatch(/correct|right answer/i)
  })
})

describe('question blocks in isiZulu', () => {
  it('nominal: the listening prompt, transcript button and gap label follow the interface language', async () => {
    i18n.global.locale.value = 'zulu'
    const listen = mount(ListenChooseQuestion, { props: { value: fullListen } })
    expect(listen.find('legend').text()).toContain('Lalela, bese ukhetha okuzwile.')
    expect(listen.find('legend').text()).not.toContain('Listen, then choose')
    const toggle = listen.get('button')
    expect(toggle.text()).toBe('Bonisa umbhalo')
    await toggle.trigger('click')
    expect(toggle.text()).toBe('Fihla umbhalo')

    const gap = mount(FillBlankQuestion, { props: { value: fullGap } })
    expect(gap.get('input').attributes('aria-label')).toBe('Igama elishodayo')
  })
})
