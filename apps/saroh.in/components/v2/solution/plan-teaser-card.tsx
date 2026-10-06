import { cn } from "@/lib/cn";
import type { PlanTeaserView } from "@/lib/plan-teasers";

import { CtaLink } from "../cta-link";

/**
 * One plan card from the Solutions design's pricing block. Featured: Ink,
 * the page's Saffron fit line and the Saffron button; otherwise white with
 * an outlined button. It draws only what `teaser` says (the catalogue's
 * words, or the placeholder: `lib/plan-teasers.ts`). The button's label and
 * address come from the one CTA builder. Home's pricing teaser uses it too.
 */
export function PlanTeaserCard({
    teaser,
    src,
}: {
    teaser: PlanTeaserView;
    /** Analytics source for the button, e.g. `solutions-gyms-pricing`. */
    src: string;
}) {
    const { featured } = teaser;
    return (
        <div
            data-plan={teaser.plan}
            className={cn(
                "grid content-start gap-2.5 rounded-mk-card p-[26px]",
                featured
                    ? "bg-foreground text-background"
                    : "border border-border bg-card text-foreground",
            )}
        >
            <h3 className="m-0 text-base font-semibold leading-normal">
                {teaser.name}
            </h3>
            {/* The note wraps under the figure on a narrow card rather than
                taking the figure's tall line with it. */}
            <p className="m-0 flex flex-wrap items-baseline gap-x-1">
                <span className="font-display text-mk-price font-bold">
                    {teaser.price}
                </span>
                <span
                    className={cn(
                        "text-[15px] font-medium",
                        featured
                            ? "text-mk-on-ink-muted"
                            : "text-muted-foreground",
                    )}
                >
                    {teaser.priceNote}
                </span>
            </p>
            <p
                className={cn(
                    "m-0 text-mk-card-body [text-wrap:pretty]",
                    featured ? "text-mk-on-ink" : "text-mk-copy",
                )}
            >
                {teaser.what}
            </p>
            {featured && teaser.fit ? (
                <p className="m-0 text-sm leading-[1.5] text-mk-on-ink-accent [text-wrap:pretty]">
                    {teaser.fit}
                </p>
            ) : null}
            <CtaLink
                src={src}
                plan={teaser.plan}
                planName={teaser.name}
                paid={teaser.paid}
                size="md"
                variant={featured ? "saffron" : "secondary"}
                className={cn(
                    "mt-2 active:scale-[0.98]",
                    // The design's white card lifts to Paper on hover.
                    !featured && "hover:bg-background",
                )}
            />
        </div>
    );
}
