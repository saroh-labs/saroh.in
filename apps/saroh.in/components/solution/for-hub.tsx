import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { Mark } from "@saroh/marketing/mark";
import { TextLink } from "@saroh/marketing/text-link";
import type { ForPageEntry } from "@saroh/search-pages";
import { ArrowRight, Search } from "lucide-react";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import type { TradeDay } from "@/content/solutions-days";
import {
    FAMILY_GROUP,
    HUB_GROUPS,
    HUB_WORDS as W,
} from "@/content/solutions-hub";

import type { HubGroupView, HubTile } from "./hub-finder";
import { HubFinder } from "./hub-finder";

/**
 * The /for hub, redesigned (boards SOHubDesk, SOHubPhone2): "A day in your
 * trade." Each built trade at one moment of its day, by what it does; the
 * ones with a written day marked as told in full. Words: the pages' own
 * (names, promises, search words) and `content/solutions-hub.ts`.
 */
export function ForHub({
    pages,
    days,
    src,
    templatesOn,
}: {
    /** The pages this build has. */
    pages: readonly ForPageEntry[];
    /** The written days among them. */
    days: readonly TradeDay[];
    src: string;
    templatesOn: boolean;
}) {
    const flagship = new Set(days.map((d) => d.slug));
    const moment = new Map(
        HUB_GROUPS.flatMap((g) =>
            g.trades.map((t) => [t.slug, { ...t, group: g.id }] as const),
        ),
    );
    const tile = (p: ForPageEntry): HubTile & { group: string } => {
        const m = moment.get(p.slug);
        const row = p.hero.rows[0] as (typeof p.hero.rows)[number] | undefined;
        return {
            slug: p.slug,
            name: p.name,
            href: p.path,
            at: m?.at ?? "09:00",
            line: m?.line ?? p.h1,
            detail:
                m?.detail ??
                (row
                    ? { kind: "pill", text: `${row.time} · ${row.name}` }
                    : undefined),
            flagship: flagship.has(p.slug),
            way: p.shape,
            words: `${p.name} ${p.family} ${p.search} ${p.searchWords} ${p.h1}`.toLowerCase(),
            group: m?.group ?? FAMILY_GROUP[p.family] ?? "food",
        };
    };
    const tiles = pages.map(tile);
    const groups: HubGroupView[] = HUB_GROUPS.map((g) => ({
        id: g.id,
        title: g.title,
        how: g.how,
        tiles: tiles
            .filter((t) => t.group === g.id)
            // The written days first, then through the day.
            .sort(
                (a, b) =>
                    Number(b.flagship) - Number(a.flagship) ||
                    a.at.localeCompare(b.at),
            ),
    })).filter((g) => g.tiles.length > 0);
    const n = tiles.length;
    const lead = days[0] as TradeDay | undefined;

    return (
        <>
            <HubFinder
                intro={
                    <>
                        <Breadcrumbs
                            crumbs={[
                                { name: "Home", href: "/" },
                                { name: W.crumb },
                            ]}
                        />
                        <h1 className="m-0 mt-4 font-display text-mk-kit-h1 font-bold [text-wrap:balance]">
                            {W.h1Before} <Mark>{W.h1Mark}</Mark>
                        </h1>
                        <p className="m-0 mt-6 max-w-[560px] text-mk-kit-lead text-mk-copy">
                            <span className="max-[759px]:hidden">
                                {W.lead(n)}
                            </span>
                            <span className="min-[760px]:hidden">
                                {W.phoneLead(n)}
                            </span>
                        </p>
                    </>
                }
                door={
                    lead ? (
                        <p className="m-0 grid gap-2 border-t border-border pt-5 text-[15px] min-[760px]:flex min-[760px]:items-center min-[760px]:gap-5">
                            <span className="font-mono text-[13px] text-mk-copy">
                                {W.doorTime}
                            </span>
                            <span className="min-w-0 flex-1">
                                {W.door(days.length, lead.example)}
                            </span>
                            <TextLink
                                href={`/for/${lead.slug}#${lead.start.anchor}`}
                                tone="ink"
                                arrow
                            >
                                {lead.follow}
                            </TextLink>
                        </p>
                    ) : null
                }
                groups={groups}
                words={{
                    searchLabel: W.searchLabel,
                    searchPlaceholder: W.searchPlaceholder,
                    what: W.what,
                    all: W.all,
                    howShort: W.howShort,
                    ways: W.ways,
                    reset: W.reset,
                    flagship: W.flagship,
                    az: W.az,
                    azLine: W.azLine,
                    count: W.count,
                    trades: W.trades,
                    none: W.none,
                }}
            />

            <section
                aria-labelledby="tell-title"
                className="border-t border-border py-[72px] min-[760px]:py-[120px]"
            >
                <Container className="grid gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_420px] min-[1000px]:gap-16">
                    <div className="grid content-start gap-5">
                        <h2
                            id="tell-title"
                            className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                        >
                            {W.tellTitle}
                        </h2>
                        <p className="m-0 max-w-[60ch] text-[16px] leading-relaxed text-mk-copy">
                            {W.tellBody}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                            <ButtonLink href="/contact" size="kit">
                                {W.tellLink}
                            </ButtonLink>
                            <span id="for-hub-cta">
                                <CtaLink
                                    src={src}
                                    size="kit"
                                    variant="secondary"
                                />
                            </span>
                            {templatesOn ? (
                                <TextLink href="/templates" tone="ink" arrow>
                                    {W.templates}
                                </TextLink>
                            ) : null}
                        </div>
                        <p className="m-0 text-[15px] text-muted-foreground">
                            {W.note}
                        </p>
                    </div>
                    <div className="grid content-start gap-4">
                        {W.doors.map((d) => (
                            <a
                                key={d.href}
                                href={d.href}
                                className="grid gap-2 rounded-mk-card border border-border bg-card p-6 text-foreground no-underline shadow-mk-card hover:border-foreground"
                            >
                                <b className="font-display text-mk-kit-h3">
                                    {d.title}
                                </b>
                                <span className="text-[15px] leading-relaxed text-mk-copy">
                                    {d.body}
                                </span>
                                <span className="mt-1 inline-flex items-center gap-2 text-[15px] font-semibold">
                                    {d.link}
                                    <ArrowRight
                                        aria-hidden
                                        className="size-4"
                                    />
                                </span>
                            </a>
                        ))}
                    </div>
                </Container>
            </section>
            <StickyBar watch="for-hub-search">
                <ButtonLink
                    href="#for-hub-search"
                    size="kit"
                    className="w-full"
                >
                    <Search aria-hidden className="size-5" />
                    {W.find}
                </ButtonLink>
            </StickyBar>
        </>
    );
}
