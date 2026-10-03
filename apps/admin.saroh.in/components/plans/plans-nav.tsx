"use client";

import type { ReactNode } from "react";
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";

import type { PlansTab } from "@/lib/pricing-draft";

/**
 * Which Plans & modules tab is open, and where on it to land (plans
 * catalogue U6). Its own module so a tab can read it without importing
 * the tab row, which imports every tab (a cycle `check:cycles` refuses).
 * `plans-tabs.tsx` re-exports it.
 */

/** Where to land on a tab: the Modules matrix opens Plans on one plan's row. */
export interface PlansFocus {
    planId?: string;
    moduleId?: string;
}

export interface PlansNav {
    tab: PlansTab;
    /** Open a tab, optionally on a plan or a module row. */
    setTab: (tab: PlansTab, focus?: PlansFocus) => void;
    /** Set by `setTab`; the tab that lands clears it once it has used it. */
    focus: PlansFocus | null;
    clearFocus: () => void;
}

const NavContext = createContext<PlansNav | null>(null);

export function usePlansNav(): PlansNav {
    const nav = useContext(NavContext);
    if (!nav) throw new Error("usePlansNav is used outside PlansNavProvider");
    return nav;
}

export function PlansNavProvider({
    initialTab,
    children,
}: {
    initialTab: PlansTab;
    children: ReactNode;
}) {
    const [tab, setTabState] = useState<PlansTab>(initialTab);
    const [focus, setFocus] = useState<PlansFocus | null>(null);

    const setTab = useCallback((next: PlansTab, at?: PlansFocus) => {
        setTabState(next);
        setFocus(at ?? null);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", next);
        window.history.replaceState(window.history.state, "", url);
    }, []);

    const clearFocus = useCallback(() => setFocus(null), []);

    const value = useMemo(
        () => ({ tab, setTab, focus, clearFocus }),
        [tab, setTab, focus, clearFocus],
    );
    return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
