/**
 * `@saroh/search-pages/pages`: the GST page, guide and download templates
 * and their hubs. Their own subpath, not the index, so their stylesheets
 * never reach a /for/ or tools page's build (plan 2026-10-31-002, R12).
 */
export {
    DownloadsHub,
    GUIDE_TRADE_LABELS,
    GstHub,
    GuidesHub,
    guidesFor,
} from "./components/content-hubs";
export type {
    DownloadsHubPage,
    GstHubPage,
    GuidesHubPage,
    HubLinks,
} from "./components/content-hubs";
export {
    DOWNLOAD_GATE_WORDS,
    DownloadGate,
    DownloadGateProvider,
    phoneDigits,
} from "./components/download-gate";
export type {
    DownloadContact,
    DownloadResult,
    DownloadSubmit,
} from "./components/download-gate";
export { DownloadPage } from "./components/download-page";
export type { DownloadPageLinks } from "./components/download-page";
export { GstPage, NOT_TAX_ADVICE } from "./components/gst-page";
export type { GstPageLinks } from "./components/gst-page";
export { GuidePage } from "./components/guide-page";
export type { GuidePageLinks } from "./components/guide-page";
