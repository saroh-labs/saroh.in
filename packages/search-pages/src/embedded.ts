import { SOURCES, TOOL_SOURCES } from "./content.gen";
import { createSearchPagesLoader } from "./load";

/**
 * Every /for/ page and free tool in the code, drafts too: for admin, which
 * previews drafts, the package's checks and tests. saroh.in never imports
 * this (it builds its own live-only copy, `docs-content.config.ts`); a test
 * holds it to that.
 */
export { SOURCES, TOOL_SOURCES };

export const embeddedSearchPages = createSearchPagesLoader({
    sources: SOURCES,
    toolSources: TOOL_SOURCES,
});

export const {
    allSearchPages,
    allToolPages,
    listSearchPages,
    loadSearchPage,
    loadToolPage,
} = embeddedSearchPages;
