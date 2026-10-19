<script setup lang="ts">

import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CONTENT_LEVELS, type $ContentSummary } from '@/features/shared/models/contentType'
import { learnerExperienceStore } from '@/features/learner_experience/presentation/state/learnerExperienceStore'
import { myLearningStore } from '@/features/learner_experience/presentation/state/myLearningStore'
import { themeStore } from '@/features/shared/state/themeStore'
import { authStore } from '@/features/auth_feature/state/authStore'
import { friendlyError, levelLabel, tagLabel } from '@/features/learner_experience/functions/learnerCopy'
import ContentCard from '@/features/learner_experience/presentation/components/ContentCard.vue'
import ContinueReadingList from '@/features/learner_experience/presentation/components/ContinueReadingList.vue'

const store = learnerExperienceStore()
const learning = myLearningStore()
const theme = themeStore()
const auth = authStore()
const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const { catalogue, isCatalogueLoading, catalogueError, targetLanguage } = storeToRefs(store)

//'all' means every level; otherwise one level number. Starts where the learner
//last left it this session, else at their own level once it is known.
const levelFilter = ref<'all' | number>('all')
const userId = computed(() => auth.currentUser?.id ?? null)

//The under-13 gate is the server's, read from the onboarding access policy.
const childFriendlyOnly = ref(false)
//Content with a test only. kind is derived by the server from the blocks.
const quizzesOnly = ref(false)
const searchText = ref('')

const showPlacementNotice = ref(route.query.placementSkipped === 'true')

const isChild = computed(() => theme.isChild)
const currentLevel = computed(() => learning.summary?.currentLevel ?? null)
const continueReading = computed(() => learning.summary?.continueReading ?? [])

const languageLabel = computed(() => targetLanguage.value != null
    ? t(`common.languages.${targetLanguage.value}`)
    : t('learner.explore.yourLanguage'))

//The level menu's options, with the learner's own level pointed out.
const levelOptions = computed(() => CONTENT_LEVELS.map((option) => ({
    value: option.value,
    label: option.value === currentLevel.value
        ? t('learner.explore.yourLevelOption', { label: levelLabel(option.value) })
        : levelLabel(option.value),
})))

//Bound to the native select, which only deals in strings.
const levelSelectValue = computed({
    get: () => String(levelFilter.value),
    set: (value: string) => { levelFilter.value = value === 'all' ? 'all' : Number(value) },
})

function toggleChildFriendlyOnly(): void {
    if (store.childFriendlyLocked) return
    childFriendlyOnly.value = !childFriendlyOnly.value
}

function resetFilters(): void {
    levelFilter.value = 'all'
    quizzesOnly.value = false
    searchText.value = ''
    if (!store.childFriendlyLocked) childFriendlyOnly.value = false
}

//Asks the server for the rows again. Level, language and the child gate are all
//applied there; the API's level filter matches one level exactly.
async function reloadCatalogue(): Promise<void> {
    await store.loadCatalogue({
        ...(levelFilter.value !== 'all' ? { level: levelFilter.value } : {}),
        ...(targetLanguage.value != null ? { language: targetLanguage.value } : {}),
        childFriendlyOnly: childFriendlyOnly.value,
    })
}

//Only the search and "has test" run here; every other filter is a fresh request.
const shelf = computed<$ContentSummary[]>(() => {
    const needle = searchText.value.trim().toLowerCase()
    const rows = quizzesOnly.value
        ? catalogue.value.filter((row) => row.kind === 'quiz')
        : catalogue.value
    if (!needle) return rows
    return rows.filter((row) =>
        row.title.toLowerCase().includes(needle)
        || row.authorName.toLowerCase().includes(needle)
        || row.chosenTags.some((tag) => tag.toLowerCase().includes(needle) || tagLabel(tag).toLowerCase().includes(needle))
    )
})

const resultCountLabel = computed(() => t('learner.explore.resultCount', shelf.value.length))

//A refusal the learner can do something about gets a button that goes there.
const errorAction = computed(() => {
    const message = catalogueError.value?.message ?? ''
    if (/setup must be completed/i.test(message) && router.hasRoute('learnerSetup')) {
        return { label: t('learner.explore.finishSetup'), to: { name: 'learnerSetup' } }
    }
    if (/parent link/i.test(message) && router.hasRoute('parentLinking')) {
        return { label: t('learner.explore.linkGrownUp'), to: { name: 'parentLinking' } }
    }
    return null
})

onMounted(async () => {
    await Promise.all([store.loadLearnerSettings(), learning.load()])
    //The gate goes on before the first request, so no adult row is ever fetched.
    if (store.childFriendlyLocked) childFriendlyOnly.value = true
    const remembered = store.rememberedExploreLevel(userId.value)
    if (remembered != null) levelFilter.value = remembered
    else if (currentLevel.value != null) levelFilter.value = currentLevel.value
    await reloadCatalogue()
    //Watched only after the first load, so setting the defaults does not fetch twice.
    watch([levelFilter, childFriendlyOnly], reloadCatalogue)
    watch(levelFilter, (level) => store.rememberExploreLevel(userId.value, level))
})

</script>

<template>
  <main class="ui-page explore" :class="{ 'explore--child': isChild }">
    <header class="ui-page__head">
      <div>
        <p class="ui-eyebrow">{{ isChild ? t('learner.explore.eyebrowChild') : t('common.nav.explore') }}</p>
        <h1 class="ui-title">{{ isChild ? t('learner.explore.titleChild') : t('learner.explore.title') }}</h1>
        <p class="ui-subtitle">
          {{ isChild ? t('learner.explore.subtitleChild') : t('learner.explore.subtitle', { language: languageLabel }) }}
        </p>
      </div>
      <RouterLink v-if="currentLevel != null" :to="{ name: 'myLearning' }" class="explore__level" data-testid="current-level">
        <span class="explore__level-label">{{ isChild ? t('learner.explore.myLevel') : t('learner.explore.yourLevel') }}</span>
        <span class="explore__level-value">{{ levelLabel(currentLevel) }}</span>
      </RouterLink>
    </header>

    <p v-if="showPlacementNotice" class="ui-alert ui-alert--info explore__notice" role="status" data-testid="placement-level-notice">
      <span>{{ t('learner.explore.placementSkipped') }}</span>
      <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" :aria-label="t('learner.explore.dismissNotice')" @click="showPlacementNotice = false">{{ t('learner.explore.dismiss') }}</button>
    </p>

    <section v-if="continueReading.length" class="explore__section" aria-labelledby="continue-heading">
      <h2 id="continue-heading" class="ui-section-title">{{ isChild ? t('learner.explore.keepGoing') : t('learner.explore.continueReading') }}</h2>
      <ContinueReadingList :rows="continueReading" />
    </section>

    <section class="explore__filters ui-card ui-card--flat" :aria-label="t('learner.explore.filters')">
      <label class="ui-field explore__level-filter">
        <span class="ui-label">{{ t('learner.explore.level') }}</span>
        <select v-model="levelSelectValue" class="ui-select" data-testid="level-filter">
          <option value="all">{{ t('learner.explore.allLevels') }}</option>
          <option v-for="option in levelOptions" :key="option.value" :value="String(option.value)">{{ option.label }}</option>
        </select>
      </label>

      <label class="ui-field explore__search">
        <span class="ui-label">{{ t('learner.explore.search') }}</span>
        <input v-model="searchText" class="ui-input" type="search" :placeholder="t('learner.explore.searchPlaceholder')" data-testid="search">
      </label>

      <div class="explore__toggles">
        <!-- Always on for a child: a status, not a button. -->
        <span
          v-if="store.childFriendlyLocked"
          class="ui-chip explore__status"
          data-testid="child-friendly-status"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          {{ t('learner.explore.childFriendlyOn') }}
        </span>
        <button
          v-else
          type="button"
          class="ui-chip explore__toggle"
          :class="{ 'ui-chip--active': childFriendlyOnly }"
          :aria-pressed="childFriendlyOnly"
          data-testid="child-friendly-toggle"
          @click="toggleChildFriendlyOnly"
        >{{ t('common.audience.child') }}</button>
        <button
          type="button"
          class="ui-chip explore__toggle"
          :class="{ 'ui-chip--active': quizzesOnly }"
          :aria-pressed="quizzesOnly"
          data-testid="has-test-toggle"
          @click="quizzesOnly = !quizzesOnly"
        >{{ t('learner.explore.hasTest') }}</button>
        <span class="explore__count" aria-live="polite">{{ resultCountLabel }}</span>
      </div>
    </section>

    <p v-if="store.childFriendlyLocked && !isChild" class="explore__hint">
      {{ t('learner.explore.childLockedHint') }}
    </p>

    <div v-if="isCatalogueLoading" class="ui-row explore__loading" role="status">
      <span class="ui-spinner" aria-hidden="true" />
      <span>{{ isChild ? t('learner.explore.loadingChild') : t('learner.explore.loading') }}</span>
    </div>

    <div v-else-if="catalogueError" class="ui-alert ui-alert--error explore__error" role="alert" data-testid="catalogue-error">
      <p>{{ friendlyError(catalogueError) }}</p>
      <div class="ui-row">
        <RouterLink v-if="errorAction" :to="errorAction.to" class="ui-btn ui-btn--primary ui-btn--sm">{{ errorAction.label }}</RouterLink>
        <button class="ui-btn ui-btn--sm" type="button" @click="reloadCatalogue">{{ t('common.states.retry') }}</button>
      </div>
    </div>

    <section v-else-if="shelf.length" class="explore__shelf" :aria-label="t('common.nav.content')">
      <ContentCard
        v-for="(row, index) in shelf"
        :key="row.contentId"
        :row="row"
        :position="index"
        :is-child="isChild"
      />
    </section>

    <div v-else class="ui-card ui-empty" data-testid="empty-shelf">
      <h2 class="ui-empty__title">{{ isChild ? t('learner.explore.emptyTitleChild') : t('learner.explore.emptyTitle') }}</h2>
      <p>{{ isChild ? t('learner.explore.emptyBodyChild') : t('learner.explore.emptyBody', { language: languageLabel }) }}</p>
      <button class="ui-btn ui-btn--primary" type="button" @click="resetFilters">{{ t('learner.explore.showEverything') }}</button>
    </div>
  </main>
</template>

<style scoped>
.explore__level {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius);
  background: var(--primary-soft);
  color: var(--primary);
  text-decoration: none;
}
.explore__level-label {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.explore__level-value {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
}
.explore__notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0 0 var(--space-5);
}
.explore__section {
  margin-bottom: var(--space-6);
}
.explore__filters {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(200px, 1fr);
  gap: var(--space-4);
  align-items: end;
  margin-bottom: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-2);
  border-color: transparent;
}
.explore__toggles {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.explore__toggle {
  min-height: 32px;
  padding: 4px var(--space-4);
  font-size: var(--text-sm);
  cursor: pointer;
}
.explore__status {
  min-height: 32px;
  padding: 4px var(--space-3);
  border-color: transparent;
  background: var(--success-soft);
  color: var(--success);
  font-size: var(--text-sm);
  font-weight: 600;
}
.explore__status svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.explore__count {
  margin-left: auto;
  font-size: var(--text-sm);
  color: var(--ink-3);
}
.explore__hint {
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.explore__loading {
  padding: var(--space-6) 0;
  color: var(--ink-2);
}
.explore__error p {
  margin: 0 0 var(--space-3);
}
.explore__shelf {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}
.explore--child .explore__shelf {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
.explore--child .explore__level {
  background: var(--accent-soft);
  color: var(--ink);
  border: 2px solid var(--accent);
}

@media (max-width: 640px) {
  .explore__filters {
    grid-template-columns: 1fr;
  }
  .explore__level {
    align-items: flex-start;
  }
}

</style>
