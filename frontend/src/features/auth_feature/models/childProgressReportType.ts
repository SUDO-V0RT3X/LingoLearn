// The report API accepts the two language codes listed in the backend contract.
export type ReportLanguage = 'en' | 'zu'

// One activity row records a learner interaction shown in the report table.
export type ReportActivity = {
  contentId: number // Identify the lesson, test, or challenge.
  title: string // Display the content title.
  type: 'lesson' | 'test' | 'challenge' // Display the activity category.
  score: number | null // Display a numeric score when one exists.
  outcome: 'passed' | 'failed' | 'completed' | 'in_progress' // Display the activity result.
  occurredAt: string // Display the activity date from an ISO string.
  level?: number | null // The test's level, or the level a challenge aimed for.
}

// One report flag contains a stable code and readable message.
export type ReportFlag = {
  code: 'REPEATED_FAIL' | 'INACTIVE' | 'CHALLENGE_FAILED' | 'PLACEMENT_UNSET' // Identify the matched rule.
  message: string // Describe the matched rule to the guardian.
}

// This type mirrors the complete child progress report response from the backend.
export type ChildProgressReport = {
  child: {
    id: number // Identify the learner account.
    firstName: string // Display the learner name in the page header.
    languages: ReportLanguage[] // List the language the learner is learning.
    activeLanguage: ReportLanguage // Identify the language the learner is learning.
    lastActiveAt: string | null // Display the latest activity date when available.
  }
  summary: {
    level: number | null // Display the level, or null before placement.
    completed: number // Display the number of different tests taken.
    avgScore: number | null // Display the average test score when available.
    levelUp: {
      testsPassed: number // Display the passed-test count.
      testsRequired: number // Display the required-test count.
    }
  }
  challenge: {
    state: 'locked' | 'eligible' | 'cooldown' | 'max_level' // Display the current challenge state.
    cooldownEndsAt: string | null // Display the cooldown end time when available.
  }
  recentActivity: ReportActivity[] // Populate the newest-first activity table.
  flags: ReportFlag[] // Populate the report flags list.
  settings: {
    childFriendly: boolean // Display the child-friendly setting as text.
  }
}

