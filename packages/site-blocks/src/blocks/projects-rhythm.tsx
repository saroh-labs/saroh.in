import type { RenderedProjects } from "@saroh/block-contract";
import { isSafeHref } from "@saroh/block-contract";

import { cn } from "../lib/utils";

/**
 * The Projects block's `rhythm` look (template polish), as the studio
 * design lays out its work: an uneven gallery with a pattern, not masonry.
 *
 *   - the first project leads, full width at 21:9;
 *   - then an equal pair at 4:3 (still a pair on a phone);
 *   - then a narrow 3:4 portrait beside a wide 16:9 landscape, bottom
 *     aligned (one column on a phone);
 *   - then the pair and the offset again, as long as there is work.
 *
 * A group left with one project draws it full width at 16:9, so the
 * pattern never leaves a hole. Words sit over the photo on a bounded band
 * (`captionPlacement: over`, DEC-090: a fixed height, lines clipped) or
 * under it. A project with no photo keeps its shape as an empty frame, so
 * the rhythm holds while photographs are still to come. Drawn from
 * `--site-*` only (gate G2).
 */

type Project = RenderedProjects["items"][number];

function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/** One group of the pattern after the lead: a pair, then an offset. */
export interface RhythmGroup {
    kind: "pair" | "offset" | "single";
    items: Project[];
}

/** The lead, then pairs and offsets in turn; a lone last one is `single`. */
export function rhythmGroups(items: readonly Project[]): {
    lead: Project | null;
    groups: RhythmGroup[];
} {
    if (items.length === 0) return { lead: null, groups: [] };
    const [lead, ...rest] = items;
    const groups: RhythmGroup[] = [];
    for (let i = 0, turn = 0; i < rest.length; i += 2, turn++) {
        const two = rest.slice(i, i + 2);
        groups.push({
            kind:
                two.length === 1
                    ? "single"
                    : turn % 2 === 0
                      ? "pair"
                      : "offset",
            items: two,
        });
    }
    return { lead, groups };
}

const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

export function RhythmGallery({
    items,
    over,
}: {
    items: Project[];
    over: boolean;
}) {
    const { lead, groups } = rhythmGroups(items);
    if (!lead) return null;
    return (
        <div className="grid gap-[var(--site-grid-gap)]">
            <Tile
                item={lead}
                over={over}
                frame="aspect-[21/9] min-h-[240px] sm:min-h-[340px]"
                band="h-[82px]"
                big
            />
            {groups.map((group, i) =>
                group.kind === "pair" ? (
                    <div
                        key={i}
                        className="grid grid-cols-2 gap-[var(--site-grid-gap)]"
                    >
                        {group.items.map((item, j) => (
                            <Tile
                                key={j}
                                item={item}
                                over={over}
                                frame="aspect-[4/3]"
                                band="h-[66px]"
                            />
                        ))}
                    </div>
                ) : group.kind === "offset" ? (
                    <div
                        key={i}
                        className="grid items-end gap-[var(--site-grid-gap)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.72fr)]"
                    >
                        <Tile
                            item={group.items[0]}
                            over={over}
                            frame="aspect-[3/4]"
                            band="h-[66px]"
                        />
                        <Tile
                            item={group.items[1]}
                            over={over}
                            frame="aspect-video"
                            band="h-[66px]"
                        />
                    </div>
                ) : (
                    <Tile
                        key={i}
                        item={group.items[0]}
                        over={over}
                        frame="aspect-video"
                        band="h-[66px]"
                    />
                ),
            )}
        </div>
    );
}

function Tile({
    item,
    over,
    frame,
    band,
    big = false,
}: {
    item: Project;
    over: boolean;
    /** The tile's shape. */
    frame: string;
    /** The band's fixed height, when the words sit over the photo. */
    band: string;
    big?: boolean;
}) {
    const src = said(item.image?.src);
    const title = said(item.title) ?? "";
    const caption = said(item.caption);
    const href = said(item.link);
    const link = href && isSafeHref(href) ? href : null;
    const photo = (
        <div
            className={cn(
                "bg-site-surface relative w-full overflow-hidden",
                frame,
            )}
        >
            {src ? (
                <img
                    src={src}
                    alt={item.image?.alt ?? ""}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                />
            ) : null}
            {over ? (
                <div
                    data-plate-band=""
                    className={cn(
                        "from-site-fg/80 via-site-fg/70 to-site-fg/0 text-site-bg absolute inset-x-0 bottom-0 flex flex-col justify-end overflow-hidden bg-gradient-to-t px-4 pb-3",
                        band,
                    )}
                >
                    <h3
                        className={cn(
                            "font-site-heading truncate font-semibold leading-tight",
                            big
                                ? "text-[calc(1.1875rem*var(--site-heading-scale))]"
                                : "text-[calc(0.9375rem*var(--site-heading-scale))]",
                        )}
                    >
                        {title}
                    </h3>
                    {caption ? (
                        <p
                            className={cn(
                                "truncate leading-snug",
                                big ? "text-[13.5px]" : "text-[12.5px]",
                            )}
                        >
                            {caption}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
    const words = over ? null : (
        <div className="mt-2.5 grid gap-0.5">
            <h3 className="font-site-heading text-site-fg text-[calc(1rem*var(--site-heading-scale))] font-semibold leading-tight [overflow-wrap:anywhere]">
                {title}
            </h3>
            {caption ? (
                <p className="text-site-muted text-[13px] leading-snug [overflow-wrap:anywhere]">
                    {caption}
                </p>
            ) : null}
        </div>
    );
    return (
        <article className="min-w-0">
            {link ? (
                <a
                    href={link}
                    rel={/^https?:\/\//i.test(link) ? "noopener" : undefined}
                    className={cn("block", focusRing)}
                >
                    {photo}
                    {words}
                </a>
            ) : (
                <>
                    {photo}
                    {words}
                </>
            )}
        </article>
    );
}
