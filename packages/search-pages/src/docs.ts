/**
 * `@saroh/search-pages/docs`: the GST pages', guides' and downloads'
 * loader factory, schemas, types and checks, with none of their words.
 * The words come from `./docs-embedded` (admin: every page) or the site's
 * own live-only copy.
 */
export {
    blockWords,
    outlineOf,
    parseBlocks,
    parseInline,
} from "./blocks/parse";
export type { Block, Inline, OutlineItem } from "./blocks/types";
export { GST_CHECKED_MAX_DAYS, docPageChecks } from "./docs-checks";
export { createDocsLoader, parseDocPage } from "./docs-load";
export type {
    DocFiles,
    DocPage,
    DocSources,
    DocsLoader,
    DocsLoaderOptions,
    DownloadPage,
    GstPage,
    GuidePage,
} from "./docs-load";
export {
    DOWNLOAD_FORMATS,
    downloadFrontmatterSchema,
} from "./kinds/download-schema";
export type { DownloadFrontmatter } from "./kinds/download-schema";
export {
    GST_TABLE_KINDS,
    gstCardName,
    gstFrontmatterSchema,
} from "./kinds/gst-schema";
export type { GstFrontmatter } from "./kinds/gst-schema";
export { GUIDE_TRADES, guideFrontmatterSchema } from "./kinds/guide-schema";
export type { GuideFrontmatter } from "./kinds/guide-schema";
