import type { UserRole } from '@/features/auth_feature/state/authStore';

//One link in the header. `label` is a translation key; `to` names a route.
//Links to routes that are not registered are left out by the header, so a
//slice's link appears as soon as its route exists.
export interface NavItem {
    label: string;
    to: { name: string; query?: Record<string, string> };
}

//A learner aged 13 or more has no family page: a guardian link is for a child.
//(One linked as a child keeps the link and reaches it, read only, from Settings.)
const LEARNER: NavItem[] = [
    { label: 'common.nav.explore', to: { name: 'explore' } },
    { label: 'common.nav.myLearning', to: { name: 'myLearning' } },
    { label: 'common.nav.levelUp', to: { name: 'challengeIntro' } },
    { label: 'common.nav.settings', to: { name: 'learnerSetup' } },
];

//The same places for a child, in friendlier words, plus their grown-up's link.
//Settings is last, as for an adult, so a child can find their plan (and correct
//a mistyped date of birth while no grown-up is linked yet).
const CHILD: NavItem[] = [
    { label: 'common.nav.explore', to: { name: 'explore' } },
    { label: 'common.nav.myStars', to: { name: 'myLearning' } },
    { label: 'common.nav.levelUp', to: { name: 'challengeIntro' } },
    { label: 'common.nav.myGrownUp', to: { name: 'parentLinking' } },
    { label: 'common.nav.settings', to: { name: 'learnerSetup' } },
];

const BY_ROLE: Record<UserRole, NavItem[]> = {
    learner: LEARNER,
    guardian: [{ label: 'common.nav.myChildren', to: { name: 'parentLinking' } }],
    author: [
        { label: 'common.nav.dashboard', to: { name: 'authorDashboard' } },
        { label: 'common.nav.newContent', to: { name: 'contentBuilder', query: { new: '1' } } },
        { label: 'common.nav.audioLibrary', to: { name: 'uploadAudio' } },
    ],
    moderator: [{ label: 'common.nav.reviewQueue', to: { name: 'reviewQueue' } }],
    administrator: [
        { label: 'common.nav.users', to: { name: 'adminUsers' } },
        { label: 'common.nav.taxonomy', to: { name: 'adminTaxonomy' } },
        { label: 'common.nav.reviewQueue', to: { name: 'reviewQueue' } },
        { label: 'common.nav.content', to: { name: 'authorDashboard' } },
    ],
};

/** The header's links for a role. A child learner gets the child set. */
export function navFor(role: UserRole, isChild: boolean): NavItem[] {
    if (role === 'learner' && isChild) return CHILD;
    return BY_ROLE[role] ?? [];
}

/** The page a role starts on after signing in. Learners go through `home`, which checks setup first. */
export function homeRouteNameFor(role: UserRole): string {
    switch (role) {
        case 'guardian': return 'parentLinking';
        case 'author': return 'authorDashboard';
        case 'moderator': return 'reviewQueue';
        case 'administrator': return 'adminUsers';
        default: return 'explore';
    }
}

/** The translation key naming each role on screen. */
export const ROLE_LABEL_KEYS: Record<UserRole, string> = {
    learner: 'common.roles.learner',
    guardian: 'common.roles.guardian',
    author: 'common.roles.author',
    moderator: 'common.roles.moderator',
    administrator: 'common.roles.administrator',
};

/**
 * English role names, for screens not yet translated. Prefer ROLE_LABEL_KEYS
 * with t() so the name follows the interface language.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
    learner: 'Learner',
    guardian: 'Guardian',
    author: 'Author',
    moderator: 'Moderator',
    administrator: 'Administrator',
};
