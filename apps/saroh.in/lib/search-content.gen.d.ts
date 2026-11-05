// The types of lib/search-content.gen.ts, which docs-content.config.ts
// writes before every build and `next dev` (git-ignored: a production
// build holds only live /for/ pages and tools). Lets typecheck and lint run
// without it; a build without it fails to resolve the module.
export declare const SOURCES: Record<string, string>;
export declare const TOOL_SOURCES: Record<string, string>;
