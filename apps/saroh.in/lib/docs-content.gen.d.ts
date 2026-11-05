// The types of lib/docs-content.gen.ts, which docs-content.config.ts writes
// before every build and `next dev` (git-ignored: a production build holds
// only live pages). This file lets typecheck and lint run without it; a
// build without it fails to resolve the module, never guesses.
import type { DocFiles, DocSources } from "@saroh/search-pages/docs";

export declare const DOC_SOURCES: DocSources;
export declare const DOC_FILES: DocFiles;
export declare const DOC_PARTIAL: boolean;
