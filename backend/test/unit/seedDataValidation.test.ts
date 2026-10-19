// LIN-81: Unit tests validating the demo seed data specifications.
// These tests verify data integrity, domain constraints, role assignments,
// and taxonomy references without requiring a live database connection.
import { describe, it, expect } from 'vitest';
import {
    SEED_USERS,
    SEED_LEVELS,
    SEED_TAGS,
    SEED_CONTENT,
    SEED_TESTS,
    SEED_PASSED_TESTS,
    SEED_CLIP,
    RETIRED_TITLES,
    rightAnswers,
} from '../../scripts/seedDemo.js';
import { checkSubmission } from '../../src/routes/api/routes.api/contentRoutes/functions/validateContent.js';
import { deriveKind } from '../../src/routes/api/routes.api/contentRoutes/methods/contentMethods.js';
import { gradeAnswers, questionBlocksOf } from '../../src/shared/grading.js';
import { TESTS_REQUIRED_PER_LEVEL } from '../../src/shared/levelRules.js';
import { MIN_CHALLENGE_QUESTIONS } from '../../src/routes/api/routes.api/progressRoutes/methods/questionSelector.js';
import type { ContentPages } from '../../src/routes/api/routes.api/contentRoutes/types/contentType.js';

const pagesOf = (title: string) => SEED_CONTENT.find((c) => c.title === title)!.pages as ContentPages;

describe('Demo Seed Data Specification (Unit)', () => {
    describe('Users Specification', () => {
        it('includes accounts representing every system role', () => {
            const roles = new Set(SEED_USERS.map((u) => u.role));
            expect(roles.has('administrator')).toBe(true);
            expect(roles.has('moderator')).toBe(true);
            expect(roles.has('author')).toBe(true);
            expect(roles.has('learner')).toBe(true);
            expect(roles.has('guardian')).toBe(true);
        });

        it('separates adult learner from child learner requiring guardian link', () => {
            const adult = SEED_USERS.find((u) => u.username === 'one_learner');
            const child = SEED_USERS.find((u) => u.username === 'young_learner');

            expect(adult).toBeDefined();
            expect(adult?.requiresGuardianLink).toBe(false);

            expect(child).toBeDefined();
            expect(child?.requiresGuardianLink).toBe(true);
        });

        it('assigns emails to staff/guardians and usernames to learners', () => {
            for (const user of SEED_USERS) {
                if (user.role === 'learner') {
                    expect(user.username).toBeTruthy();
                    expect(user.email).toBeNull();
                } else {
                    expect(user.email).toBeTruthy();
                    expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
                    expect(user.username).toBeNull();
                }
            }
        });
    });

    describe('Taxonomy Levels Specification', () => {
        it('defines all 6 CEFR reading levels in sequential order', () => {
            expect(SEED_LEVELS).toHaveLength(6);
            SEED_LEVELS.forEach((lvl, index) => {
                expect(lvl.levelNumber).toBe(index + 1);
                expect(lvl.name).toBeTruthy();
                expect(lvl.description).toBeTruthy();
            });
        });

        it('configures valid pass marks between 50 and 100 for all levels', () => {
            for (const lvl of SEED_LEVELS) {
                expect(lvl.passMark).toBeGreaterThanOrEqual(50);
                expect(lvl.passMark).toBeLessThanOrEqual(100);
            }
        });
    });

    describe('Taxonomy Tags Specification', () => {
        it('provides both theme and assessment test tags', () => {
            const types = new Set(SEED_TAGS.map((t) => t.tagType));
            expect(types.has('theme')).toBe(true);
            expect(types.has('test')).toBe(true);
        });

        it('conforms to tag naming conventions (kebab-case, max 50 chars)', () => {
            const tagPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
            for (const tag of SEED_TAGS) {
                expect(tag.name).toMatch(tagPattern);
                expect(tag.name.length).toBeLessThanOrEqual(50);
                expect(tag.description).toBeTruthy();
            }
        });

        it('contains unique tag names', () => {
            const tagNames = SEED_TAGS.map((t) => t.name);
            const uniqueNames = new Set(tagNames);
            expect(uniqueNames.size).toBe(tagNames.length);
        });
    });

    describe('Sample Content Specification', () => {
        it('includes content across all four lifecycle statuses', () => {
            const statuses = new Set(SEED_CONTENT.map((c) => c.status));
            expect(statuses.has('draft')).toBe(true);
            expect(statuses.has('pending')).toBe(true);
            expect(statuses.has('approved')).toBe(true);
            expect(statuses.has('rejected')).toBe(true);
        });

        it('ensures all content references valid taxonomy levels and languages', () => {
            const validLanguages = new Set(['english', 'zulu']);
            for (const content of SEED_CONTENT) {
                expect(content.level).toBeGreaterThanOrEqual(1);
                expect(content.level).toBeLessThanOrEqual(6);
                expect(validLanguages.has(content.language)).toBe(true);
                expect(content.title).toBeTruthy();
                expect(content.pages.length).toBeGreaterThan(0);
            }
        });

        it('only references tags that exist in SEED_TAGS', () => {
            const knownTags = new Set(SEED_TAGS.map((t) => t.name));
            for (const content of SEED_CONTENT) {
                for (const tag of content.tags) {
                    expect(knownTags.has(tag)).toBe(true);
                }
            }
        });

        it('specifies complete moderation feedback for rejected content', () => {
            const rejected = SEED_CONTENT.filter((c) => c.status === 'rejected');
            expect(rejected.length).toBeGreaterThanOrEqual(1);

            for (const item of rejected) {
                expect(item.moderationReview).toBeDefined();
                expect(item.moderationReview?.decision).toBe('rejected');
                expect(item.moderationReview?.reason).toBeTruthy();
                expect(item.moderationReview?.reason?.trim().length).toBeGreaterThan(0);
            }
        });

        it('specifies approved decision for approved content with review', () => {
            const approved = SEED_CONTENT.filter((c) => c.status === 'approved');
            expect(approved.length).toBeGreaterThanOrEqual(1);

            for (const item of approved) {
                if (item.moderationReview) {
                    expect(item.moderationReview.decision).toBe('approved');
                }
            }
        });

        it('replaces the Tshivenda lessons with isiZulu ones, and retires the old titles', () => {
            expect(SEED_CONTENT.some((c) => /tshivenda|ndaa/i.test(c.title))).toBe(false);
            const greetings = SEED_CONTENT.find((c) => c.title === 'Sawubona! Everyday Greetings in isiZulu');
            expect(greetings?.language).toBe('zulu');
            expect(greetings?.status).toBe('approved');
            expect(RETIRED_TITLES).toContain('Ndaa! Everyday Greetings in Tshivenda');
            expect(SEED_CONTENT.some((c) => RETIRED_TITLES.includes(c.title))).toBe(false);
        });

        it('has unique titles, since the seed finds existing content by title', () => {
            const titles = SEED_CONTENT.map((c) => c.title);
            expect(new Set(titles).size).toBe(titles.length);
        });

        it('every item that left draft passes the same checks a real submission does', () => {
            for (const item of SEED_CONTENT.filter((c) => c.status !== 'draft')) {
                const problem = checkSubmission({
                    content: item.pages, title: item.title, language: item.language,
                    childFriendly: item.childFriendly, level: item.level, chosenTags: item.tags,
                });
                expect(problem, item.title).toBeNull();
            }
        });
    });

    describe('Approved tests', () => {
        const at = (level: number) => SEED_TESTS.filter((t) => t.level === level);
        const questionCount = (tests: typeof SEED_TESTS) =>
            tests.reduce((sum, t) => sum + questionBlocksOf(t.pages as ContentPages).length, 0);

        it('every test is an approved quiz of 2 to 5 questions with a short text block, tagged with themes', () => {
            const themes = new Set(SEED_TAGS.filter((t) => t.tagType === 'theme').map((t) => t.name));
            for (const test of SEED_TESTS) {
                const pages = test.pages as ContentPages;
                expect(test.status).toBe('approved');
                expect(deriveKind(pages)).toBe('quiz');
                const questions = questionBlocksOf(pages).length;
                expect(questions, test.title).toBeGreaterThanOrEqual(2);
                expect(questions, test.title).toBeLessThanOrEqual(5);
                expect(pages.flat().some((b) => b.itemType === 'Text')).toBe(true);
                expect(test.tags.length).toBeGreaterThan(0);
                for (const tag of test.tags) expect(themes.has(tag), tag).toBe(true);
            }
        });

        it('uses all three question types, and every listening question plays the demo clip', () => {
            const types = new Set(SEED_TESTS.flatMap((t) => questionBlocksOf(t.pages as ContentPages).map((b) => b.itemType)));
            expect([...types].sort()).toEqual(['Fill in the Blank', 'Listen and Choose', 'Multiple Choice']);
            const listening = SEED_TESTS.flatMap((t) => questionBlocksOf(t.pages as ContentPages))
                .filter((b) => b.itemType === 'Listen and Choose');
            for (const block of listening) expect(block.value.fileUrl).toBe(SEED_CLIP.fileUrl);
        });

        it('level 1: at least 7 tests, isiZulu and English, at least 4 child-friendly', () => {
            expect(at(1).length).toBeGreaterThanOrEqual(7);
            expect(new Set(at(1).map((t) => t.language))).toEqual(new Set(['zulu', 'english']));
            expect(at(1).filter((t) => t.childFriendly).length).toBeGreaterThanOrEqual(4);
        });

        it('level 2: at least 5 tests and 15 questions for the level-up challenge, in isiZulu and for children too', () => {
            expect(at(2).length).toBeGreaterThanOrEqual(5);
            expect(questionCount(at(2))).toBeGreaterThanOrEqual(15);
            // The demo learners study isiZulu, and one is a child.
            expect(questionCount(at(2).filter((t) => t.language === 'zulu' && t.childFriendly))).toBeGreaterThanOrEqual(15);
        });

        it('every level from 1 to 5 has enough child-friendly quizzes in each language to level up, with some to spare', () => {
            // A child only sees child-friendly content, and an adult sees it too.
            for (let level = 1; level <= 5; level++) {
                for (const language of ['zulu', 'english'] as const) {
                    const open = at(level).filter((t) => t.language === language && t.childFriendly);
                    expect(open.length, `level ${level} ${language}`).toBeGreaterThanOrEqual(TESTS_REQUIRED_PER_LEVEL + 1);
                }
            }
        });

        it('every level from 2 to 6 has enough child-friendly questions in each language for its level-up challenge', () => {
            for (let level = 2; level <= 6; level++) {
                for (const language of ['zulu', 'english'] as const) {
                    const open = at(level).filter((t) => t.language === language && t.childFriendly);
                    expect(questionCount(open), `level ${level} ${language}`).toBeGreaterThanOrEqual(MIN_CHALLENGE_QUESTIONS);
                }
            }
        });

        it('every fill in the blank sentence marks its gap with exactly one []', () => {
            const gaps = SEED_CONTENT.flatMap((c) => questionBlocksOf(c.pages as ContentPages))
                .filter((b) => b.itemType === 'Fill in the Blank');
            for (const block of gaps) {
                expect(String(block.value.sentence).split('[]').length - 1, String(block.value.sentence)).toBe(1);
            }
        });

        it('the right answers score full marks on every test', () => {
            for (const test of SEED_TESTS) {
                const pages = test.pages as ContentPages;
                const graded = gradeAnswers(pages, rightAnswers(pages));
                expect(graded.score, test.title).toBe(graded.total);
            }
        });
    });

    describe('Seeded learner progress', () => {
        it('each demo learner has passed one test fewer than the level-up challenge needs', () => {
            for (const titles of Object.values(SEED_PASSED_TESTS)) {
                expect(new Set(titles).size).toBe(TESTS_REQUIRED_PER_LEVEL - 1);
            }
        });

        it('the passed tests are level 1 isiZulu tests, child-friendly for the child, with some left to take live', () => {
            const zuluLevelOne = SEED_TESTS.filter((t) => t.level === 1 && t.language === 'zulu');
            for (const [learner, titles] of Object.entries(SEED_PASSED_TESTS)) {
                for (const title of titles) {
                    const test = zuluLevelOne.find((t) => t.title === title);
                    expect(test, title).toBeDefined();
                    if (learner === 'young_learner') expect(test?.childFriendly).toBe(true);
                    expect(questionBlocksOf(pagesOf(title)).length).toBeGreaterThan(0);
                }
                const left = zuluLevelOne.filter((t) => !titles.includes(t.title)
                    && (learner !== 'young_learner' || t.childFriendly));
                expect(left.length, learner).toBeGreaterThanOrEqual(1);
            }
        });
    });
});
