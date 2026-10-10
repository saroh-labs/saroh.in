/**
 * The Posts tab's "Categories" sheet has no page of its own: this asks the
 * Posts tab to open with it showing. A plain module, so the server page that
 * redirects here and the client sheet that reads it agree on the name.
 */
export const CATEGORIES_PARAM = "categories";

/** The Posts tab with the categories sheet open. */
export function postCategoriesHref(siteId: string): string {
    return `/sites/${siteId}/posts?${CATEGORIES_PARAM}=1`;
}
