/**
 * A location's description and logo, as The place says them in one row
 * ("Description and logo · Description added, no logo yet · Edit"). They
 * are edited in the row's sheet (`storefrontDetailsHref` opens it); the
 * row only says what is saved. Pure.
 */
export interface LocationDetails {
    description: string | null;
    logo: string | null;
}

export function detailsSummary(details: LocationDetails): string {
    const description = Boolean(details.description?.trim());
    const logo = Boolean(details.logo?.trim());
    if (description && logo) return "Description and logo added";
    if (description) return "Description added, no logo yet";
    if (logo) return "Logo added, no description yet";
    return "No description or logo yet";
}

/** Whether either is still to add, for the row's quieter wording. */
export function detailsEmpty(details: LocationDetails): boolean {
    return !details.description?.trim() && !details.logo?.trim();
}
