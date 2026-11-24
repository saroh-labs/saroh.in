import {
    isNavSectionActive,
    NAV_GROUPS,
    navPathname,
} from "@/components/shared/navigation/nav-items";

/** The rail row an address belongs to: Home, Sell, Bookings, Settings… */
export function routeSection(pathname: string): string {
    const at = navPathname(pathname, NAV_GROUPS);
    for (const group of NAV_GROUPS) {
        for (const item of group.items) {
            if (isNavSectionActive(at, item)) return item.href;
        }
    }
    return `/${pathname.split("/")[1] ?? ""}`;
}

/**
 * Whether a page fades in (`wk-route`): only when someone moved to another
 * section. Not the first page of a visit (nothing to move from), not Back or
 * Forward (the page is one they have just seen), and not a move within a
 * section (a tab, a record): the chrome around it stays, so the page should.
 */
export function fadesIn(
    from: string | null,
    to: string,
    viaHistory: boolean,
): boolean {
    return (
        from !== null && !viaHistory && routeSection(from) !== routeSection(to)
    );
}
