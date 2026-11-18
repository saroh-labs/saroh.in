import Link from "next/link";

import type { SitePage, SiteRedirect } from "@/lib/sites/service";
import { pageState } from "@/lib/sites/site-state";
import { ListCard, ListRow } from "@saroh/ui/list-card";

/**
 * Links and sharing › Page links you share (WXPLinks): each page's one
 * link, home first. A page whose link changed since the last publish says
 * so (an AUTO old link to it waits for Publish); the rest say what the
 * public sees of the page. The link itself is changed in the page's
 * settings, on Pages.
 */
export function LinksList({
    siteId,
    host,
    pages,
    currentPublicationId,
    redirects,
}: {
    siteId: string;
    /** The business's web address (DEC-230); null before it has one. */
    host: string | null;
    pages: readonly SitePage[];
    currentPublicationId: string | null;
    /** Null when they couldn't be read: no row then claims a change. */
    redirects: readonly SiteRedirect[] | null;
}) {
    const changed = new Set(
        (redirects ?? [])
            .filter((r) => r.source === "AUTO" && !r.live)
            .map((r) => r.toPath),
    );
    const sorted = [...pages].sort(
        (a, b) => Number(b.isHome) - Number(a.isHome),
    );
    return (
        <section aria-labelledby="page-links" className="grid gap-3">
            <div className="grid gap-1">
                <h2 id="page-links" className="text-base font-semibold">
                    Page links you share
                </h2>
                <p className="text-sm text-muted-foreground">
                    Each page has one link. Change it in the page&apos;s
                    settings, on{" "}
                    <Link
                        href={`/sites/${siteId}/pages`}
                        className="font-medium text-foreground underline underline-offset-4"
                    >
                        Pages
                    </Link>
                    .
                </p>
            </div>
            <ListCard main="Page link" end="Changed">
                {sorted.map((page) => (
                    <li
                        key={page.id}
                        className="border-b border-border last:border-b-0"
                    >
                        <ListRow
                            title={
                                <span className="break-all font-mono text-[13px]">
                                    {host
                                        ? `${host}${page.path === "/" ? "" : page.path}`
                                        : page.path}
                                </span>
                            }
                            sub={`${page.title}${page.hidden ? " (hidden)" : ""}`}
                            end={
                                <span className="text-right text-[12px] text-muted-foreground">
                                    {changed.has(page.path)
                                        ? "Changed · goes live when you publish"
                                        : pageState(page, {
                                              currentPublicationId,
                                          }).label}
                                </span>
                            }
                        />
                    </li>
                ))}
            </ListCard>
        </section>
    );
}
