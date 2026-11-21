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
 * every Ask AI button sets, rendered once as `<AskAiPageIs>`. The top bar
 * asks about the page; a section's toolbar or sheet, or choosing a section
 * while the panel is open, about that section. With nothing chosen it is
 * the page again.
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
    const [on, setOn] = useState<AskAiOn>("page");
    const chosen = chrome ?? active?.section.key ?? null;
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
