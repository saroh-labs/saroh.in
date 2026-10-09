"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { tabFromParam } from "@/lib/settings/search";

/**
 * A page's tabs, kept in its address (`?section=tax`), so Search settings
 * and a shared link can open the tab that holds a setting.
 *
 * The tab is local state, so a click answers at once; choosing one writes it
 * back with `replaceState` — no history entry per tab, and no fetch — and an
 * address that changes underneath (a search hit on the same page) moves the
 * tab to match. The first tab is the page's own address, with no query.
 */
export function useTabParam<K extends string>(
    param: string,
    keys: readonly K[],
    fallback: K,
    {
        push = false,
    }: {
        /**
         * Each tab its own history entry, so Back returns to the last one
         * (a location's page). Still no fetch: Next follows a native
         * `pushState` into `useSearchParams`.
         */
        push?: boolean;
    } = {},
): [K, (key: K) => void] {
    const fromUrl = tabFromParam(useSearchParams().get(param), keys, fallback);
    const [tab, setLocal] = useState(fromUrl);
    const [seen, setSeen] = useState(fromUrl);
    // The address moved: follow it, in render rather than an effect.
    if (fromUrl !== seen) {
        setSeen(fromUrl);
        setLocal(fromUrl);
    }
    const setTab = (key: K) => {
        // Only the tab: `seen` follows the address, which Next updates
        // after this render, so setting it here would snap the tab back.
        setLocal(key);
        const url = new URL(window.location.href);
        if (key === fallback) url.searchParams.delete(param);
        else url.searchParams.set(param, key);
        if (url.href === window.location.href) return;
        if (push) window.history.pushState(null, "", url);
        else window.history.replaceState(null, "", url);
    };
    return [tab, setTab];
}
