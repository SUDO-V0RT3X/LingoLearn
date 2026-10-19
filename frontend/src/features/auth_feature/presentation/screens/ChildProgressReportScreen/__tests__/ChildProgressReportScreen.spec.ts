// These component tests render the Vue report page with a stubbed API datasource.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { $DataSourceResponse } from '@/core/http/models/DataSourceResponseType'
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType'
import { i18n } from '@/i18n'
import ChildProgressReportScreen from '../ChildProgressReportScreen.vue'
import { ChildProgressReportDataSource } from '@/features/auth_feature/datasources/childProgressReportDataSource'
import type { ChildProgressReport } from '@/features/auth_feature/models/childProgressReportType'

// Replace the report datasource with one controllable method for each test.
vi.mock('@/features/auth_feature/datasources/childProgressReportDataSource', () => ({
  ChildProgressReportDataSource: {
    getReport: vi.fn(), // Record and resolve report requests without a backend server.
  },
}))

// This report contains every populated section rendered by the successful state.
const populatedReport: ChildProgressReport = {
  child: {
    id: 7, // Identify the learner requested by the route.
    firstName: 'Lebo', // Display the learner name in the page header.
    languages: ['en', 'zu'], // Render both report language buttons.
    activeLanguage: 'en', // Mark English as the active report language.
    lastActiveAt: '2026-09-26T09:00:00.000Z', // Render one last-active date.
  },
  summary: {
    level: 2, // Render the learner placement level.
    completed: 14, // Render the completed-content count.
    avgScore: 82, // Render the average test score.
    levelUp: {
      testsPassed: 3, // Render the passed-test count.
      testsRequired: 5, // Render the required-test count.
    },
  },
  challenge: {
    state: 'eligible', // Render the eligible challenge line.
    cooldownEndsAt: null, // Omit a cooldown date.
  },
  recentActivity: [
    {
      contentId: 11, // Identify the activity row.
      title: 'Vowel practice', // Render the activity title.
      type: 'test', // Render the activity type.
      score: 82, // Render the activity score.
      outcome: 'passed', // Render the activity outcome.
      occurredAt: '2026-09-26T09:00:00.000Z', // Render the activity date.
    },
  ],
  flags: [
    {
      code: 'REPEATED_FAIL', // Render one flag code.
      message: 'The same activity has been failed at least three times.', // Render one flag message.
    },
  ],
  settings: {
    childFriendly: true, // Render the enabled plain-text setting.
  },
}

// This helper creates a memory router containing the report and children routes.
function makeRouter() {
  // Return a router that supplies the same childId route parameter as production.
  return createRouter({
    history: createMemoryHistory(), // Keep navigation inside the test process.
    routes: [
      { path: '/parent-linking', name: 'parentLinking', component: { template: '<div />' } }, // Resolve the back link.
      { path: '/guardian/children/:childId/report', name: 'childProgressReport', component: ChildProgressReportScreen }, // Mount the report page.
    ],
  })
}

// This helper mounts the page at one learner report URL.
async function mountReportPage() {
  // Create the memory router for this test.
  const router = makeRouter()
  // Navigate to learner id 7 before mounting the component.
  await router.push('/guardian/children/7/report')
  // Wait for the initial route navigation to finish.
  await router.isReady()
  // Mount the component with Pinia and Vue Router installed.
  const wrapper = mount(ChildProgressReportScreen, {
    global: { plugins: [createPinia(), router] },
  })
  // Return the wrapper and router for assertions and interactions.
  return { wrapper, router }
}

// Reset Pinia, browser storage, and mocks before each rendered state.
beforeEach(() => {
  // Install a fresh active Pinia for stores created during component setup.
  setActivePinia(createPinia())
  // Remove any session data left by another component test.
  window.localStorage.clear()
  // Reset datasource calls and implementations.
  vi.clearAllMocks()
})

// Group the report page states and read-only control assertion.
describe('ChildProgressReportScreen', () => {
  // Verify the initial unresolved request displays loading text.
  it('renders the loading state while the report request is pending', async () => {
    // Hold the datasource promise until after the loading assertion.
    let resolveRequest!: (value: $DataSourceResponse<ChildProgressReport>) => void
    // Create the pending datasource response.
    vi.mocked(ChildProgressReportDataSource.getReport).mockReturnValue(
      new Promise((resolve) => { resolveRequest = resolve }),
    )
    // Mount the page while the datasource promise remains unresolved.
    const { wrapper } = await mountReportPage()
    // Confirm the page displays its loading status.
    expect(wrapper.get('[role="status"]').text()).toContain('Loading child progress')
    // Resolve the request so the component finishes its pending task.
    resolveRequest(new $DataSourceResponse(populatedReport, null))
    // Flush the resolved promise before the wrapper is discarded.
    await flushPromises()
  })

  // Verify every successful report section and the lack of editable form elements.
  it('renders the report without input, checkbox, select, textarea, or toggle elements', async () => {
    // Return the populated report from the stubbed datasource.
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse(populatedReport, null),
    )
    // Mount the report page and finish the API promise.
    const { wrapper } = await mountReportPage()
    await flushPromises()

    // Confirm the report identity and required sections are visible.
    expect(wrapper.text()).toContain('Lebo')
    expect(wrapper.text()).toContain('3 of 5 tests passed')
    expect(wrapper.text()).toContain('Vowel practice')
    expect(wrapper.text()).toContain('REPEATED FAIL')
    expect(wrapper.text()).toContain('Child-friendly content: Enabled')
    // Confirm no editable form or switch controls exist anywhere on the page.
    expect(wrapper.findAll('input, select, textarea, [role="switch"], input[type="checkbox"]')).toHaveLength(0)
  })

  // Verify an empty activity array displays the specified empty copy.
  it('renders No activity yet when the report has no recent activity', async () => {
    // Return a report with an empty activity list.
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse({ ...populatedReport, recentActivity: [] }, null),
    )
    // Mount the page and finish the API promise.
    const { wrapper } = await mountReportPage()
    await flushPromises()
    // Confirm the activity empty state is visible.
    expect(wrapper.text()).toContain('No activity yet')
    // Confirm no activity table is rendered for an empty list.
    expect(wrapper.find('.activity-table').exists()).toBe(false)
  })

  // Verify an unlinked child response displays the dedicated forbidden state.
  it('renders the 403 state for an unlinked child', async () => {
    // Return the same 403 shape produced by the shared endpoint layer.
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse<ChildProgressReport>(
        null,
        new Exception({
          exceptionType: ExceptionType.FORBIDDEN, // Classify the response as forbidden.
          message: 'Access denied', // Copy the backend response message.
          statusCode: 403, // Preserve the backend status code.
        }),
      ),
    )
    // Mount the page and finish the API promise.
    const { wrapper } = await mountReportPage()
    await flushPromises()
    // Confirm the dedicated forbidden state appears.
    expect(wrapper.get('[data-testid="forbidden-state"]').text()).toContain('not linked to your account')
    // Confirm the report content is not rendered.
    expect(wrapper.find('.progress-report__content').exists()).toBe(false)
  })

  // Verify a child who has not been placed or learned yet reads as such, not as a broken report.
  it('renders a child who is not placed yet, with no language toggle', async () => {
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse({
        ...populatedReport,
        child: { ...populatedReport.child, languages: ['zu'], activeLanguage: 'zu', lastActiveAt: null },
        summary: { level: null, completed: 0, avgScore: null, levelUp: { testsPassed: 0, testsRequired: 6 } },
        challenge: { state: 'locked', cooldownEndsAt: null },
        recentActivity: [],
        flags: [{ code: 'PLACEMENT_UNSET', message: 'The placement test has not been taken yet.' }],
      } as ChildProgressReport, null),
    )
    const { wrapper } = await mountReportPage()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Learning isiZulu')
    expect(text).toContain('Last active: No activity recorded')
    expect(wrapper.get('[data-testid="not-placed"]').text()).toContain('No placement test yet')
    expect(text).toContain('Not available')
    expect(text).toContain('0 of 6 tests passed')
    expect(text).toContain('The placement test has not been taken yet.')
    // The child's language is plain text: the only button on the page is none at all.
    expect(wrapper.find('.progress-report__content').findAll('button').filter((b) => b.attributes('data-testid') !== 'dob-open')).toHaveLength(0)
  })

  // Verify challenge rows are named by their level and the top level reads as done.
  it('names a challenge by its level, dates in long form, and shows the top level as done', async () => {
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse({
        ...populatedReport,
        challenge: { state: 'max_level', cooldownEndsAt: null },
        recentActivity: [{
          contentId: 3, title: 'Level-up challenge', type: 'challenge', score: 90, outcome: 'passed',
          occurredAt: '2026-09-26T09:00:00.000Z', level: 6,
        }],
      } as ChildProgressReport, null),
    )
    const { wrapper } = await mountReportPage()
    await flushPromises()

    expect(wrapper.text()).toContain('Level-up challenge to level 6')
    expect(wrapper.text()).toContain('26 September 2026')
    expect(wrapper.get('.challenge-status').text()).toContain('Top level reached')
  })

  // Verify the report's own wording, activity labels and flags follow the isiZulu interface.
  it('renders the report in isiZulu when the interface language is isiZulu', async () => {
    i18n.global.locale.value = 'zulu'
    vi.mocked(ChildProgressReportDataSource.getReport).mockResolvedValue(
      new $DataSourceResponse(populatedReport, null),
    )
    const { wrapper } = await mountReportPage()
    await flushPromises()

    const text = wrapper.get('.progress-report__content').text()
    expect(text).toContain('Umbiko wentuthuko')
    expect(text).toContain('Izivivinyo eziphumelele: 3 kwezingu-5')
    expect(text).toContain('isivivinyo')
    expect(text).toContain('kuphumelele')
    expect(text).toContain('UKWEHLULEKA KAPHINDAPHINDA')
    expect(text).toContain('Umsebenzi ofanayo wehlulekile okungenani kathathu.')
    expect(text).toContain('Okuqukethwe okulungele izingane: Kuvuliwe')
    expect(text).toContain('Vowel practice')
    expect(text).not.toContain('Progress report')
    expect(text).not.toContain('tests passed')
    expect(text).not.toContain('REPEATED FAIL')
  })
})
