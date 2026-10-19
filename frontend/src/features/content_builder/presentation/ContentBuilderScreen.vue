<script setup lang="ts">

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { contentBuilderScreenState } from './state'
import { authStore } from '@/features/auth_feature/state/authStore'
import BlockMux from './components/BlockMux.vue';
import DocumentViewer from '@/features/learner_experience/presentation/components/DocumentViewer.vue';
import { $ContentBlock, ContentBlockTypes, QUESTION_BLOCK_TYPES, emptyValueFor } from '@/features/shared/models/contentType';
import { blockTypeLabel } from '@/features/content_builder/functions/blockTypeLabel';
import ContentStatusBadge from '@/features/media_feature/presentation/screens/components/ContentStatusBadge.vue';
import { formatLongDate } from '@/i18n';

const state = contentBuilderScreenState()
const auth = authStore()
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

//Preview swaps the editor for the learner's own reader, so an author checks the
//real thing rather than a second rendering that could drift from it.
const isPreviewing = ref(false);

//Nothing to preview until there is a block somewhere.
const hasContent = computed(() => state.contentState.some(page => page.length > 0));

//The author's own name, shown on the byline a learner would see.
const authorName = computed(() => auth.currentUser?.name ?? null);

function togglePreview(){
    if (!hasContent.value) return;
    state.selectBlock(-1);
    isPreviewing.value = !isPreviewing.value;
}

//True while pending review or once approved; disables every editing control.
const locked = computed(() => !state.canEdit())

//Why the content cannot be changed, for the notice under the header.
const lockedNotice = computed(() =>
    state.status === 'approved' ? t('builder.approvedNotice') : t('builder.lockedNotice'))

//The day the moderator sent it back, written the way the interface language writes dates.
const rejectedOn = computed(() => {
    void locale.value
    return state.feedback ? formatLongDate(state.feedback.decidedAt) : ''
})

const props = defineProps({
  initialDraftId: {type:Number,default: null,  required: false,},
});

//The content to open: /content-builder/:contentId, or the prop when embedded.
const draftId = computed(() => {
    const fromRoute = Number(route.params.contentId);
    return Number.isInteger(fromRoute) ? fromRoute : props.initialDraftId;
});

//Whether the address is one of the builder's own. Checked first, because the
//watchers below can still run while the screen is being left for another one.
function onBuilderAddress(){
    return route.name === 'contentBuilder' || route.name === 'contentBuilderDraft';
}

//Makes the screen follow the address. /content-builder?new starts an empty draft,
///content-builder/:contentId opens that draft, and plain /content-builder carries on
//with the draft in progress. Once a draft has an id the address shows it, so Save
//only ever writes to the draft the address names.
//Arriving at the screen (fresh) also refreshes saved content with no unsaved changes:
//the copy kept from earlier can be out of date, such as content submitted earlier
//and since rejected by a moderator, which would otherwise still read as pending.
function followAddress(fresh = false){
    if(draftId.value != null){
        if(state.contentId !== draftId.value || (fresh && !state.hasUnsavedChange)) state.loadDraft(draftId.value);
        return;
    }
    if(props.initialDraftId == null && onBuilderAddress()){
        if(route.query.new != null){
            state.startNewDraft();
            router.replace({name:'contentBuilder'});
            return;
        }
        if(state.contentId != null){
            if(fresh && !state.hasUnsavedChange) state.loadDraft(state.contentId);
            router.replace({name:'contentBuilderDraft', params:{contentId:String(state.contentId)}});
            return;
        }
    }
    if(state.page < 0 && state.contentState.length > 0) state.selectPage(0);
}

//The tag list is loaded for the submit screen whichever draft is open.
onMounted(() => {
    state.loadAvailableTags();
    followAddress(true);
})

//The same screen stays mounted when the address changes between builder addresses.
watch(() => route.fullPath, () => {
    if(onBuilderAddress()) followAddress();
})

//A new draft's first save gives it an id, and deleting a draft takes it away:
//keeps the address naming the draft on screen.
watch(() => state.contentId, (id) => {
    if(props.initialDraftId != null || !onBuilderAddress()) return;
    const shown = route.params.contentId != null ? Number(route.params.contentId) : null;
    if(id === shown) return;
    if(id == null) router.replace({name:'contentBuilder'});
    else router.replace({name:'contentBuilderDraft', params:{contentId:String(id)}});
})

//Clears this draft and starts an empty one, after it has been submitted.
function startNewDraft(){
    state.startNewDraft();
    if(route.params.contentId != null) router.push({name:'contentBuilder'});
}

//Blocks on the selected page.
const blocks = computed(() => state.contentState[state.page] || []);

//Closes the open block when pressing outside every block. Buttons are skipped, so a
//closing block cannot shift one out from under the pointer and cancel its click.
function deselectOnOutsideClick(event:MouseEvent){
    if ((event.target as HTMLElement).closest('.blockRow, button')) return;
    state.selectBlock(-1);
}
//Ends any hold or armed row when the mouse is released anywhere on the page.
function disarmDrag(){
    cancelHold();
    armedIndex.value = -1;
}

//Listens on the whole document for closing blocks and ending holds.
onMounted(() => {
    document.addEventListener('mousedown',deselectOnOutsideClick);
    document.addEventListener('mouseup',disarmDrag);
});
//Removes the document listeners.
onBeforeUnmount(() => {
    document.removeEventListener('mousedown',deselectOnOutsideClick);
    document.removeEventListener('mouseup',disarmDrag);
});

//Block types an author can add from the palette; the untyped placeholder is left out.
const paletteTypes = computed(() =>
    Object.values(ContentBlockTypes).filter(t => t != ContentBlockTypes.pendingSelection));
//The palette groups them: blocks a learner reads or hears, then questions.
const paletteContentTypes = computed(() => paletteTypes.value.filter(t => !QUESTION_BLOCK_TYPES.includes(t)));
const paletteQuestionTypes = computed(() => paletteTypes.value.filter(t => QUESTION_BLOCK_TYPES.includes(t)));

//Adds an untyped block to the selected page.
function addItem(){
    state.addBlock();
}

//Adds a block of the chosen type to the selected page and opens it.
function addTypedBlock(type:ContentBlockTypes){
    state.addBlock();
    state.writeBlock(state.getLastBlockIndexOnCurrentPage(), new $ContentBlock(type,emptyValueFor(type)));
}

//Adds a page and selects it.
function addPage(){
    state.addPage();
}

//Drag to reorder. A row is draggable only while armed (armedIndex): at once from the
//grip, or after holding the card for HOLD_TO_DRAG_MS. Fields and buttons never arm.
const HOLD_TO_DRAG_MS = 180;
const armedIndex = ref(-1);
let holdTimer:number|undefined;

//Arms a row for dragging on mousedown: at once on the grip, after a short hold elsewhere.
function beginHold(index:number,event:MouseEvent){
    if (locked.value) return;
    const target = event.target as HTMLElement;
    if (target.closest('.blockRow__grip')){
        armedIndex.value = index;
        return;
    }
    if (target.closest('input, textarea, select, button')) return;
    holdTimer = window.setTimeout(() => { armedIndex.value = index; }, HOLD_TO_DRAG_MS);
}

//Cancels a hold that has not armed yet.
function cancelHold(){
    if (holdTimer !== undefined){
        clearTimeout(holdTimer);
        holdTimer = undefined;
    }
}
//Row being dragged and the gap it would drop into, -1 when not dragging.
const dragIndex = ref(-1);
const dropIndex = ref(-1);

//Starts dragging a row.
function onDragStart(index:number,event:DragEvent){
    dragIndex.value = index;
    event.dataTransfer!.effectAllowed = 'move';
    //Firefox will not start a drag without payload on the transfer.
    event.dataTransfer!.setData('text/plain',String(index));
}

//Sets the drop gap from the pointer: above this block in its top half, below it in its bottom half.
function onDragOver(index:number,event:DragEvent){
    if (dragIndex.value < 0) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = event.clientY > box.top + box.height / 2;
    dropIndex.value = below ? index + 1 : index;
}

//Moves the dragged block into the drop gap.
function onDrop(){
    if (dragIndex.value >= 0 && dropIndex.value >= 0){
        state.moveBlock(dragIndex.value,dropIndex.value);
    }
    onDragEnd();
}

//Clears all drag state.
function onDragEnd(){
    armedIndex.value = -1;
    dragIndex.value = -1;
    dropIndex.value = -1;
}

//Deletes the draft after the author confirms.
async function deleteDraft(){
    if (!window.confirm(t('builder.confirmDelete'))) return;
    await state.deleteDraft();
}

let saving = false;
//Saves the draft, ignoring clicks while a save is in progress.
async function save(){
    if(saving){
        return;
    }
    saving = true;
    await state.save();
    saving = false;
}

</script>


<template>
  <main class="builder ui-page ui-page--wide">

    <header class="builder__bar">
        <div class="builder__identity">
            <p class="ui-eyebrow">{{ t('builder.eyebrow') }}</p>
            <div class="builder__titleRow">
                <input class="builder__titleInput" type="text" :value="state.title" :disabled="locked"
                       maxlength="120"
                       :placeholder="t('builder.untitledDraft')" :aria-label="t('builder.titleLabel')"
                       @input="state.setTitle(($event.target as HTMLInputElement).value)">
                <ContentStatusBadge v-if="!state.isLoading" :status="state.status"/>
                <small :class="['builder__saved',{'builder__saved--dirty':state.hasUnsavedChange}]">{{ state.hasUnsavedChange ? t('builder.unsavedChanges') : t('builder.allSaved') }}</small>
            </div>
        </div>
        <div class="builder__actions">
            <button class="ui-btn ui-btn--ghost builder__delete" @click="deleteDraft" :disabled="locked || state.isDeleting">
                {{ state.isDeleting ? t('builder.deleting') : t('builder.deleteDraft') }}
            </button>
            <button :class="['ui-btn',{'builder__previewing':isPreviewing}]" :disabled="!hasContent"
                    :title="hasContent ? t('builder.previewTitle') : t('builder.addBlockFirst')"
                    @click="togglePreview">
                {{ isPreviewing ? t('builder.backToEditing') : t('builder.preview') }}
            </button>
            <button v-if="locked" class="ui-btn" @click="startNewDraft">{{ t('builder.startNewDraft') }}</button>
            <button class="ui-btn" @click="save" :disabled="locked || !state.hasUnsavedChange">
                {{ state.hasUnsavedChange ? t('common.states.save') : t('builder.saved') }}
            </button>
            <button class="ui-btn ui-btn--primary" :disabled="locked" @click="router.push({name:'contentSubmit'})">
                {{ locked ? t(`common.status.${state.status}`)
                   : state.showsRejection ? t('builder.resubmitForReview') : t('builder.submitForReview') }}
            </button>
        </div>
    </header>

    <div class="builder__notices">
        <p v-if="state.loadingError" class="builder__error ui-alert ui-alert--error" role="alert">{{ state.loadingError.message }}</p>
        <p v-if="state.savingError" class="builder__error ui-alert ui-alert--error" role="alert">{{ state.savingError.message }}</p>
        <p v-if="state.deletingError" class="builder__error ui-alert ui-alert--error" role="alert">{{ state.deletingError.message }}</p>
        <p v-if="locked && !state.isLoading" :class="['builder__locked ui-alert', state.status === 'approved' ? 'ui-alert--success' : 'ui-alert--info']"
           role="status" data-testid="locked-notice">
            {{ lockedNotice }}
        </p>
        <section v-if="state.showsRejection && state.feedback && !state.isLoading" class="rejection" data-testid="rejection-feedback"
                 :aria-label="t('builder.rejection.heading')">
            <p class="rejection__label">{{ t('builder.rejection.heading') }}</p>
            <blockquote class="rejection__reason">{{ state.feedback.reason || t('builder.rejection.noReason') }}</blockquote>
            <p v-if="state.feedback.moderator || rejectedOn" class="rejection__meta">
                <template v-if="state.feedback.moderator">{{ t('builder.rejection.reviewedBy', {name: state.feedback.moderator}) }}</template><template v-if="state.feedback.moderator && rejectedOn"> · </template>{{ rejectedOn }}
            </p>
            <p class="rejection__next">
                {{ state.status === 'rejected' ? t('builder.rejection.editToReopen') : t('builder.rejection.reopened') }}
            </p>
        </section>
    </div>

    <section v-if="isPreviewing" class="preview" :aria-label="t('builder.learnerPreview')">
        <p class="preview__note ui-alert" role="status">
            {{ t('builder.previewNote') }}
        </p>
        <div class="preview__frame ui-card">
            <DocumentViewer show-questions :title="state.title || t('builder.untitledDraft')" :pages="state.contentState"
                            :author-name="authorName"/>
        </div>
    </section>

    <div v-else class="builder__split">

        <aside class="pages" :aria-label="t('builder.pages.heading')">
            <h3 class="colHead">{{ t('builder.pages.heading') }}</h3>
            <div class="pages__list">
                <div v-for="(page,index) in state.contentState || []" :key="index"
                     :class="['pageCard',{'pageCard--selected':state.page == index}]">
                    <button class="pageCard__select" :aria-current="state.page == index ? 'page' : undefined"
                            @click="state.selectPage(index)">
                        <span class="pageCard__name">{{ t('builder.pages.page', {n: index + 1}) }}</span>
                        <span class="pageCard__count">{{ t('builder.pages.blockCount', page.length) }}</span>
                    </button>
                    <button v-if="!locked && state.contentState.length > 1" class="pageCard__remove"
                            :title="t('builder.pages.deletePage', {n: index + 1})" :aria-label="t('builder.pages.deletePage', {n: index + 1})"
                            @click="state.removePage(index)">×</button>
                </div>
            </div>
            <button @click="addPage" class="btn--dashed" :disabled="locked">{{ t('builder.pages.addPage') }}</button>
        </aside>

        <section class="blocks" :aria-label="t('builder.blocks.region')">
            <div class="blocks__head">
                <h2 class="blocks__title">{{ state.page >= 0 ? t('builder.pages.page', {n: state.page + 1}) : t('builder.blocks.noPageSelected') }}</h2>
                <small class="muted">{{ t('builder.pages.blockCount', blocks.length) }}</small>
            </div>

            <p v-if="state.isLoading" class="blocks__loading" role="status">
                <span class="ui-spinner" aria-hidden="true"></span> {{ t('common.states.loading') }}
            </p>
            <div v-else-if="blocks.length == 0" class="blocks__empty">
                <p class="blocks__emptyTitle">{{ state.page >= 0 ? t('builder.blocks.emptyPage') : t('builder.blocks.pickPage') }}</p>
                <p class="blocks__emptyText">
                    {{ state.page >= 0 ? t('builder.blocks.emptyPageHint') : t('builder.blocks.pickPageHint') }}
                </p>
            </div>

            <div v-for="(item,index) in blocks" :key="index"
                 :class="['blockRow',
                          {'blockRow--editing':state.isBlockEditable(state.page,index),
                           'blockRow--locked':locked,
                           'blockRow--armed':armedIndex==index && dragIndex<0,
                           'blockRow--dragging':dragIndex==index,
                           'blockRow--dropAbove':dropIndex==index,
                           'blockRow--dropBelow':dropIndex==index+1}]"
                 :draggable="!locked && armedIndex==index"
                 @click="state.selectBlock(index)"
                 @mousedown="beginHold(index,$event)"
                 @dragstart="onDragStart(index,$event)"
                 @dragover.prevent="onDragOver(index,$event)"
                 @drop.prevent="onDrop"
                 @dragend="onDragEnd">
                <span class="blockRow__grip" :title="t('builder.blocks.dragToReorder')">⠿</span>
                <span class="blockRow__type">{{ blockTypeLabel(item.itemType) }}</span>
                <div class="blockRow__body">
                    <BlockMux :page="state.page" :block="index"/>
                </div>
                <button v-if="!locked" class="blockRow__remove" :title="t('builder.blocks.deleteBlock')" :aria-label="t('builder.blocks.deleteBlock')"
                        @click.stop="state.deleteBlock(index)">×</button>
            </div>

            <button @click="addItem" class="btn--dashed" :disabled="locked || state.page < 0">{{ t('builder.blocks.addBlock') }}</button>
        </section>

        <aside class="palette" :aria-label="t('builder.palette.region')">
            <div class="palette__group">
                <h3 class="colHead">{{ t('builder.palette.content') }}</h3>
                <button v-for="type in paletteContentTypes" :key="type" class="btn--listed"
                        :disabled="locked || state.page < 0" @click="addTypedBlock(type)">
                    <span class="palette__plus" aria-hidden="true">+</span>{{ blockTypeLabel(type) }}
                </button>
            </div>
            <div class="palette__group">
                <h3 class="colHead">{{ t('builder.palette.questions') }}</h3>
                <button v-for="type in paletteQuestionTypes" :key="type" class="btn--listed"
                        :disabled="locked || state.page < 0" @click="addTypedBlock(type)">
                    <span class="palette__plus" aria-hidden="true">+</span>{{ blockTypeLabel(type) }}
                </button>
                <small class="palette__hint">{{ t('builder.palette.quizHint') }}</small>
            </div>
        </aside>

    </div>
  </main>
</template>

<style scoped>

.builder{ padding-top: 0; }
.muted{ color: var(--ink-3); font-size: var(--text-sm); }

/* ---- header: sticks under the app shell so Save and Submit stay in reach ---- */
.builder__bar{
    position: sticky;
    top: var(--header-height);
    z-index: 10;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: var(--space-5) 0 var(--space-4);
    margin-bottom: var(--space-5);
    background: var(--bg);
    border-bottom: 1px solid var(--rule);
}
.builder__identity{ display: flex; flex-direction: column; min-width: 0; flex: 1 1 320px; }
.builder__identity .ui-eyebrow{ padding-left: var(--space-2); }
.builder__titleRow{ display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); min-width: 0; }
.builder__titleInput{
    flex: 0 1 auto;
    width: min(100%, 26ch);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 600;
    line-height: 1.2;
    color: var(--ink);
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    transition: border-color .15s ease, background .15s ease;
}
.builder__titleInput::placeholder{ color: var(--ink-3); }
/* Where supported, the title box is as wide as the title, so the badge sits beside it. */
@supports (field-sizing: content){
    .builder__titleInput{ width: auto; field-sizing: content; min-width: 10ch; max-width: 100%; }
}
.builder__titleInput:hover:not(:disabled){ border-color: var(--rule); background: var(--surface); }
.builder__titleInput:focus{
    outline: none;
    border-color: var(--primary);
    background: var(--surface);
    box-shadow: var(--focus-ring);
}
.builder__titleInput:disabled{ color: var(--ink); }
.builder__saved{ font-size: var(--text-xs); color: var(--ink-3); display: inline-flex; align-items: center; gap: var(--space-1); }
.builder__saved::before{
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
}
.builder__saved--dirty{ color: var(--warning); }
.builder__saved--dirty::before{ background: var(--warning); }
.builder__actions{ display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.builder__delete{ color: var(--danger); }
.builder__delete:hover:not(:disabled){ color: var(--danger); background: var(--danger-soft); }
.builder__previewing{ border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }

.builder__notices{ display: flex; flex-direction: column; gap: var(--space-2); }
.builder__notices:not(:empty){ margin-bottom: var(--space-4); }
.builder__error, .builder__locked{ margin: 0; }

/* The moderator's reason for sending the content back, as on the dashboard's Feedback tab. */
.rejection{
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--danger-soft);
    border-left: 4px solid var(--danger);
    border-radius: var(--radius);
}
.rejection p{ margin: 0; }
.rejection__label{
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--danger);
}
.rejection__reason{
    margin: 0;
    color: var(--ink);
    white-space: pre-line;
    overflow-wrap: anywhere;
}
.rejection__meta{ font-size: var(--text-xs); color: var(--ink-3); }
.rejection__next{ font-size: var(--text-sm); color: var(--ink-2); }
.blockRow--locked{ cursor: default; }

/* ---- learner preview: the reader sits in a reading-width card ---- */
.preview{ display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
.preview__note{ width: 100%; max-width: 820px; margin: 0; color: var(--ink-2); }
.preview__frame{
    width: 100%;
    max-width: 820px;
    padding: var(--space-6) var(--space-6) var(--space-5);
    box-shadow: var(--shadow-2);
}

/* ---- three column split, as in the A-02 wireframe ---- */
.builder__split{
    display: grid;
    grid-template-columns: 168px minmax(0, 1fr) 216px;
    grid-template-areas: "pages blocks palette";
    gap: var(--space-5);
    align-items: start;
}
.pages{ grid-area: pages; }
.blocks{ grid-area: blocks; }
.palette{ grid-area: palette; }

.colHead{
    font-family: var(--font-body);
    font-size: var(--text-xs);
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--ink-3);
    font-weight: 600;
    margin: 0 0 var(--space-1);
}

/* Dashed "add" buttons under the pages and blocks. */
.btn--dashed{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 40px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--ink-2);
    background: transparent;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.btn--dashed:hover:not(:disabled){ color: var(--primary); border-color: var(--primary); background: var(--primary-soft); }
.btn--dashed:disabled{ opacity: .5; cursor: not-allowed; }

/* ---- pages ---- */
.pages, .pages__list{ display: flex; flex-direction: column; gap: var(--space-2); }
.pageCard{
    position: relative;
    display: flex;
    color: var(--ink-2);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    transition: border-color .15s ease, background .15s ease;
}
.pageCard:hover{ border-color: var(--rule-strong); color: var(--ink); }
.pageCard__select{
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: var(--space-2) var(--space-6) var(--space-2) var(--space-3);
    font: inherit;
    color: inherit;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: inherit;
    cursor: pointer;
}
.pageCard__name{ font-size: var(--text-sm); font-weight: 600; }
.pageCard__count{ font-size: var(--text-xs); color: var(--ink-3); }
.pageCard__remove{
    position: absolute;
    top: 50%;
    right: var(--space-1);
    transform: translateY(-50%);
    width: 26px;
    height: 26px;
    font: inherit;
    font-size: var(--text-md);
    line-height: 1;
    color: var(--ink-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
}
.pageCard__remove:hover{ color: var(--danger); background: var(--danger-soft); }
.pageCard--selected{
    color: var(--primary);
    background: var(--primary-soft);
    border-color: var(--primary);
    box-shadow: none;
}
.pageCard--selected:hover{ color: var(--primary); border-color: var(--primary); }
.pageCard--selected .pageCard__count{ color: var(--primary); opacity: .8; }

/* ---- blocks ---- */
.blocks{ display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
.blocks__head{
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
}
.blocks__title{
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 600;
}
.blocks__loading{
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-5);
    color: var(--ink-2);
    font-size: var(--text-sm);
}
.blocks__empty{
    padding: var(--space-6) var(--space-5);
    text-align: center;
    background: var(--surface-2);
    border-radius: var(--radius-lg);
}
.blocks__emptyTitle{
    margin: 0 0 var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--ink);
}
.blocks__emptyText{ margin: 0; font-size: var(--text-sm); color: var(--ink-2); }

/* A block: grip and remove at the sides, the type as a small label over its body. */
.blockRow{
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
        "grip type remove"
        "grip body remove";
    column-gap: var(--space-3);
    row-gap: var(--space-2);
    padding: var(--space-3) var(--space-3) var(--space-4) var(--space-2);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1);
    cursor: pointer;
    transition: border-color .15s ease, box-shadow .15s ease;
}
.blockRow:hover{ border-color: var(--rule-strong); }
.blockRow--editing,
.blockRow--editing:hover{
    border-color: var(--primary);
    box-shadow: 0 0 0 3px var(--primary-soft), var(--shadow-1);
    cursor: auto;
}
/* Held long enough to drag: say so before the author starts moving. */
.blockRow--armed{
    cursor: grab;
    border-color: var(--rule-strong);
    box-shadow: var(--shadow-2);
    /* Stop a text selection competing with the drag once the row is armed. */
    user-select: none;
}
.blockRow--dragging{ opacity: .4; }
/* Drop lines sit in the gap between rows, so showing one never moves a row. */
.blockRow--dropAbove::before,
.blockRow--dropBelow::after{
    content: '';
    position: absolute;
    left: var(--space-3);
    right: var(--space-3);
    height: 3px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    pointer-events: none;
}
.blockRow--dropAbove::before{ top: calc(-1 * var(--space-2) + -1px); }
.blockRow--dropBelow::after{ bottom: calc(-1 * var(--space-2) + -1px); }
.blockRow__grip{
    grid-area: grip;
    align-self: stretch;
    display: flex;
    align-items: flex-start;
    padding: 2px var(--space-1) 0;
    font-size: var(--text-md);
    line-height: 1;
    color: var(--ink-3);
    border-radius: var(--radius-sm);
    cursor: grab;
    user-select: none;
}
.blockRow__grip:hover{ color: var(--ink-2); background: var(--surface-2); }
.blockRow__grip:active{ cursor: grabbing; }
.blockRow--locked .blockRow__grip{ cursor: default; opacity: .4; }
.blockRow__type{
    grid-area: type;
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--ink-3);
}
.blockRow--editing .blockRow__type{ color: var(--primary); }
.blockRow__body{ grid-area: body; min-width: 0; }
.blockRow__remove{
    grid-area: remove;
    align-self: start;
    width: 28px;
    height: 28px;
    font: inherit;
    font-size: var(--text-lg);
    line-height: 1;
    color: var(--ink-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
}
.blockRow__remove:hover{ color: var(--danger); background: var(--danger-soft); }

/* ---- palette ---- */
.palette{
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius-lg);
}
.palette__group{ display: flex; flex-direction: column; gap: var(--space-1); }
.palette__group + .palette__group{ padding-top: var(--space-4); border-top: 1px solid var(--rule); }
.btn--listed{
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 36px;
    padding: 0 var(--space-3);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background .15s ease;
}
.btn--listed:hover:not(:disabled){ border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.btn--listed:disabled{ opacity: .5; cursor: not-allowed; }
.palette__plus{ width: 12px; color: var(--ink-3); font-weight: 600; }
.btn--listed:hover:not(:disabled) .palette__plus{ color: var(--primary); }
.palette__hint{ margin-top: var(--space-1); font-size: var(--text-xs); color: var(--ink-3); }

/* ---- narrower screens: the palette becomes a strip over the editor ---- */
@media (max-width: 1100px){
    .builder__split{
        grid-template-columns: 152px minmax(0, 1fr);
        grid-template-areas:
            "palette palette"
            "pages blocks";
    }
    .palette{ gap: var(--space-3); padding: var(--space-3) var(--space-4); }
    .palette__group{ flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .palette__group + .palette__group{ padding-top: var(--space-3); }
    .palette .colHead{ width: 88px; margin: 0; }
    .btn--listed{ width: auto; }
    .palette__hint{ margin-top: 0; }
}
@media (max-width: 720px){
    .builder__split{
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas: "palette" "pages" "blocks";
    }
    .builder__bar{ position: static; }
    .pages__list{ flex-direction: row; flex-wrap: wrap; }
    .pageCard{ min-width: 120px; }
    .palette .colHead{ width: 100%; }
}

</style>
