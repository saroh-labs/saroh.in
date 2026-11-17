import { ArrowRight, Search } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink } from "../buttons/button";
import { StickyBar } from "../kit/sticky-bar";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { Mark } from "../sections/mark";
import { SplitHero } from "../sections/split-hero";
import type { HubFinderWords, HubGroupView, HubTile } from "./hub-finder";
import { HubFinder } from "./hub-finder";

/** The hub's own words; an edition writes them (saroh.in's `content/solutions-hub.ts`). */
export interface SolutionsHubWords extends HubFinderWords {
    crumb: string;
    h1Before: string;
    h1Mark: string;
    lead: (n: number) => string;
    phoneLead: (n: number) => string;
    /** The door to the written days: how many there are, and the first one's example. */
    door: (n: number, example: string) => string;
    doorTime: string;
    find: string;
    tellTitle: string;
    tellBody: string;
    tellLink: string;
    templates: string;
    note: string;
    doors: readonly {
        title: string;
        body: string;
        link: string;
        href: string;
    }[];
}

/** A group the hub sorts its trades into. */
export interface SolutionsHubGroup {
    id: string;
    title: string;
    how: string;
}

/**
 * The Solutions hub (boards SOHubDesk, SOHubPhone2): "A day in your trade."
 * Each trade at one moment of its day, by what it does; the ones with a
 * written day marked as told in full and listed first. An edition gives its
 * own trades, groups and words; `cta` is its start button.
 */
export function SolutionsHub({
    tiles,
    groups,
    words: W,
    days,
    cta,
    ctaId = "for-hub-cta",
    contactHref = "/contact",
    templatesHref,
}: {
    /** Every trade's tile, with the group it sits in. */
    tiles: readonly (HubTile & { group: string })[];
    groups: readonly SolutionsHubGroup[];
    words: SolutionsHubWords;
    /** The written days: how many, and the first one's door. */
    days?: { count: number; example: string; href: string; follow: string };
    /** The start button beside "Tell us your trade". */
    cta: ReactNode;
    ctaId?: string;
    contactHref?: string;
    /** The templates gallery, while it is on. */
    templatesHref?: string;
}) {
    const views: HubGroupView[] = groups
        .map((g) => ({
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
        }))
        .filter((g) => g.tiles.length > 0);
    const n = tiles.length;

    return (
        <>
            <HubFinder
                intro={
                    <SplitHero
                        as="div"
                        contained={false}
                        crumbs={[
                            { name: "Home", href: "/" },
                            { name: W.crumb },
                        ]}
                        layout="beside"
                        title={
                            <>
                                {W.h1Before} <Mark>{W.h1Mark}</Mark>
                            </>
                        }
                        titleClassName="max-w-none"
                        lede={
                            <>
                                <span className="max-[759px]:hidden">
                                    {W.lead(n)}
                                </span>
                                <span className="min-[760px]:hidden">
                                    {W.phoneLead(n)}
                                </span>
                            </>
                        }
                        ledeClassName="max-w-[560px]"
                        gridClassName="pt-4 min-[760px]:pt-4"
                    />
                }
                door={
                    days ? (
                        <p className="m-0 grid gap-2 border-t border-border pt-5 text-[15px] min-[760px]:flex min-[760px]:items-center min-[760px]:gap-5">
                            <span className="font-mono text-[13px] text-mk-copy">
                                {W.doorTime}
                            </span>
                            <span className="min-w-0 flex-1">
                                {W.door(days.count, days.example)}
                            </span>
                            <TextLink href={days.href} tone="ink" arrow>
                                {days.follow}
                            </TextLink>
                        </p>
                    ) : null
                }
                groups={views}
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
                    trade: W.trade,
                    none: W.none,
                }}
            />

            <section
                aria-labelledby="tell-title"
                className="border-t border-border pb-10 pt-12 min-[760px]:py-[120px]"
            >
                <Container className="grid gap-8 min-[760px]:gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_420px] min-[1000px]:gap-16">
                    <div className="grid content-start gap-4 min-[760px]:gap-5">
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
                            <ButtonLink href={contactHref} size="kit">
                                {W.tellLink}
                            </ButtonLink>
                            <span id={ctaId}>{cta}</span>
                            {templatesHref ? (
                                <TextLink href={templatesHref} tone="ink" arrow>
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
                                className="grid gap-1.5 rounded-mk-card border border-border bg-card p-5 text-foreground no-underline shadow-mk-card hover:border-foreground min-[760px]:gap-2 min-[760px]:p-6"
                            >
                                <b className="font-display text-mk-kit-h3">
                                    {d.title}
                                </b>
                                <span className="text-[14px] leading-snug text-mk-copy min-[760px]:text-[15px] min-[760px]:leading-relaxed">
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
