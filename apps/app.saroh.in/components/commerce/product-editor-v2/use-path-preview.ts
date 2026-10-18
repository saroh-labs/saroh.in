"use client";

import { useEffect, useState } from "react";

import { slugify } from "@/lib/products/editor-sections";
import type { PathSuggestion } from "@/lib/products/path-actions";
import { suggestProductPath } from "@/lib/products/path-actions";

/** How long the name rests before the path is asked for. */
const WAIT_MS = 300;

/**
 * New product's path as the name is typed (products audit, 16 Oct 2026):
 * the name's own at once, then — once the API has said — the path it will
 * really get ("packing-tape-2") and who has the name's own. Off while
 * editing: a saved product's path is typed by hand.
 */
export function usePathPreview(name: string, on: boolean): PathSuggestion {
    const own = slugify(name);
    const [asked, setAsked] = useState<{
        own: string;
        said: PathSuggestion;
    } | null>(null);

    useEffect(() => {
        if (!on || !own) return;
        let live = true;
        const timer = setTimeout(() => {
            void suggestProductPath(name).then((said) => {
                if (live && said) setAsked({ own, said });
            });
        }, WAIT_MS);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [on, own, name]);

    // Only an answer for the name as it now reads counts.
    if (asked?.own === own && asked.said.path) return asked.said;
    return { path: own, holder: null };
}
