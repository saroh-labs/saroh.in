/**
 * @saroh/search-pages — the /for/ trade pages (DEC-193) and the free
 * tools (#1253): their words in `content/for/<slug>.mdx` and
 * `content/tools/<slug>.mdx`, the tools themselves (`src/tools/`), and the
 * templates saroh.in and the admin preview both draw them with. Import "@saroh/search-pages/styles.css" once
 * where a page is drawn; the app must set --font-sans (Geist) and
 * --font-display (Space Grotesk) from packages/ui/fonts.
 */
// `searchPageChecks` is `@saroh/search-pages/checks`: it draws the page with
// react-dom/server, which Next refuses in a Server Component's imports, so
// the index stays importable from one.
export type { SearchPageCheck } from "./checks";
export { ForHub } from "./components/for-hub";
export type { ForHubProps } from "./components/for-hub";
export { PRESETS, smallKeys } from "./components/parts";
export { SearchPage, starterWords } from "./components/search-page";
export type {
    SearchPageLinks,
    SearchPageProps,
} from "./components/search-page";
export { ToolPage } from "./components/tool-page";
export type { ToolPageLinks, ToolPageProps } from "./components/tool-page";
export { ToolsHub } from "./components/tools-hub";
export type { ToolsHubProps } from "./components/tools-hub";
export {
    allSearchPages,
    allToolPages,
    familySlug,
    listSearchPages,
    loadSearchPage,
    loadToolPage,
    parseSearchPage,
    parseToolPage,
} from "./load";
export { FAMILIES, SHAPES } from "./schema";
export type {
    Family,
    ForPageEntry,
    Question,
    SearchPageData,
    SearchPageEntry,
    SearchPageKind,
    Shape,
    ToolPageEntry,
} from "./schema";
export { toolChecks } from "./tool-checks";
export { TOOL_GROUPS } from "./tool-schema";
export type { ToolGroup, ToolPageData } from "./tool-schema";
export {
    EmailGate,
    GATE_WORDS,
    ToolGateProvider,
    emailProblem,
} from "./tools/email-gate";
export type {
    EmailGateProps,
    GateResult,
    GateSubmit,
} from "./tools/email-gate";
export { TOOLS, hasTool } from "./tools/registry";
