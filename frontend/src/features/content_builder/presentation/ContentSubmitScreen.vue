<script setup lang="ts">

import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { contentBuilderScreenState } from './state'
import BlockMux from './components/BlockMux.vue'
import { BLANK_MARKER, CONTENT_LANGUAGE_OPTIONS, CONTENT_LEVELS } from '@/features/shared/models/contentType'
import { blockProblem, deriveContentKind, submissionChecks } from '@/features/content_builder/functions/submission'
import { blockTypeLabel } from '@/features/content_builder/functions/blockTypeLabel'
import { MAX_TAGS_PER_CONTENT } from '@/features/media_feature/models/TaxonomyTypes'

//The builder's store: this screen shows and submits the same draft.
const state = contentBuilderScreenState()
const router = useRouter()
const { t } = useI18n()

//True once submitted; disables the level, tag and submit controls.
const locked = computed(() => !state.canEdit())
//Story or quiz, derived from the blocks.
const kind = computed(() => deriveContentKind(state.contentState))
//Every submission check with whether it passes.
const checks = computed(() => submissionChecks(state.contentState, {
    title: state.title,
    language: state.language,
    level: state.level,
    theme: state.assignedTheme,
    audience: state.audience,
    chosenTags: state.chosenTags,
}))
//True when every check passes, which enables Submit.
const ready = computed(() => checks.value.every(check => check.passed))
//How many checks still fail, for the summary over the list.
const failingCount = computed(() => checks.value.filter(check => !check.passed).length)

//Keys of the checks that fail, so each part of the screen can say whether it is one.
const failing = computed(() => new Set(checks.value.filter(check => !check.passed).map(check => check.key)))
//Whether a check fails; the card or block it belongs to is then marked in red.
function needs(key:string):boolean{
    return failing.value.has(key)
}

//Set for a moment after an author tries to submit too early: every part marked
//in red gives a short shake, so what is left to fix is easy to find.
const screen = ref<HTMLElement|null>(null)
const shaking = ref(false)
//True once the author has tried to submit: the hint above the content shows, and
//the detail cards still empty turn red too. Blocks are marked from the start,
//since a half finished question is easy to miss.
const triedToSubmit = ref(false)
let shakeTimer:ReturnType<typeof setTimeout>|undefined

//Shakes everything that still needs work and scrolls to the first of it, or to
//the part one check is about when a check in the list is pressed.
async function drawAttention(key?:string){
    triedToSubmit.value = true
    shaking.value = false
    await nextTick()
    //A frame between off and on restarts the shake when it is already running.
    clearTimeout(shakeTimer)
    requestAnimationFrame(() => {
        shaking.value = true
        shakeTimer = setTimeout(() => { shaking.value = false }, 700)
    })
    const target = screen.value?.querySelector(key ? `[data-check="${key}"]` : '.is-incomplete')
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView?.({behavior: still ? 'auto' : 'smooth', block: 'center'})
}
onBeforeUnmount(() => clearTimeout(shakeTimer))

//The tag list comes from the taxonomy, so an administrator can add to it.
onMounted(() => state.loadAvailableTags())

const supplementaryAvailableTags = computed(() => {
    return state.availableTags.filter(t => t !== state.assignedTheme)
})

const supplementaryChosenTags = computed(() => {
    return state.chosenTags.filter(t => t !== state.assignedTheme)
})

const totalTagsCount = computed(() => state.chosenTags.length)

function selectTheme(tag: string){
    if (locked.value) return;
    if (state.assignedTheme === tag) {
        state.setAssignedTheme(null);
    } else {
        state.setAssignedTheme(tag);
    }
}

function selectAudience(audience: 'child-friendly' | 'general'){
    if (locked.value) return;
    if (state.audience === audience) {
        state.setAudience(null);
    } else {
        state.setAudience(audience);
    }
}

function toggleSupplementaryTag(tag: string){
    if (locked.value) return;
    state.toggleSupplementaryTag(tag);
}

//Submits the draft and returns to the builder once it is pending.
async function submit(){
    if (!ready.value){
        await drawAttention();
        return;
    }
    await state.submit();
    if (state.status === 'pending') router.push({name:'contentBuilder'});
}

</script>

<template>
  <main ref="screen" :class="['submit ui-page ui-page--wide',{'submit--shaking':shaking,'submit--tried':triedToSubmit}]">

    <header class="submit__bar">
        <div class="submit__identity">
            <p class="ui-eyebrow">{{ t('builder.eyebrow') }}</p>
            <div class="submit__titleRow">
                <h1 class="submit__title ui-title">{{ t('builder.submitForReview') }}</h1>
                <span class="ui-badge ui-badge--brand">{{ kind == 'quiz' ? t('builder.kind.quiz') : t('builder.kind.story') }}</span>
            </div>
            <p class="submit__lede ui-subtitle">
                {{ t('builder.submit.lede') }}
            </p>
        </div>
        <div class="submit__actions">
            <button class="ui-btn ui-btn--ghost" @click="router.push({name:'contentBuilder'})">{{ t('builder.submit.backToBuilder') }}</button>
            <button class="ui-btn ui-btn--primary" :disabled="locked || state.isSubmitting"
                    :aria-disabled="!ready" :class="{'submit__send--notReady':!ready}" @click="submit">
                <span v-if="state.isSubmitting" class="submit__spinner" aria-hidden="true"></span>
                {{ state.isSubmitting ? t('builder.submit.submitting') : t('builder.submitForReview') }}
            </button>
        </div>
    </header>

    <p v-if="state.submittingError" class="submit__error ui-alert ui-alert--error" role="alert">{{ state.submittingError.message }}</p>
    <p v-else-if="triedToSubmit && !ready && !locked" class="submit__error ui-alert ui-alert--error" role="alert">{{ t('builder.submit.fixFirst') }}</p>

    <div class="submit__split">

        <section class="preview" :aria-label="t('builder.submit.contentPreview')">
            <h2 class="colHead">{{ t('builder.submit.content') }}</h2>
            <article v-for="(page, pageIndex) in state.contentState" :key="pageIndex"
                     :class="['preview__page',{'is-incomplete':page.length == 0}]"
                     :data-check="page.length == 0 ? 'pagesHaveBlocks' : undefined">
                <h3 class="preview__pageHead">{{ t('builder.pages.page', {n: pageIndex + 1}) }}</h3>
                <p v-if="page.length == 0" class="preview__empty preview__fix">{{ t('builder.submit.noBlocks') }}</p>
                <div v-for="(block, blockIndex) in page" :key="blockIndex"
                     :class="['preview__block',{'is-incomplete':blockProblem(block) !== null}]"
                     :data-check="blockProblem(block) ?? undefined">
                    <span class="preview__type">{{ blockTypeLabel(block.itemType) }}</span>
                    <p v-if="blockProblem(block)" class="preview__fix">
                        <span class="preview__fixMark" aria-hidden="true">!</span>
                        {{ t(`builder.submit.fix.${blockProblem(block)}`, {marker: BLANK_MARKER}) }}
                    </p>
                    <div class="preview__body">
                        <BlockMux :page="pageIndex" :block="blockIndex" readonly/>
                    </div>
                </div>
            </article>
        </section>

        <aside class="details" :aria-label="t('builder.submit.details')">

            <section :class="['card','checksCard',{'checksCard--ready':ready}]">
                <div class="card__header">
                    <h2 class="colHead">{{ t('builder.submit.checks') }}</h2>
                    <span :class="['ui-badge', ready ? 'ui-badge--success' : 'ui-badge--warning']">
                        {{ ready ? t('builder.submit.ready') : t('builder.submit.toFix', {n: failingCount}) }}
                    </span>
                </div>
                <ul class="checks">
                    <li v-for="check in checks" :key="check.key"
                        :class="['check',{'check--failed':!check.passed}]">
                        <span class="check__mark" aria-hidden="true">{{ check.passed ? '✓' : '!' }}</span>
                        <button v-if="!check.passed && !locked" type="button" class="check__jump"
                                :title="t('builder.submit.showWhere')" @click="drawAttention(check.key)">{{ check.label }}</button>
                        <span v-else>{{ check.label }}</span>
                    </li>
                </ul>
            </section>

            <section :class="['card',{'is-incomplete':needs('title')}]" data-check="title">
                <h2 class="colHead">{{ t('builder.submit.title') }} <span class="req">{{ t('builder.submit.required') }}</span></h2>
                <input class="titleInput ui-input" type="text" :value="state.title" :disabled="locked"
                       maxlength="120"
                       :placeholder="t('builder.submit.titlePlaceholder')"
                       @input="state.setTitle(($event.target as HTMLInputElement).value)">
                <p class="card__hint card__hint--after">{{ t('builder.submit.titleHint') }}</p>
            </section>

            <section :class="['card',{'is-incomplete':needs('language')}]" data-check="language">
                <h2 class="colHead">{{ t('builder.submit.language') }} <span class="req">{{ t('builder.submit.required') }}</span></h2>
                <div class="levels">
                    <button v-for="option in CONTENT_LANGUAGE_OPTIONS" :key="option.value"
                            :class="['levelChip',{'levelChip--on':state.language == option.value}]"
                            :aria-pressed="state.language == option.value"
                            :disabled="locked" @click="state.setLanguage(option.value)">
                        <span class="levelChip__n">{{ t(`common.languages.${option.value}`) }}</span>
                    </button>
                </div>
            </section>

            <section :class="['card',{'is-incomplete':needs('audience')}]" data-check="audience">
                <h2 class="colHead">{{ t('builder.submit.audience') }} <span class="req">{{ t('builder.submit.required') }}</span></h2>
                <p class="card__hint">{{ t('builder.submit.audienceHint') }}</p>
                <div class="audienceGrid">
                    <button type="button"
                            :class="['audienceChip', {'audienceChip--on': state.audience === 'child-friendly'}]"
                            :aria-pressed="state.audience === 'child-friendly'"
                            :disabled="locked"
                            @click="selectAudience('child-friendly')">
                        <span class="audienceChip__title">{{ t('common.audience.child') }}</span>
                        <span class="audienceChip__desc">{{ t('builder.submit.childDesc') }}</span>
                    </button>
                    <button type="button"
                            :class="['audienceChip', {'audienceChip--on': state.audience === 'general'}]"
                            :aria-pressed="state.audience === 'general'"
                            :disabled="locked"
                            @click="selectAudience('general')">
                        <span class="audienceChip__title">{{ t('common.audience.general') }}</span>
                        <span class="audienceChip__desc">{{ t('builder.submit.generalDesc') }}</span>
                    </button>
                </div>
            </section>

            <section :class="['card',{'is-incomplete':needs('level')}]" data-check="level">
                <h2 class="colHead">{{ t('builder.submit.level') }} <span class="req">{{ t('builder.submit.required') }}</span></h2>
                <div class="levels">
                    <button v-for="level in CONTENT_LEVELS" :key="level.value"
                            :class="['levelChip',{'levelChip--on':state.level == level.value}]"
                            :aria-pressed="state.level == level.value"
                            :disabled="locked" @click="state.setLevel(level.value)">
                        <span class="levelChip__n">{{ t('common.level', {level: level.value}) }}</span>
                        <span class="levelChip__cefr">{{ level.label }}</span>
                    </button>
                </div>
            </section>

            <section :class="['card',{'is-incomplete':needs('theme')}]" data-check="theme">
                <h2 class="colHead">{{ t('builder.submit.theme') }} <span class="req">{{ t('builder.submit.required') }}</span></h2>
                <p class="card__hint">{{ t('builder.submit.themeHint') }}</p>
                <p v-if="state.availableTags.length === 0" class="muted">{{ t('builder.submit.noThemes') }}</p>
                <div class="tags">
                    <button v-for="tag in state.availableTags" :key="tag"
                            :class="['tagOption', {'tagOption--on': state.assignedTheme === tag}]"
                            :aria-pressed="state.assignedTheme === tag"
                            :disabled="locked" @click="selectTheme(tag)">
                        {{ tag }}
                    </button>
                </div>
            </section>

            <section :class="['card',{'is-incomplete':needs('tagLimit')}]" data-check="tagLimit">
                <div class="card__header">
                    <h2 class="colHead">{{ t('builder.submit.supplementaryTags') }}</h2>
                    <span class="tagBadge ui-badge" :class="{'tagBadge--limit ui-badge--danger': totalTagsCount >= MAX_TAGS_PER_CONTENT}">
                        {{ t('builder.submit.tagCount', {count: totalTagsCount, max: MAX_TAGS_PER_CONTENT}) }}
                    </span>
                </div>
                <p class="card__hint">{{ t('builder.submit.tagsHint', {max: MAX_TAGS_PER_CONTENT}) }}</p>
                <p v-if="supplementaryAvailableTags.length === 0" class="muted">{{ t('builder.submit.noMoreTags') }}</p>
                <div class="tags">
                    <button v-for="tag in supplementaryAvailableTags" :key="tag"
                            :class="['tagOption', {'tagOption--on': supplementaryChosenTags.includes(tag)}]"
                            :aria-pressed="supplementaryChosenTags.includes(tag)"
                            :disabled="locked || (!supplementaryChosenTags.includes(tag) && totalTagsCount >= MAX_TAGS_PER_CONTENT)"
                            @click="toggleSupplementaryTag(tag)">
                        {{ tag }}
                    </button>
                </div>
            </section>

            <section class="card">
                <h2 class="colHead">{{ t('builder.submit.contentType') }}</h2>
                <p class="kind">{{ kind == 'quiz' ? t('builder.kind.quiz') : t('builder.kind.story') }}</p>
                <p class="card__hint card__hint--after">{{ t('builder.submit.contentTypeHint') }}</p>
            </section>

        </aside>
    </div>
  </main>
</template>

<style scoped>

.muted{ margin: 0; color: var(--ink-3); font-size: var(--text-sm); }

/* ---- header ---- */
.submit__bar{
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding-bottom: var(--space-4);
    margin-bottom: var(--space-5);
    border-bottom: 1px solid var(--rule);
}
.submit__identity{ min-width: 0; }
.submit__titleRow{ display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
.submit__title{ font-size: var(--text-2xl); }
.submit__lede{ font-size: var(--text-sm); }
.submit__actions{ display: flex; flex-wrap: wrap; gap: var(--space-2); }
.submit__spinner{
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, .4);
    border-top-color: var(--on-primary);
    animation: submit-spin .8s linear infinite;
}
@keyframes submit-spin{ to{ transform: rotate(360deg); } }
.submit__error{ margin: 0 0 var(--space-4); }

.colHead{
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
    margin: 0 0 var(--space-2);
}
.req{
    color: var(--accent);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 500;
}

.submit__split{
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: var(--space-6);
    align-items: start;
}

/* ---- read only content ---- */
.preview{ display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.preview .colHead{ margin-bottom: 0; }
.preview__page{
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-5);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1);
}
.preview__pageHead{
    margin: 0;
    padding-bottom: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--ink);
    border-bottom: 1px solid var(--rule);
}
.preview__empty{ font-style: italic; }
.preview__block{
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background: var(--bg);
    border-radius: var(--radius);
}
.preview__type{
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.preview__body{ min-width: 0; }

/* ---- what still needs work: red, and a short shake on a try to submit ---- */
.preview__block.is-incomplete{ box-shadow: inset 0 0 0 2px var(--danger); }
.preview__page.is-incomplete{ border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger), var(--shadow-1); }
.submit--tried .card.is-incomplete{ border-color: var(--danger); box-shadow: 0 0 0 1px var(--danger), var(--shadow-1); }
.preview__fix{
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.4;
    color: var(--danger);
}
.preview__fixMark{
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--danger-soft);
    font-size: var(--text-xs);
    font-weight: 700;
}
.submit--shaking .is-incomplete{ animation: submit-shake .5s ease-in-out; }
@keyframes submit-shake{
    0%, 100%{ transform: translateX(0); }
    20%{ transform: translateX(-6px); }
    40%{ transform: translateX(5px); }
    60%{ transform: translateX(-4px); }
    80%{ transform: translateX(2px); }
}
@media (prefers-reduced-motion: reduce){
    .submit--shaking .is-incomplete{ animation: none; }
}
/* Not disabled, so pressing it early shows what is missing; dimmed so it reads as not yet. */
.submit__send--notReady{ opacity: .6; }

/* ---- right hand details ---- */
.details{
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}
.card{
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1);
    padding: var(--space-4);
}
.card__hint{ font-size: var(--text-xs); line-height: 1.45; color: var(--ink-3); margin: 0 0 var(--space-3); }
.card__hint--after{ margin: var(--space-2) 0 0; }
.card__header{
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
}
.card__header .colHead{ margin: 0; }

.titleInput:disabled{ background: var(--surface-2); color: var(--ink-2); }

/* Choice buttons share one look: quiet until picked, then the brand colour. */
.audienceChip,
.levelChip,
.tagOption{
    font: inherit;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--rule-strong);
    cursor: pointer;
    transition: border-color .15s ease, background .15s ease, color .15s ease;
}
.audienceChip:hover:not(:disabled),
.levelChip:hover:not(:disabled),
.tagOption:hover:not(:disabled){ border-color: var(--primary); color: var(--ink); }
.audienceChip:disabled,
.levelChip:disabled,
.tagOption:disabled{ cursor: not-allowed; opacity: .55; }

.audienceGrid{ display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.audienceChip{
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--space-3);
    border-radius: var(--radius);
    text-align: left;
}
.audienceChip__title{ font-size: var(--text-sm); font-weight: 600; color: var(--ink); }
.audienceChip__desc{ font-size: var(--text-xs); color: var(--ink-3); }
.audienceChip--on{ border-color: var(--primary); background: var(--primary-soft); box-shadow: inset 0 0 0 1px var(--primary); }
.audienceChip--on .audienceChip__title,
.audienceChip--on .audienceChip__desc{ color: var(--primary); }
.audienceChip--on:disabled{ opacity: 1; }

.tagBadge{ font-variant-numeric: tabular-nums; }

.levels{ display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.levelChip{
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    min-height: 44px;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius);
}
.levelChip__n{ font-size: var(--text-sm); font-weight: 600; color: var(--ink); }
.levelChip__cefr{ font-size: var(--text-xs); color: var(--ink-3); }
.levelChip--on{ border-color: var(--primary); background: var(--primary-soft); box-shadow: inset 0 0 0 1px var(--primary); }
.levelChip--on .levelChip__n,
.levelChip--on .levelChip__cefr{ color: var(--primary); }
.levelChip--on:disabled{ opacity: 1; }

.tags{ display: flex; flex-wrap: wrap; gap: var(--space-2); }
.tagOption{
    font-size: var(--text-sm);
    border-radius: var(--radius-pill);
    padding: var(--space-1) var(--space-3);
}
.tagOption--on{
    color: var(--on-primary);
    background: var(--primary);
    border-color: var(--primary);
}
.tagOption--on:hover:not(:disabled){ color: var(--on-primary); background: var(--primary-hover); }
.tagOption--on:disabled{ opacity: 1; }

.kind{ font-family: var(--font-display); font-size: var(--text-lg); font-weight: 600; margin: 0; }

/* ---- checks: a summary of what still stands in the way ---- */
.checksCard{ border-color: var(--warning-soft); box-shadow: inset 3px 0 0 var(--warning), var(--shadow-1); }
.checksCard--ready{ border-color: var(--success-soft); box-shadow: inset 3px 0 0 var(--success), var(--shadow-1); }
.checks{ list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.check{ display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); line-height: 1.4; color: var(--ink-2); }
.check__mark{
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    border-radius: 50%;
    font-size: 11px;
    font-weight: 700;
    color: var(--success);
    background: var(--success-soft);
}
.check--failed{ color: var(--ink); }
.check__jump{
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.check__jump:hover{ color: var(--danger); text-decoration: underline; text-underline-offset: 2px; }
.check--failed .check__mark{ color: var(--warning); background: var(--warning-soft); }

/* ---- narrower screens: the details come first, the content under them ---- */
@media (max-width: 1000px){
    .submit__split{ grid-template-columns: minmax(0, 1fr); }
    /* Two balanced columns of cards, packed like a newspaper so none leave holes. */
    .details{
        order: -1;
        display: block;
        columns: 300px 2;
        column-gap: var(--space-3);
    }
    .details > .card{
        break-inside: avoid;
        margin-bottom: var(--space-3);
    }
}

</style>
