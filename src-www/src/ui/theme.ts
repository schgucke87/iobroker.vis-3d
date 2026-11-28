import { create } from 'zustand';

/** Colour scheme of the editor and viewer UI: follow the system, or fixed light / dark. */
export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'vis3d.theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function readPref(): ThemePref {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'light' || v === 'dark') return v;
    } catch {
        /* storage blocked */
    }
    return 'auto';
}

export const useTheme = create<{ pref: ThemePref; dark: boolean }>(() => {
    const pref = readPref();
    return { pref, dark: resolve(pref) };
});

function resolve(pref: ThemePref) {
    return pref === 'dark' || (pref === 'auto' && !!media?.matches);
}

function apply() {
    const { pref } = useTheme.getState();
    const dark = resolve(pref);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    useTheme.setState({ dark });
}

export function setThemePref(pref: ThemePref) {
    try {
        if (pref === 'auto') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, pref);
    } catch {
        /* storage blocked: still switch for this session */
    }
    useTheme.setState({ pref });
    apply();
}

/** Applies the stored choice and follows system changes while on "auto". */
export function initTheme() {
    apply();
    media?.addEventListener('change', () => useTheme.getState().pref === 'auto' && apply());
}

export const THEME_LABELS: Record<ThemePref, string> = { auto: '◐ Automatisch', light: '☀ Hell', dark: '☾ Dunkel' };
export const nextTheme = (p: ThemePref): ThemePref => (p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');
