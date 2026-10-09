/**
 * The person page (UX-050, #869): `/contacts/<contactId>`, on a tab when
 * one is named (`?tab=inv`). Every link to a person in the workspace is
 * built here; `/customers/<id>` only redirects to it.
 */
export function personHref(contactId: string, tab?: string | null): string {
    const path = `/contacts/${encodeURIComponent(contactId)}`;
    return tab ? `${path}?tab=${encodeURIComponent(tab)}` : path;
}
