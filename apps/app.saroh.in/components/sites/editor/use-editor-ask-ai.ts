"use client";

import { useState } from "react";

import { openAskAi } from "@/components/ask-ai/open";
import type { AskAiPage } from "@/lib/ask-ai/page-hints";
import { sitePagePage, siteSectionPage } from "@/lib/ask-ai/page-hints";

import { SECTION_LABELS } from "./editor-constants";
import type { ActiveSection } from "./use-editor-selection";

/** Where Ask AI was opened from: the top bar (the page) or a section's own button. */
export type AskAiOn = "page" | "section";

/**
 * What Ask AI is about in the site editor (owner, 21 Nov): the one state
 * every Ask AI entry sets, rendered once as `<AskAiPageIs>`. The section
 * chosen, if any, or else the page: so the right column's Ask AI tab and ⌘J
 * follow the selection, a section's toolbar or sheet asks about it, and
 * Find and the phone's page menu ask about the page.
 */
export function useEditorAskAi({
    siteId,
    pageId,
    pageTitle,
    active,
    chrome,
}: {
    siteId: string;
    pageId: string;
    pageTitle: string;
    active: ActiveSection | null;
    chrome: "header" | "footer" | null;
}): { page: AskAiPage; open: (on: AskAiOn) => void } {
    const chosen = chrome ?? active?.section.key ?? null;
    const [on, setOn] = useState<AskAiOn>(chosen ? "section" : "page");
    // Choosing a section moves the panel to it, open or not.
    const [seen, setSeen] = useState(chosen);
    if (seen !== chosen) {
        setSeen(chosen);
        if (chosen) setOn("section");
    }

    const at = { siteId, pageId, title: pageTitle };
    let page = sitePagePage(at);
    if (on === "section" && chrome) {
        page = siteSectionPage({
            ...at,
            sectionKey: chrome,
            name: chrome === "header" ? "Header" : "Footer",
            everywhere: true,
        });
    } else if (on === "section" && active?.section.key) {
        page = siteSectionPage({
            ...at,
            sectionKey: active.section.key,
            name: SECTION_LABELS[active.section.type],
        });
    }
    return {
        page,
        open: (next) => {
            setOn(next);
            openAskAi();
        },
    };
}
