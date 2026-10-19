//One background a learner can pick for their reading. CSS gradients rather than
//photos: nothing to download, nothing to fail, and every option stays inside the
//app's own palette.
//id names its label in the learner.wallpaper.names messages.
export type WallpaperId =
    | 'warmPaper' | 'deepForest' | 'duskInk' | 'sunbakedClay' | 'morningMist' | 'giltDusk'
    | 'sunnyDay' | 'skyBlue' | 'bubblegum' | 'mintLeaf' | 'lavender' | 'rainbow';

export interface Wallpaper {
    id: WallpaperId;
    css: string;
}

//The grown-up set: calm, grounded colours from the default theme.
export const WALLPAPERS: readonly Wallpaper[] = [
    { id: 'warmPaper', css: '#F3EEE2' },
    { id: 'deepForest', css: 'linear-gradient(160deg, #2F4A3C, #1B2E24)' },
    { id: 'duskInk', css: 'linear-gradient(160deg, #3A3530, #221E19)' },
    { id: 'sunbakedClay', css: 'linear-gradient(160deg, #C97B54, #A8462F)' },
    { id: 'morningMist', css: 'linear-gradient(160deg, #E7EDE9, #C9D3CC)' },
    { id: 'giltDusk', css: 'linear-gradient(160deg, #B98A2E, #7C5A1E)' },
];

//The child set: bright and light, from the child theme's tones, so the white
//page always stands out on them.
export const CHILD_WALLPAPERS: readonly Wallpaper[] = [
    { id: 'sunnyDay', css: '#FFF7E8' },
    { id: 'skyBlue', css: 'linear-gradient(160deg, #CFE3FF, #8DB8FF)' },
    { id: 'bubblegum', css: 'linear-gradient(160deg, #FFD6E0, #FF9EB5)' },
    { id: 'mintLeaf', css: 'linear-gradient(160deg, #D4F5EF, #7FDCCF)' },
    { id: 'lavender', css: 'linear-gradient(160deg, #EADCFB, #C3A3F0)' },
    { id: 'rainbow', css: 'linear-gradient(135deg, #FFD3D3, #FFE9A8, #C9F2EC, #CFE0FF, #E6D6FA)' },
];

export const DEFAULT_WALLPAPER = WALLPAPERS[0].css;
export const DEFAULT_CHILD_WALLPAPER = CHILD_WALLPAPERS[0].css;

/** The wallpapers on offer in a theme. */
export function wallpapersFor(isChild: boolean): readonly Wallpaper[] {
    return isChild ? CHILD_WALLPAPERS : WALLPAPERS;
}

/** The background a learner reads on until they pick one. */
export function defaultWallpaperFor(isChild: boolean): string {
    return isChild ? DEFAULT_CHILD_WALLPAPER : DEFAULT_WALLPAPER;
}

//Whether a stored string is still one of the wallpapers on offer (in the given
//theme, when one is given). Guards against a value left in localStorage by an
//older build, or one picked before the learner's theme changed.
export function isKnownWallpaper(css: string, isChild?: boolean): boolean {
    const offered = isChild === undefined ? [...WALLPAPERS, ...CHILD_WALLPAPERS] : wallpapersFor(isChild);
    return offered.some((wallpaper) => wallpaper.css === css);
}

/**
 * Where one learner's choice is kept. Per account, so the next person to sign
 * in on the same browser does not inherit it; no account (should not happen in
 * the reader) shares one fallback key.
 */
export function wallpaperStorageKey(userId: number | null): string {
    return userId == null ? 'lingolearn_learner_wallpaper' : `lingolearn_learner_wallpaper:${userId}`;
}
