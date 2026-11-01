import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { Facts, Panel } from "@/components/panel";
import { PageChecks } from "@/components/search-pages/page-checks";
import { formatDate } from "@/lib/format";
import {
    docSections,
    pageSections,
    toolSections,
} from "@/lib/search-page-content";
import type { PageRow } from "@/lib/search-page-words";
import {
    badgeOf,
    changedByWords,
    KIND_NOUN,
    KINDS,
    takenOffGoesTo,
    whereItShows,
} from "@/lib/search-page-words";
import { loadPage, searchPageForTab } from "@/lib/search-pages";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const page = loadPage(slug);
    // The name, then its kind: tabs of several pages stay told apart.
    return {
        title: page
            ? `${page.page.name} · ${KINDS.find((k) => k.kind === page.kind)?.label}`
            : "Search pages",
    };
}

/**
 * A search page at a glance: how Google shows it, the checks it passes,
 * what's on it, where it shows on the site and the facts about it.
 */
export default async function SearchPageOverview({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const data = await searchPageForTab(slug);
    if (!data) return null;
    const { row, rows, site } = data;
    const page = data.page.page;
    const tool = data.page.kind === "tools" ? data.page.page : null;
    const by = changedByWords(row.record?.changedBy?.name);
    // What its words link to, and the live pages that link here (U12).
    const needs = [
        ...row.links.map((path) => ({
            path,
            to: rows.find((r) => r.path === path) ?? null,
        })),
        ...row.deadLinks.map((path) => ({ path, to: null })),
    ];
    const linkedFrom = rows.filter(
        (r) => r.onSite && r.links.includes(row.path),
    );

    return (
        <div className="flex flex-wrap items-start gap-4">
            <div className="grid min-w-0 flex-[999_1_560px] gap-4">
                <Panel title="How it looks in a Google search">
                    {() => (
                        <div className="grid gap-3">
                            {/* Google's own look, light whatever the console's theme. */}
                            <div className="grid gap-1 rounded-md bg-white px-[18px] py-4 font-[Arial,sans-serif]">
                                <span className="text-xs text-[#4d5156]">
                                    {site.host} › {row.kind} › {page.slug}
                                </span>
                                <span className="text-xl leading-snug text-[#1a0dab]">
                                    {page.title} · Saroh
                                </span>
                                <span className="text-sm leading-normal text-[#4d5156]">
                                    {page.description}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Google may show different words. The title and
                                description come from the page&apos;s file in
                                the code.
                            </p>
                        </div>
                    )}
                </Panel>

                <div id="checks" className="scroll-mt-20">
                    <Panel title="Checked before you publish">
                        {() => <PageChecks page={page} />}
                    </Panel>
                </div>

                {(needs.length > 0 || linkedFrom.length > 0) && (
                    <Panel title="Links">
                        {() => (
                            <div className="grid gap-4">
                                {needs.length > 0 && (
                                    <LinkList
                                        title="Its words link to these. Each must be live, or go live with it."
                                        items={needs}
                                    />
                                )}
                                {linkedFrom.length > 0 && (
                                    <LinkList
                                        title="Live pages that link here. Taking it off sends their readers elsewhere."
                                        items={linkedFrom.map((r) => ({
                                            path: r.path,
                                            to: r,
                                        }))}
                                    />
                                )}
                            </div>
                        )}
                    </Panel>
                )}

                <Panel title="What's on the page">
                    {() => (
                        <dl className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                            {(data.page.kind === "tools"
                                ? toolSections(data.page.page)
                                : data.page.kind === "for"
                                  ? pageSections(data.page.page)
                                  : docSections(data.page.page)
                            ).map((s) => (
                                <div
                                    key={s.k}
                                    className="grid content-start gap-0.5 rounded-md bg-muted px-3.5 py-3"
                                >
                                    <dt className="label">{s.k}</dt>
                                    <dd className="text-sm">{s.v}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </Panel>
            </div>

            {/* On a phone the page's state comes before its checks (F10). */}
            <aside className="order-first grid min-w-0 flex-[1_1_320px] gap-4 lg:order-none">
                <Panel title={`Where it shows on ${site.host}`}>
                    {() => (
                        <ul className="grid">
                            {whereItShows(
                                row,
                                site.host,
                                row.kind,
                                site.production,
                            ).map((w) => (
                                <li
                                    key={w.label}
                                    className="flex items-center gap-2.5 border-t py-2 text-sm first:border-t-0"
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-2 rounded-full",
                                            w.on
                                                ? "bg-success"
                                                : "bg-border-strong",
                                        )}
                                    />
                                    <span className="flex-1">{w.label}</span>
                                    <span
                                        className={cn(
                                            "text-[13px]",
                                            w.on
                                                ? "text-success-subtle-foreground"
                                                : "text-muted-foreground",
                                        )}
                                    >
                                        {w.value}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
                <Panel title="About this page">
                    {() => (
                        <Facts
                            rows={[
                                ["Target search", `“${page.search}”`],
                                [
                                    row.kind === "for" ? "Family" : "Section",
                                    row.family,
                                ],
                                [
                                    "If taken off",
                                    `Old links go to ${takenOffGoesTo(row, rows)}`,
                                ],
                                [
                                    "Kind",
                                    tool?.inApp
                                        ? "Free tool, with its own page in saroh.in"
                                        : KIND_NOUN[row.kind],
                                ],
                                [
                                    "Words last changed",
                                    formatDate(page.updated),
                                ],
                                ...(row.onSite
                                    ? ([
                                          [
                                              "Live since",
                                              formatDate(
                                                  row.record?.liveSince ??
                                                      row.record?.changedAt,
                                              ),
                                          ],
                                      ] as [string, string][])
                                    : []),
                                // Nothing recorded yet: no row, rather than a dash.
                                ...(row.record
                                    ? ([
                                          [
                                              "Last change",
                                              `${formatDate(row.record.changedAt)}, by ${by}`,
                                          ],
                                      ] as [string, string][])
                                    : []),
                            ]}
                        />
                    )}
                </Panel>
            </aside>
        </div>
    );
}

/** Pages listed with their status, each opening its own page here. */
function LinkList({
    title,
    items,
}: {
    title: string;
    items: { path: string; to: PageRow | null }[];
}) {
    return (
        <div className="grid gap-1.5">
            <p className="text-[13px] text-muted-foreground">{title}</p>
            <ul className="grid">
                {items.map(({ path, to }) => (
                    <li
                        key={path}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                    >
                        {to ? (
                            <Link
                                href={`/search-pages/${to.slug}`}
                                className="font-medium underline-offset-2 hover:underline"
                            >
                                {to.name}
                            </Link>
                        ) : (
                            <span className="font-medium text-destructive">
                                No page at this address: fix the link in the
                                code
                            </span>
                        )}
                        <code className="font-mono text-xs text-muted-foreground">
                            {path}
                        </code>
                        {to && (
                            <div className="ml-auto">
                                <Badge variant={badgeOf(to).variant}>
                                    {badgeOf(to).label}
                                </Badge>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
