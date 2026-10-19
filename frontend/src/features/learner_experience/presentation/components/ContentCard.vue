<script setup lang="ts">

import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { $ContentSummary } from '@/features/shared/models/contentType'
import { levelLabel, tagLabel } from '@/features/learner_experience/functions/learnerCopy'

//One piece of content on the Explore shelf. Opens the reader, unless the
//server marked it locked (above the learner's level): then it is shown, with
//what it takes to open it, but goes nowhere.
const props = withDefaults(defineProps<{
    row: $ContentSummary;
    //Position on the shelf; a child's shelf colours cards by it.
    position?: number;
    isChild?: boolean;
}>(), { position: 0, isChild: false })

//Adults get one calm colour per level; children a rainbow along the shelf.
const tone = computed(() => {
    const step = props.isChild ? props.position : (props.row.level ?? 1) - 1
    return `var(--tone-${(Math.abs(step) % 5) + 1})`
})

const { t } = useI18n()

const locked = computed(() => props.row.locked === true)

//A locked card is a plain block; an open one is a link to the reader.
const linkProps = computed(() => locked.value
    ? { 'aria-disabled': 'true' }
    : { to: { name: 'reader', params: { contentId: String(props.row.contentId) } } })

</script>

<template>
  <component
    :is="locked ? 'div' : RouterLink"
    v-bind="linkProps"
    class="content-card"
    :class="{ 'content-card--locked': locked, 'content-card--child': isChild }"
    data-testid="content-card"
  >
    <div class="content-card__cover" :style="{ '--card-tone': tone }">
      <div class="content-card__cover-top">
        <span class="content-card__level">{{ levelLabel(row.level) }}</span>
        <span v-if="row.kind === 'quiz'" class="content-card__test">{{ t('learner.card.quiz') }}</span>
      </div>
      <h3 class="content-card__title">{{ row.title }}</h3>
      <svg v-if="isChild" class="content-card__doodle" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="62" cy="18" r="14" />
        <circle cx="20" cy="66" r="8" />
        <circle cx="70" cy="64" r="5" />
      </svg>
    </div>

    <div class="content-card__body">
      <p class="content-card__author">{{ t('learner.byAuthor', { name: row.authorName }) }}</p>
      <div v-if="row.chosenTags.length || row.childFriendly" class="content-card__tags">
        <span v-for="tag in row.chosenTags" :key="tag" class="ui-chip">{{ tagLabel(tag) }}</span>
        <span v-if="row.childFriendly && !isChild" class="ui-chip">{{ t('common.audience.child') }}</span>
      </div>
      <p v-if="locked" class="content-card__lock" data-testid="lock-note">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        {{ t('learner.card.locked', { level: row.level }) }}
      </p>
    </div>
  </component>
</template>

<style scoped>
.content-card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}
a.content-card:hover {
  box-shadow: var(--shadow-2);
  border-color: var(--rule-strong);
  transform: translateY(-2px);
}
.content-card__cover {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 150px;
  padding: var(--space-4);
  background: var(--card-tone);
  color: #fff;
  overflow: hidden;
}
.content-card__cover-top {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
}
.content-card__level,
.content-card__test {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.2);
  white-space: nowrap;
}
.content-card__test {
  background: var(--accent);
  color: #1c1405;
}
.content-card__title {
  position: relative;
  z-index: 1;
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.25;
  color: #fff;
}
.content-card__doodle {
  position: absolute;
  right: -6px;
  bottom: -6px;
  width: 90px;
  height: 90px;
  fill: rgba(255, 255, 255, 0.22);
}
.content-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) var(--space-4);
}
.content-card__author {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-2);
}
.content-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.content-card__lock {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ink-2);
}
.content-card__lock svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}
.content-card--locked {
  cursor: not-allowed;
}
.content-card--locked .content-card__cover {
  filter: grayscale(0.85);
  opacity: 0.7;
}
.content-card--child .content-card__cover {
  min-height: 170px;
}
.content-card--child .content-card__title {
  font-size: var(--text-xl);
}
</style>
