/**
 * @saroh/search-pages — the /for/ trade pages (DEC-193): their words in
 * `content/for/<slug>.mdx`, and the one template saroh.in and the admin
 * preview both draw them with. Import "@saroh/search-pages/styles.css" once
 * where a page is drawn; the app must set --font-sans (Geist) and
 * --font-display (Space Grotesk) from packages/ui/fonts.
 */
export { searchPageChecks } from "./checks";
export type { SearchPageCheck } from "./checks";
export { ForHub } from "./components/for-hub";
export type { ForHubProps } from "./components/for-hub";
export { SearchPage } from "./components/search-page";
export type {
    SearchPageLinks,
    SearchPageProps,
} from "./components/search-page";
export {
    allSearchPages,
    familySlug,
    listSearchPages,
    loadSearchPage,
    parseSearchPage,
} from "./load";
export { FAMILIES, SHAPES } from "./schema";
export type {
    Family,
    Question,
    SearchPageData,
    SearchPageEntry,
    Shape,
} from "./schema";
