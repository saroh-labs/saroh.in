import { cn } from "@/lib/cn";
import type { PlanCardView } from "@/lib/pricing-model";

import { CtaLink } from "../cta-link";

/**
 * The Pricing design's plan cards: name and tagline, the price with its
 * "a month" and the line under it, the start button, then what the plan
 * includes. The catalogue's highlighted plan is Ink with the Saffron button;
 * the rest are white with an outlined one. Every word comes ready-made from
 * `lib/pricing-view.ts`; the button's label and address from the one CTA
 * builder (KTD-16).
 */
export function PlanCards({ plans }: { plans: PlanCardView[] }) {
    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] items-stretch gap-4">
            {plans.map((p) => (
                <PlanCard key={p.id} plan={p} />
            ))}
        </div>
    );
}

function PlanCard({ plan: p }: { plan: PlanCardView }) {
    const f = p.featured;
    const muted = f ? "text-mk-on-ink-muted" : "text-muted-foreground";
    return (
        <div
            data-plan={p.id}
            className={cn(
                "grid content-start gap-3.5 rounded-[18px] border p-7",
                f
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-foreground",
            )}
        >
            <div className="grid gap-1">
                <h3 className="m-0 text-[17px] font-semibold leading-normal">
                    {p.name}
                </h3>
                {p.tagline ? (
                    <span className={cn("text-[14.5px]", muted)}>
                        {p.tagline}
                    </span>
                ) : null}
            </div>
            <div className="grid gap-1.5">
                <span className="font-display text-mk-price-lg font-bold">
                    {p.price}
                    {p.per ? (
                        <span
                            className={cn(
                                "font-sans text-[15px] font-medium tracking-normal",
                                muted,
                            )}
                        >
                            {" "}
                            {p.per}
                        </span>
                    ) : null}
                </span>
                <span className={cn("text-mk-note", muted)}>{p.sub}</span>
            </div>
            <CtaLink
                src="pricing-plans"
                plan={p.cta.plan}
                planName={p.cta.planName}
                paid={p.cta.paid}
                trialDays={p.cta.trialDays}
                size="md"
                variant={f ? "saffron" : "secondary"}
                className={cn(
                    "focus-visible:outline-brand-500 active:scale-[0.98]",
                    f && "h-12",
                    !f && "hover:bg-background",
                )}
            />
            <ul
                className={cn(
                    "m-0 mt-1 grid list-none gap-2.5 border-t p-0 pt-4 text-[15px] leading-[1.45]",
                    f
                        ? "border-mk-ink-hover text-mk-on-ink"
                        : "border-mk-line-soft text-mk-copy",
                )}
            >
                {p.lead ? (
                    <li
                        className={cn(
                            "font-semibold",
                            f ? "text-background" : "text-foreground",
                        )}
                    >
                        {p.lead}
                    </li>
                ) : null}
                {p.trial ? (
                    <li
                        className={cn(
                            "font-semibold",
                            f ? "text-background" : "text-foreground",
                        )}
                    >
                        {p.trial}
                    </li>
                ) : null}
                {p.lines.map((l) => (
                    <li key={l.t} className="flex gap-2.5">
                        <span
                            aria-hidden
                            className={cn(
                                "font-bold",
                                f ? "text-mk-saffron" : "text-brand-500",
                            )}
                        >
                            ✓
                        </span>
                        {l.t}
                    </li>
                ))}
            </ul>
        </div>
    );
}
