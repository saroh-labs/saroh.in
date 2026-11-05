export interface DocKind {
    id: "gst" | "guides" | "downloads";
    /** Page addresses start with it: `/gst/`. */
    prefix: string;
    /** The group's hub page: `/gst`. */
    hub: string;
    /** The hub's name in menus and admin's kind choice. */
    hubLabel: string;
    /** A taken-off page goes to the hub while any page of the group is live, else Home. */
    takenOffTo: "hub";
    /** The group's sitemap: `/sitemap/<sitemap>.xml`. */
    sitemap: string;
    /** Where a live page is linked, as admin's publish dialog says it. */
    listWords: string;
    /** The words' folder under `packages/search-pages/content/`. */
    content: string;
}

export type DocKindId = DocKind["id"];
export declare const DOC_KINDS: readonly DocKind[];
export declare const DOC_PREFIXES: readonly string[];
export declare const DOC_PAGE_PATH: RegExp;
export declare function docKindOf(path: string): DocKind | null;
export declare function takenOffDestination(
    kind: DocKind,
    live: readonly string[],
): string;
