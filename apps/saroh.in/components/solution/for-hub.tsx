import { SolutionsHub } from "@saroh/marketing/solutions/hub";
import type { HubTile } from "@saroh/marketing/solutions/hub-finder";
import type { ForPageEntry } from "@saroh/search-pages";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import type { TradeDay } from "@/content/solutions-days";
import {
    FAMILY_GROUP,
    HUB_GROUPS,
    HUB_WORDS as W,
} from "@/content/solutions-hub";

/**
 * The /for hub, redesigned (boards SOHubDesk, SOHubPhone2), drawn by the
 * shared `SolutionsHub`: each built trade at one moment of its day, by what
 * it does; the ones with a written day marked as told in full. Words: the
 * pages' own (names, promises, search words) and `content/solutions-hub.ts`.
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
    const lead = days[0] as TradeDay | undefined;

    return (
        <SolutionsHub
            tiles={pages.map(tile)}
            groups={HUB_GROUPS}
            words={W}
            days={
                lead
                    ? {
                          count: days.length,
                          example: lead.example,
                          href: `/for/${lead.slug}#${lead.start.anchor}`,
                          follow: lead.follow,
                      }
                    : undefined
            }
            cta={<CtaLink src={src} size="kit" variant="secondary" />}
            templatesHref={templatesOn ? "/templates" : undefined}
        />
    );
}
