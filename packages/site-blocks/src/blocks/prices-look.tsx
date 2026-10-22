import type { LookId } from "@saroh/block-contract";

import { cn } from "../lib/utils";
import type { FrontButtonKind } from "./look-front";
import { FRONT_TYPE, FRONT_WRAP, frontButton, LookEyebrow } from "./look-front";

/**
 * Plans and Class packs under a look (DEC-172, plan U7, #1096), as VA10,
 * VD10 and VB10 draw them, desk and phone: columns side by side on a desk
 * and one under another on a phone.
 *
 * - **Folio**: each column under an ink rule, the price large in the
 *   display face, the rules as a short list.
 * - **Quiet**: columns divided by hairlines, centred on a desk.
 * - **Live**: white cards in the look's small corners.
 *
 * ONE FILLED BUTTON: the highlighted plan's Join is the page's own action,
 * filled and marked `data-site-primary`; every other Join and every Buy is
 * an outline. A Class packs block on a page with no plans fills its first
 * Buy instead (`primary`).
 *
 * The rules a column states are the business's, from the API (how long a
 * member may pause, whether a membership is used first), never words a
 * template typed (VA-30). Labels are 12px at least (VA-23). Drawn from
 * `--site-*` only (G2, G7).
 */

/** "2, 4 or 8 weeks", from the read's weeks. */
export function weeksWords(weeks: readonly number[]): string | null {
    const list = weeks.filter((w) => Number.isInteger(w) && w > 0);
    if (list.length === 0) return null;
    const unit = list.length === 1 && list[0] === 1 ? "week" : "weeks";
    if (list.length === 1) return `${list[0]} ${unit}`;
    return `${list.slice(0, -1).join(", ")} or ${list.at(-1)} ${unit}`;
}

/** The section around a look's plans or packs. */
export function PriceFrame({
    content,
    look,
    title,
    intro = null,
    children,
}: {
    /** The section's content, for its eyebrow. */
    content?: unknown;
    look: LookId;
    title: string;
    intro?: string | null;
    children: React.ReactNode;
}) {
    const type = FRONT_TYPE[look];
    return (
        <section
            data-site-look-prices={look}
            className="text-site-fg w-full py-[var(--site-section-padding)]"
        >
            <div className={FRONT_WRAP}>
                <div
                    className={cn(
                        "grid gap-3 pb-8 min-[700px]:pb-12",
                        look === "quiet" && "min-[700px]:text-center",
                    )}
                >
                    <LookEyebrow content={content} look={look} />
                    <h2 data-site-title="" className={type.h2}>
                        {title}
                    </h2>
                    {intro ? (
                        <p
                            className={cn(
                                "text-site-body max-w-[60ch] text-[16px] leading-relaxed",
                                look === "quiet" && "min-[700px]:mx-auto",
                            )}
                        >
                            {intro}
                        </p>
                    ) : null}
                </div>
                {children}
            </div>
        </section>
    );
}

/** The columns' list, one under another on a phone. */
export function priceList(look: LookId, list = false): string {
    return cn(
        "grid grid-cols-1",
        !list &&
            "min-[700px]:[grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]",
        look === "live"
            ? "gap-3 min-[700px]:gap-4"
            : "gap-10 min-[700px]:gap-12",
    );
}

/** One column: the look's rule, hairline or card. */
export function priceColumn(look: LookId, highlighted: boolean): string {
    return cn(
        "grid min-w-0 content-start gap-3",
        look === "folio" && "border-site-fg border-t pt-6",
        look === "quiet" &&
            "border-site-border border-t pt-6 min-[700px]:text-center",
        // VB10: white cards; the highlighted plan an ink card, its words
        // turned to the ink's own text colour.
        look === "live" &&
            cn(
                "rounded-site-photo p-6",
                highlighted
                    ? "bg-site-cta-bg [--site-body:var(--site-cta-fg)] [--site-border:var(--site-cta-fg)] [--site-fg:var(--site-cta-fg)] [--site-muted:var(--site-cta-fg)]"
                    : "bg-site-surface",
            ),
    );
}

/** The parts of a column, in the look's type. */
export function PriceParts({
    look,
    eyebrow,
    badge,
    name,
    price,
    gst,
    lines,
    rules,
    action,
}: {
    look: LookId;
    eyebrow: string | null;
    /** "Most chosen", on the highlighted plan only. */
    badge?: string | null;
    name: string;
    price: string | null;
    gst?: string | null;
    /** The per-class line and the merchant's description. */
    lines: (string | null)[];
    /** The business's own rules (pause, membership first). */
    rules: (string | null)[];
    action: React.ReactNode;
}) {
    const type = FRONT_TYPE[look];
    const shown = rules.filter((r): r is string => Boolean(r));
    const said = lines.filter((l): l is string => Boolean(l));
    const title = (
        <h3 className={cn(type.name, "[overflow-wrap:anywhere]")}>{name}</h3>
    );
    const amount = price ? (
        <p
            className={cn(
                "font-site-heading text-site-fg tabular-nums leading-none [font-variant-numeric:lining-nums]",
                look === "live"
                    ? "text-[56px] font-extrabold tracking-[-0.03em] [font-stretch:80%] min-[700px]:text-[64px]"
                    : "text-[40px] font-light tracking-[-0.02em] min-[700px]:text-[52px]",
            )}
        >
            {price}
            {gst ? (
                <span
                    data-price-gst=""
                    className="text-site-muted font-site-body mt-2 block text-[13px] font-normal tracking-normal [font-stretch:100%]"
                >
                    {gst}
                </span>
            ) : null}
        </p>
    ) : null;
    return (
        <>
            <span
                className={cn(
                    "flex min-h-[20px] flex-wrap items-center gap-2",
                    look === "quiet" && "min-[700px]:justify-center",
                )}
            >
                {eyebrow ? (
                    <span className={type.eyebrow}>{eyebrow}</span>
                ) : null}
                {badge ? (
                    <span
                        className={
                            look === "live"
                                ? // VB10's tag: the accent, 9px corners.
                                  "bg-site-accent text-site-accent-fg rounded-[9px] px-[9px] py-1 text-[12.5px] font-bold"
                                : "bg-site-accent-soft text-site-fg rounded-site-s px-2 py-0.5 text-[12px] font-semibold"
                        }
                    >
                        {badge}
                    </span>
                ) : null}
            </span>
            {/* VB10 leads with the number, then the plan's name. */}
            {look === "live" ? amount : title}
            {look === "live" ? title : amount}
            {said.map((line, i) => (
                <p
                    key={i}
                    className={cn(
                        type.meta,
                        "whitespace-pre-line [text-wrap:pretty]",
                    )}
                >
                    {line}
                </p>
            ))}
            {shown.length > 0 ? (
                <ul
                    data-price-rules=""
                    className={cn(
                        "text-site-body grid gap-1.5 text-[14.5px] leading-snug",
                        look === "quiet" && "min-[700px]:justify-items-center",
                    )}
                >
                    {shown.map((rule) => (
                        <li key={rule}>{rule}</li>
                    ))}
                </ul>
            ) : null}
            {action ? (
                <div
                    className={cn(
                        "pt-2",
                        look === "quiet" &&
                            "min-[700px]:flex min-[700px]:justify-center",
                        // VB10: the button full width, 48 tall.
                        look === "live" && "[&>*]:min-h-12 [&>*]:w-full",
                    )}
                >
                    {action}
                </div>
            ) : null}
        </>
    );
}

/** A column's button classes: the one filled, or an outline. */
export function priceButton(look: LookId, primary: boolean): string {
    const kind: FrontButtonKind = primary ? "fill" : "outline";
    return frontButton(look, kind);
}
