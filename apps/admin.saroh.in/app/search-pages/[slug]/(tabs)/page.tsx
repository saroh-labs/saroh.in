import { cn } from "@saroh/ui/lib/utils";

import { Facts, Panel } from "@/components/panel";
import { PageChecks } from "@/components/search-pages/page-checks";
import { formatDate } from "@/lib/format";
import {
    docSections,
    pageSections,
    toolSections,
} from "@/lib/search-page-content";
import { familyPage, whereItShows } from "@/lib/search-page-words";
import { loadPage, searchPageForTab } from "@/lib/search-pages";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    return { title: `${loadPage(slug)?.page.path ?? slug} · Search pages` };
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
    const { row, site } = data;
    const page = data.page.page;
    const tool = data.page.kind === "tools" ? data.page.page : null;
    const to =
        data.page.kind === "for" ? familyPage(row.family, row.slug) : null;
    const by = row.record?.changedBy?.name;

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

                <Panel title="Checked before you publish">
                    {() => <PageChecks page={page} />}
                </Panel>

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
                                    className="grid gap-0.5 rounded-md bg-muted px-3.5 py-3"
                                >
                                    <dt className="label">{s.k}</dt>
                                    <dd className="text-sm">{s.v}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </Panel>
            </div>

            <aside className="grid min-w-0 flex-[1_1_320px] gap-4">
                <Panel title={`Where it shows on ${site.host}`}>
                    {() => (
                        <ul className="grid">
                            {whereItShows(row, site.host, row.kind).map((w) => (
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
                                tool
                                    ? [
                                          "Section",
                                          `${tool.group} · old links go to /tools`,
                                      ]
                                    : [
                                          "Family",
                                          `${row.family} · old links go to ${to ?? "Home"}`,
                                      ],
                                [
                                    "Kind",
                                    tool
                                        ? tool.inApp
                                            ? "Free tool, with its own page in saroh.in"
                                            : "Free tool"
                                        : "Trade page",
                                ],
                                [
                                    "Words last changed",
                                    formatDate(page.updated),
                                ],
                                [
                                    row.onSite
                                        ? "Published by"
                                        : "Last changed by",
                                    row.record
                                        ? `${by ?? "a former staff member"}, ${formatDate(row.record.changedAt)}`
                                        : "—",
                                ],
                            ]}
                        />
                    )}
                </Panel>
            </aside>
        </div>
    );
}
