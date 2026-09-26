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
        window.history.replaceState(null, "", url);
    };
    return [tab, setTab];
}
