import { defineStore } from "pinia";
import { $ContentBlock, ContentBlockTypes, emptyValueFor, type $ContentDraft, type $ContentRecord,
         type ContentLanguage, type ContentStatus } from "@/features/shared/models/contentType";
import { ContentDataSource } from "@/features/shared/datasources/contentDataSource";
import { ReviewDetailDataSource } from "@/features/review_detail_feature/datasources/reviewDetailDataSource";
import type { AuthorFeedbackRow } from "@/features/review_detail_feature/models/ReviewDetailTypes";
import { TaxonomyDataSource } from "@/features/media_feature/datasources/taxonomyDataSource";
import { CONTENT_LEVELS, CONTENT_LANGUAGE_OPTIONS } from "@/features/shared/models/contentType";
import { isAvailableTag, submissionChecks } from "@/features/content_builder/functions/submission";
import { dropTargetIndex } from "@/features/content_builder/functions/reorder";
import { MAX_TAGS_PER_CONTENT } from "@/features/media_feature/models/TaxonomyTypes";
import type { Exception } from "@/core/exceptions/models/ExceptionType";
import { localizeServerMessage } from "@/i18n";
import { translate as t } from "@/features/content_builder/functions/translate";

//The server's reason for refusing a request, when it gave one: a 4xx carries it, such
//as "text in a block can be at most 2000 characters". Anything else, a server that is
//down or failing, reads as the fallback rather than as a raw error. The server's
//reason is put in the interface language when it is one the locale files know.
export function reasonOr(error:Exception|null|undefined, fallback:string):string{
    const status = error?.statusCode ?? 0;
    return status >= 400 && status < 500 && error?.message ? localizeServerMessage(error.message) : fallback;
}

export const contentBuilderScreenState = defineStore('contentBuilderState', {
  state: () => ({
    //Id of the whole content, assigned by the server on the first save. Blocks have no ids.
    contentId: null as number | null,
    //Selected page index, -1 when none.
    page: -1,
    contentState: [[]] as Array<Array<$ContentBlock>>,
    isLoading: false,
    //Index of the block open for editing on the selected page, -1 when none.
    inspectedBlock: -1,
    loadingError: null as Error | null,
    hasUnsavedChange: false,
    savingError: null as Error | null,
    //Set on the submit screen. Story or quiz is derived from the blocks, so it is not stored.
    status: 'draft' as ContentStatus,
    title: '',
    language: null as ContentLanguage | null,
    childFriendly: false,
    audience: null as 'child-friendly' | 'general' | null,
    assignedTheme: null as string | string[] | null,
    level: null as number | null,
    chosenTags: [] as string[],
    //The theme tags the taxonomy offers, loaded from the server.
    availableTags: [] as string[],
    isSubmitting: false,
    submittingError: null as Error | null,
    isDeleting: false,
    deletingError: null as Error | null,
    //The moderator's newest decision on this content, null when there is none.
    feedback: null as AuthorFeedbackRow | null,
  }),

  getters: {
    //Whether the moderator's reason for sending this back should be shown: while it
    //is rejected, and once editing has reopened it as a draft, until it is sent again.
    showsRejection(state):boolean{
        return state.feedback?.decision === 'rejected' && (state.status === 'rejected' || state.status === 'draft');
    },
  },

  actions: {
    //Whether the content can be changed. A draft can, and so can rejected content:
    //editing it answers the moderator's feedback and reopens it as a draft.
    canEdit():boolean{
        return this.status === 'draft' || this.status === 'rejected';
    },
    //Loads the theme tags an author may choose. Falls back to keeping whatever was
    //loaded before, so a failed call never empties the picker mid-edit.
    async loadAvailableTags(){
        const response = await TaxonomyDataSource.getTags('theme');
        if (response.error != null || response.data == null) return;
        this.availableTags = response.data.map(tag => tag.name);
    },
    //Loads saved content by id and selects its first page. Loading the content already
    //open refreshes it quietly instead, keeping the selected page, so its status is
    //always the server's (a moderator may have decided on it since it was last loaded).
    //Unsaved changes made while the refresh was on its way are never overwritten.
    async loadDraft(contentId:number){
        const refreshing = this.contentId === contentId;
        if (!refreshing){
            this.isLoading = true;
            this.feedback = null;
        }
        const [response] = await Promise.all([
            ContentDataSource.getContent(contentId),
            this.loadFeedback(contentId),
        ]);
        this.isLoading = false;
        if (refreshing && this.hasUnsavedChange) return;
        if (response.error != null || response.data == null){
            if (refreshing) return;
            this.contentState = [];
            this.loadingError = Error(t('builder.errors.loading'));
            return;
        }
        const page = this.page;
        this.applyRecord(response.data);
        this.loadingError = null;
        if (refreshing && page >= 0 && page < this.contentState.length){
            this.page = page;
        } else if(this.contentState.length != 0){
            this.page = 0
        }
    },
    //Finds the moderator's newest decision on this content, for the reason a rejection
    //gives. A failed call leaves whatever was known, since the builder works without it.
    async loadFeedback(contentId:number){
        const response = await ReviewDetailDataSource.getMyFeedback();
        if (response.error != null || response.data == null) return;
        const decisions = response.data.filter(row => row.contentId === contentId);
        this.feedback = decisions.reduce<AuthorFeedbackRow | null>(
            (newest, row) => newest === null || row.decidedAt > newest.decidedAt ? row : newest, null);
    },
    //Takes everything the server stored for this content. The server keeps only
    //childFriendly and the tags in order, so the audience and theme are read back from them.
    applyRecord(record:$ContentRecord){
        this.contentId = record.contentId;
        this.status = record.status;
        this.title = record.title;
        this.language = record.language;
        this.childFriendly = record.childFriendly;
        this.audience = record.childFriendly ? 'child-friendly' : 'general';
        this.level = record.level;
        this.chosenTags = [...record.chosenTags];
        this.assignedTheme = record.chosenTags.length > 0 ? record.chosenTags[0] : null;
        this.contentState = record.content;
    },
    //Adds an empty page at the end and selects it.
    addPage() {
        if (!this.canEdit()) return;
        if (!this.contentState) {
        this.contentState = [[]];
      }
        this.contentState.push([]);
        this.page = this.contentState.length -1;
        this.touchSavedContent();

    },
    //Selects a page and closes any open block.
    selectPage(index:number){
        this.page = index;
        this.inspectedBlock = -1;
    },
    //Removes a page and keeps the selection on the same page, or the one before it
    //when the selected page is removed. The last page cannot be removed.
    removePage(index:number){
        if (!this.canEdit()) return;
        if (this.contentState.length <= 1 || index < 0 || index >= this.contentState.length) return;
        this.contentState = this.contentState.filter((val, i)=>i != index);
        if (this.page > index || (this.page == index && index > 0)){
            this.page--
        }
        this.inspectedBlock = -1;
        this.touchSavedContent();

    },

    //Adds an untyped block to the end of the selected page and opens it.
    addBlock(){
        if (!this.canEdit()) return;
        if (!this.contentState[this.page]) {
        this.contentState[this.page] = [];
    }
        this.contentState[this.page].push(new $ContentBlock(ContentBlockTypes.pendingSelection,emptyValueFor(ContentBlockTypes.pendingSelection)));
        this.inspectedBlock = this.getLastBlockIndexOnCurrentPage();
        this.touchSavedContent();
    },
    //Opens one block for editing, or closes it with -1. Nothing opens once submitted.
    selectBlock(index:number){
        this.inspectedBlock = this.canEdit() ? index : -1;
    },
    //Whether the block at this page and position is the one open for editing.
    isBlockEditable(page:number,block:number):boolean{
        return this.canEdit() && this.page == page && this.inspectedBlock == block;
    },
    //Removes a block from the selected page and keeps the same block open.
    deleteBlock(index:number){
        if (!this.canEdit()) return;
        this.contentState[this.page] = this.contentState[this.page].filter((val, i)=>i != index);
        if (this.inspectedBlock == index){
            this.inspectedBlock = -1;
        } else if (this.inspectedBlock > index){
            this.inspectedBlock--;
        }
        this.touchSavedContent();
    },
    //Replaces the block at a position on the selected page.
    writeBlock(index:number,content:$ContentBlock){
        if (!this.canEdit()) return;
        this.contentState[this.page][index] = content;
        this.touchSavedContent();

    },
    //Moves a block into a gap on the selected page: 0 is above the first block,
    //blocks.length is below the last. The open block stays open.
    moveBlock(from:number,insertAt:number){
        if (!this.canEdit()) return;
        const blocks = this.contentState[this.page];
        if (!blocks) return;
        const target = dropTargetIndex(from, insertAt, blocks.length);
        if (target === null) return;

        //Tracked by identity so the open block stays open wherever it lands.
        const selected = this.inspectedBlock >= 0 ? blocks[this.inspectedBlock] : null;
        const [moved] = blocks.splice(from,1);
        blocks.splice(target,0,moved);
        this.inspectedBlock = selected ? blocks.indexOf(selected) : -1;
        this.touchSavedContent();
    },
    //Index of the last block on the selected page.
    getLastBlockIndexOnCurrentPage():number{
        return this.contentState[this.page].length - 1
    },
    //Type of the block at a page and position.
    getTypeForPageAndBlock(page:number,block:number):ContentBlockTypes{
        return this.contentState[page][block].itemType;
    },
    //Marks the draft as having unsaved changes.
    touchSavedContent(){
        this.hasUnsavedChange = true;
    },
    //Everything a draft save sends: the pages and whatever the submit screen has
    //filled in so far, so going back to the builder and saving loses none of it.
    draft():$ContentDraft{
        return {
            content: this.contentState,
            title: this.title,
            language: this.language,
            childFriendly: this.childFriendly,
            level: this.level,
            chosenTags: [...this.chosenTags],
        };
    },
    //Creates the draft on the first save, then edits it under the id the server returned.
    async save(){
        if (!this.canEdit()) return;
        const {audience, assignedTheme} = this;
        const response = this.contentId === null
            ? await ContentDataSource.createContent(this.draft())
            : await ContentDataSource.editContent(this.contentId, this.draft());
        if (response.error != null || response.data == null){
            this.savingError = Error(reasonOr(response.error, t('builder.errors.saving')));
            return;
        }
        this.applyRecord(response.data);
        //Read back from the server, an audience never picked would come back as general
        //and tags with no theme picked would make the first one the theme. The author's
        //own picks stay wherever they still agree with what was saved.
        if ((audience === 'child-friendly') === this.childFriendly) this.audience = audience;
        if (assignedTheme === null || [assignedTheme].flat().every(tag => this.chosenTags.includes(tag))){
            this.assignedTheme = assignedTheme;
        }
        this.savingError = null;
        this.hasUnsavedChange = false;
    },

    //Sets the title shown wherever this content is listed.
    setTitle(title:string){
        if (!this.canEdit()) return;
        this.title = title;
        this.touchSavedContent();
    },
    //Sets the language this content teaches.
    setLanguage(language:string){
        if (!this.canEdit()) return;
        if (!CONTENT_LANGUAGE_OPTIONS.some(option => option.value === language)) return;
        this.language = language as ContentLanguage;
        this.touchSavedContent();
    },
    //Marks the content safe for an under-13 learner, or not.
    setChildFriendly(childFriendly:boolean){
        if (!this.canEdit()) return;
        this.childFriendly = childFriendly;
        this.audience = childFriendly ? 'child-friendly' : 'general';
        this.touchSavedContent();
    },
    //Sets the audience tag (child-friendly vs general)
    setAudience(audience: 'child-friendly' | 'general' | null){
        if (!this.canEdit()) return;
        this.audience = audience;
        this.childFriendly = audience === 'child-friendly';
        this.touchSavedContent();
    },
    //Clears everything and starts a new, empty draft. Used after submitting.
    startNewDraft(){
        this.$reset();
        this.page = 0;
    },

    //Deletes the draft and starts a new, empty one. A draft never saved is only cleared.
    async deleteDraft(){
        if (!this.canEdit() || this.isDeleting) return;
        if (this.contentId !== null){
            this.isDeleting = true;
            const response = await ContentDataSource.deleteContent(this.contentId);
            this.isDeleting = false;
            if (response.error != null){
                this.deletingError = Error(t('builder.errors.deleting'));
                return;
            }
        }
        this.$reset();
        this.page = 0;
    },

    //Sets the level if it is one of CONTENT_LEVELS.
    setLevel(level:number){
        if (!this.canEdit()) return;
        if (!CONTENT_LEVELS.some(l => l.value === level)) return;
        this.level = level;
        this.touchSavedContent();
    },
    //Sets the assigned theme (single-select from availableTags)
    setAssignedTheme(theme: string | string[] | null){
        if (!this.canEdit()) return;
        if (typeof theme === 'string' && !isAvailableTag(theme, this.availableTags)) return;
        if (typeof this.assignedTheme === 'string' && this.assignedTheme !== theme) {
            this.chosenTags = this.chosenTags.filter(t => t !== this.assignedTheme);
        }
        this.assignedTheme = theme;
        if (typeof theme === 'string' && !this.chosenTags.includes(theme)) {
            this.chosenTags.unshift(theme);
        } else if (Array.isArray(theme)) {
            for (const t of theme) {
                if (isAvailableTag(t, this.availableTags) && !this.chosenTags.includes(t)) {
                    this.chosenTags.push(t);
                }
            }
        }
        this.touchSavedContent();
    },
    //Toggles an optional supplementary tag (multi-select up to MAX_TAGS_PER_CONTENT tags in total)
    toggleSupplementaryTag(tag:string){
        if (!this.canEdit()) return;
        if (tag === this.assignedTheme) return;
        if (this.chosenTags.includes(tag)) {
            this.chosenTags = this.chosenTags.filter(t => t !== tag);
        } else {
            if (!isAvailableTag(tag, this.availableTags)) return;
            if (this.chosenTags.length >= MAX_TAGS_PER_CONTENT) return;
            this.chosenTags.push(tag);
        }
        this.touchSavedContent();
    },
    //Adds a tag the taxonomy offers. Returns false for an unknown or repeated tag.
    addChosenTag(tag:string):boolean{
        if (!this.canEdit()) return false;
        if (!isAvailableTag(tag, this.availableTags) || this.chosenTags.includes(tag)) return false;
        if (this.chosenTags.length >= MAX_TAGS_PER_CONTENT) return false;
        //The first tag is read as the theme, so a tag that becomes the theme goes first.
        if (!this.assignedTheme) {
            this.assignedTheme = tag;
            this.chosenTags.unshift(tag);
        } else {
            this.chosenTags.push(tag);
        }
        this.touchSavedContent();
        return true;
    },
    //Removes a chosen tag.
    removeChosenTag(tag:string){
        if (!this.canEdit() || !this.chosenTags.includes(tag)) return;
        this.chosenTags = this.chosenTags.filter(t => t !== tag);
        if (this.assignedTheme === tag) {
            this.assignedTheme = this.chosenTags.length > 0 ? this.chosenTags[0] : null;
        }
        this.touchSavedContent();
    },
    //Runs the submission checks, creates the draft if it has no id, and sends it for
    //review. On success the draft becomes pending and read only.
    async submit(){
        if (!this.canEdit() || this.isSubmitting) return;
        const failed = submissionChecks(this.contentState, {
            title: this.title,
            language: this.language,
            level: this.level,
            theme: this.assignedTheme ?? (this.chosenTags.length > 0 ? this.chosenTags[0] : null),
            audience: this.audience,
            chosenTags: this.chosenTags,
        }).filter(check => !check.passed);
        if (failed.length > 0){
            this.submittingError = Error(t('builder.errors.notReady', {list: failed.map(check => check.label.toLowerCase()).join(', ')}));
            return;
        }
        this.isSubmitting = true;
        try{
            if (this.contentId === null){
                const created = await ContentDataSource.createContent(this.draft());
                if (created.error != null || created.data == null){
                    this.submittingError = Error(reasonOr(created.error, t('builder.errors.submitting')));
                    return;
                }
                this.contentId = created.data.contentId;
            }
            //kind is derived by the server, so it is not sent.
            const response = await ContentDataSource.submitContent(this.contentId, {
                content: this.contentState,
                title: this.title,
                language: this.language as ContentLanguage,
                childFriendly: this.childFriendly,
                level: this.level as number,
                chosenTags: [...this.chosenTags],
            });
            if (response.error != null || response.data == null){
                this.submittingError = Error(reasonOr(response.error, t('builder.errors.submitting')));
                return;
            }
            this.applyRecord(response.data);
            this.inspectedBlock = -1;
            this.hasUnsavedChange = false;
            this.submittingError = null;
        }finally{
            this.isSubmitting = false;
        }
    },
  },
});
