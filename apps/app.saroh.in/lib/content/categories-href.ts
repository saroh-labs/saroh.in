/**
 * The Posts tab's "Categories" sheet has no page of its own: this asks the
 * Posts tab to open with it showing. A plain module, so the server page that
 * redirects here and the client sheet that reads it agree on the name.
 */
export const CATEGORIES_PARAM = "categories";

/**
 * The Posts tab with the categories sheet open; in the Website area,
 * Writing itself, so an old link lands in one hop, not two (each hop's
 * page starts its reads before it moves on).
 */
export function postCategoriesHref(siteId: string, area = false): string {
    return `/sites/${siteId}/${area ? "writing" : "posts"}?${CATEGORIES_PARAM}=1`;
}
