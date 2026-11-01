/**
 * The search-page groups built on the shared page kit (plan
 * 2026-10-31-002): GST pages, guides and downloads. Adding a group is one
 * entry here. `/for/` and `/tools/` are not on this list: they keep their
 * own code paths.
 *
 * Plain JS with no imports, so saroh.in's Node config files
 * (`search-pages.config.js`, `redirects.js`) can `require` it without a
 * build. The API keeps a copy of the ids (`search-page-rules.ts`), which
 * `src/kinds.test.ts` holds to this list.
 */

/** @type {import("./kinds").DocKind[]} */
const DOC_KINDS = [
    {
        id: "gst",
        prefix: "/gst/",
        hub: "/gst",
        hubLabel: "GST guides",
        takenOffTo: "hub",
        sitemap: "gst",
        listWords: "the /gst list, the menu and the footer",
        content: "gst",
    },
    {
        id: "guides",
        prefix: "/guides/",
        hub: "/guides",
        hubLabel: "Guides",
        takenOffTo: "hub",
        sitemap: "guides",
        listWords: "the /guides list, the menu and the footer",
        content: "guides",
    },
    {
        id: "downloads",
        prefix: "/downloads/",
        hub: "/downloads",
        hubLabel: "Free downloads",
        takenOffTo: "hub",
        sitemap: "downloads",
        listWords: "the /downloads list, the menu and the footer",
        content: "downloads",
    },
];

/** Each group's path prefix: `/gst/`, `/guides/`, `/downloads/`. */
const DOC_PREFIXES = DOC_KINDS.map((k) => k.prefix);

/** A page address in one of these groups: `/<id>/<slug>`. */
const DOC_PAGE_PATH = new RegExp(
    `^/(${DOC_KINDS.map((k) => k.id).join("|")})/[a-z0-9-]+$`,
);

/**
 * The group a page address is in, or null when it's in none of them.
 * @param {string} path
 */
const docKindOf = (path) =>
    DOC_KINDS.find((k) => path.startsWith(k.prefix)) ?? null;

/**
 * Where a taken-off page of `kind` sends its visitors: the group's hub
 * while any of its pages is live, else Home.
 * @param {import("./kinds").DocKind} kind
 * @param {readonly string[]} live the live page addresses
 */
const takenOffDestination = (kind, live) =>
    live.some((p) => p.startsWith(kind.prefix)) ? kind.hub : "/";

module.exports = {
    DOC_KINDS,
    DOC_PREFIXES,
    DOC_PAGE_PATH,
    docKindOf,
    takenOffDestination,
};
