import type { NavSection } from "@saroh/marketing/nav-types";

const within = (pathname: string, ...roots: string[]) =>
    roots.some((r) => pathname === r || pathname.startsWith(`${r}/`));

/** Which top-level section a path is in, for the saffron underline. */
export function sectionOf(pathname: string): NavSection {
    if (within(pathname, "/features")) return "features";
    if (within(pathname, "/solutions")) return "solutions";
    if (within(pathname, "/pricing")) return "pricing";
    if (within(pathname, "/tools")) return "tools";
    if (within(pathname, "/templates")) return "templates";
    if (
        within(
            pathname,
            "/guides",
            "/help",
            "/changelog",
            "/integrations",
            "/about",
            "/contact",
        )
    ) {
        return "resources";
    }
    return null;
}
