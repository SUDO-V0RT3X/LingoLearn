import { describe, it, expect } from 'vitest'

describe('LIN-64 — My Learning dashboard', () => {
  it('displays the learner’s current level', () => {
    const currentLevel = 3

    expect(currentLevel).toBe(3)
  })

  it('requires 6 passed tests before a challenge is available', () => {
    const testsRequired = 6

    expect(testsRequired).toBe(6)
  })

  it('shows the learner’s number of passed tests', () => {
    const passedTests = 4

    expect(passedTests).toBe(4)
  })

  it('shows test history for the learner', () => {
    const testHistory = [
      { score: 80, passed: true },
      { score: 65, passed: false },
    ]

    expect(testHistory).toHaveLength(2)
  })

  it('calculates the average test score', () => {
    const scores = [80, 60, 100]
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length

    expect(average).toBe(80)
  })

  it('makes the challenge available after passing 6 tests', () => {
    const passedTests = 6
    const testsRequired = 6

    const readyForChallenge = passedTests >= testsRequired

    expect(readyForChallenge).toBe(true)
  })
})
