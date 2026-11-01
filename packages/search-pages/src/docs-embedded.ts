import { DOC_FILES, DOC_SOURCES } from "./docs-content.gen";
import { createDocsLoader } from "./docs-load";
import { listSearchPages } from "./load";

/**
 * Every GST page, guide and download in the code, drafts too: for admin,
 * which previews drafts. saroh.in never imports this (it builds its own
 * live-only copy); a test holds it to that.
 */
export { DOC_FILES, DOC_SOURCES };

export const embeddedDocs = createDocsLoader({
    sources: DOC_SOURCES,
    files: DOC_FILES,
    others: () => listSearchPages(),
});
