import { defineStore } from 'pinia';
import { Exception, ExceptionType } from '@/core/exceptions/models/ExceptionType';
import { ContentDataSource } from '@/features/shared/datasources/contentDataSource';
import type { $ApprovedContentFilter, $ContentRecord, $ContentSummary,
              ContentLanguage } from '@/features/shared/models/contentType';
import { CONTENT_LANGUAGES } from '@/features/shared/models/contentType';
import { OnboardingDataSource } from '@/features/onboarding_feature/datasources/onboardingDataSource';
import type { LearnerAccess } from '@/features/onboarding_feature/models/OnboardingTypes';
import { DEFAULT_WALLPAPER, defaultWallpaperFor, isKnownWallpaper,
         wallpaperStorageKey } from '@/features/learner_experience/functions/wallpapers';
import { ReadingDataSource } from '@/features/learner_experience/datasources/learnerDataSource';

//The wallpaper choice lives in this browser, under the learner's own key (see
//wallpaperStorageKey): a comfort setting, not account data, and no table holds
//it. Reads one learner's choice, falling back to their theme's default when
//storage is empty, unreadable, or holds something not on offer in that theme.
function readStoredWallpaper(userId: number | null, isChild: boolean): string {
    try {
        const stored = window.localStorage.getItem(wallpaperStorageKey(userId));
        return stored != null && isKnownWallpaper(stored, isChild) ? stored : defaultWallpaperFor(isChild);
    } catch {
        return defaultWallpaperFor(isChild);
    }
}

//Narrows the free-text target language the onboarding row stores to a language
//content is actually written in. Anything else means "no language filter".
function toContentLanguage(targetLanguage: string | undefined): ContentLanguage | null {
    return CONTENT_LANGUAGES.find((language) => language === targetLanguage) ?? null;
}

//Counts catalogue requests, so a slow, stale answer is ignored.
let catalogueRequest = 0;

export const learnerExperienceStore = defineStore('learnerExperienceStore', {
    state: () => ({
        //Approved rows the learner may read, as the server returned them.
        catalogue: [] as $ContentSummary[],
        isCatalogueLoading: false,
        catalogueError: null as Exception | null,

        //The one piece of content open in the reader, with its pages.
        openContent: null as $ContentRecord | null,
        isContentLoading: false,
        contentError: null as Exception | null,
        //The 0-based page the reader opens at: where the learner last left off.
        resumePage: 0,
        //Set when a page change could not be saved; reading carries on regardless.
        progressSaveError: null as Exception | null,

        //The learner's own setup: what they are learning and what they may see.
        targetLanguage: null as ContentLanguage | null,
        access: null as LearnerAccess | null,
        areSettingsLoaded: false,
        settingsError: null as Exception | null,

        //Set from the signed-in learner's own choice when the reader opens.
        wallpaper: DEFAULT_WALLPAPER,

        //The level Explore was last filtered to, so "Back to Explore" returns
        //to the same shelf. For this session and this learner only.
        exploreLevel: null as { userId: number | null; level: 'all' | number } | null,
    }),

    getters: {
        //An under-13 learner cannot turn the child-friendly filter off. The server
        //applies the same gate, so this only keeps the UI honest about it.
        childFriendlyLocked(state): boolean {
            return state.access?.contentAudience === 'child';
        },
        //The author's name, from the record itself, or from its catalogue row
        //for a server that does not send it with the record.
        openContentAuthorName(state): string | null {
            const open = state.openContent;
            if (open == null) return null;
            if (open.authorName) return open.authorName;
            return state.catalogue.find((row) => row.contentId === open.contentId)?.authorName ?? null;
        },
    },

    actions: {
        //Loads the learner's target language and access policy. Both come from the
        //server; neither is ever assumed here. The policy is its own call: the
        //settings row does not carry it.
        async loadLearnerSettings(): Promise<void> {
            this.settingsError = null;

            const [settings, access] = await Promise.all([
                OnboardingDataSource.getSettings(),
                OnboardingDataSource.getAccess(),
            ]);
            //Without the policy the child gate shows unlocked; the server still applies it.
            this.access = access.data ?? null;
            this.areSettingsLoaded = true;

            if (settings.error != null || settings.data == null) {
                //404 means setup has not been done yet, which the setup screen handles.
                if (settings.error != null && settings.error.statusCode !== 404) {
                    this.settingsError = settings.error;
                }
                return;
            }

            this.targetLanguage = toContentLanguage(settings.data.target_language);
        },

        //Loads what the learner may read. The server filters by approved status,
        //language, level and the child gate; the screen only searches what comes back.
        async loadCatalogue(filter: $ApprovedContentFilter = {}): Promise<void> {
            this.isCatalogueLoading = true;
            this.catalogueError = null;

            //Filters can change faster than the server answers: only the latest
            //request may fill the shelf.
            const request = ++catalogueRequest;
            const response = await ContentDataSource.getApprovedContent(filter);
            if (request !== catalogueRequest) return;
            this.isCatalogueLoading = false;

            if (response.error != null || response.data == null) {
                this.catalogue = [];
                this.catalogueError = response.error;
                return;
            }

            this.catalogue = response.data;
        },

        //Opens one piece of content in the reader.
        async loadContent(contentId: number): Promise<void> {
            this.isContentLoading = true;
            this.contentError = null;
            this.openContent = null;

            const response = await ContentDataSource.getContent(contentId);
            this.isContentLoading = false;

            if (response.error != null || response.data == null) {
                this.contentError = response.error;
                return;
            }

            //Approved content is the only thing a learner may read; the server
            //returns a record by id whatever its status.
            if (response.data.status !== 'approved') {
                this.contentError = new Exception({
                    exceptionType: ExceptionType.FORBIDDEN,
                    message: 'This content is not available to read.',
                    statusCode: 403,
                });
                return;
            }

            this.openContent = response.data;
        },

        //Opens content at the page the learner left it on. Content and saved
        //page load together; a missing saved page just starts at the beginning.
        //Left on the last page means it was finished, so reading it again
        //starts from the beginning rather than at "The end".
        async openForReading(contentId: number): Promise<void> {
            const [, progress] = await Promise.all([
                this.loadContent(contentId),
                ReadingDataSource.getProgress(contentId),
            ]);
            const pageCount = this.openContent?.content.length ?? 0;
            const saved = progress.data?.page ?? 0;
            const finished = pageCount > 1 && saved === pageCount - 1;
            this.resumePage = saved >= 0 && saved < pageCount && !finished ? saved : 0;
        },

        //Remembers the page the learner is on, so they can come back to it.
        async saveReadingProgress(contentId: number, page: number, totalPages: number): Promise<void> {
            const response = await ReadingDataSource.saveProgress(contentId, page, totalPages);
            this.progressSaveError = response.error;
        },

        //Forgets the open content when the reader closes.
        clearOpenContent(): void {
            this.openContent = null;
            this.contentError = null;
            this.resumePage = 0;
            this.progressSaveError = null;
        },

        //Remembers the level Explore is filtered to, for this learner.
        rememberExploreLevel(userId: number | null, level: 'all' | number): void {
            this.exploreLevel = { userId, level };
        },

        //The level Explore was last filtered to by this learner, or null.
        rememberedExploreLevel(userId: number | null): 'all' | number | null {
            return this.exploreLevel?.userId === userId ? this.exploreLevel.level : null;
        },

        //Shows one learner's saved wallpaper (or their theme's default).
        loadWallpaperFor(userId: number | null, isChild: boolean): void {
            this.wallpaper = readStoredWallpaper(userId, isChild);
        },

        //Saves the wallpaper choice for this learner, in this browser only. Only
        //a wallpaper on offer in their theme is accepted.
        setWallpaper(css: string, userId: number | null, isChild: boolean): void {
            if (!isKnownWallpaper(css, isChild)) return;
            this.wallpaper = css;
            try {
                window.localStorage.setItem(wallpaperStorageKey(userId), css);
            } catch {
                //A browser with storage blocked still gets the wallpaper this session.
            }
        },
    },
});
