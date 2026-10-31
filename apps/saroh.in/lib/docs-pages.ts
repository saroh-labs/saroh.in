import { createDocsLoader } from "@saroh/search-pages/docs";

import { DOC_FILES, DOC_PARTIAL, DOC_SOURCES } from "./docs-content.gen";

/**
 * The GST pages, guides and downloads this build carries: every page on a
 * preview, only live ones that pass their checks in production
 * (`docs-content.config.ts`). Server-only: `client-bundle.test.ts` keeps it,
 * and the words it holds, out of every client component's reach.
 */
export const docPages = createDocsLoader({
    sources: DOC_SOURCES,
    files: DOC_FILES,
    partial: DOC_PARTIAL,
});
