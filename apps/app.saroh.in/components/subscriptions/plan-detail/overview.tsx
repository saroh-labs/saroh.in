import { cn } from "@saroh/ui/lib/utils";

const CARD = "rounded-[12px] border border-border bg-card px-[18px] py-4";
const TITLE =
    "font-display text-[16px] font-semibold tracking-[-0.01em] text-foreground";
const ROW = "flex gap-2.5 border-t border-border/70 text-[13px]";

/**
 * Plan Detail's Overview (D4): what's included, who pays what — every price
 * people on it pay, since a price change only reaches people who join after
 * it — and At a glance beside them.
 */
export function PlanOverview({
    what,
    classes,
    pays,
    glance,
}: {
    what: string;
    classes: string | null;
    pays: { label: string; amount: string }[];
    glance: { label: string; value: string }[];
}) {
    return (
        <div className="flex flex-wrap items-start gap-4">
            <div className="grid min-w-0 flex-[1_1_420px] gap-3.5">
                <section aria-labelledby="plan-included" className={CARD}>
                    <h2 id="plan-included" className={cn(TITLE, "mb-1.5")}>
                        What&apos;s included
                    </h2>
                    <p className="text-[14px] leading-[1.55]">{what}</p>
                    {classes ? (
                        <p className="mt-1.5 text-[13px] text-muted-foreground">
                            {classes}
                        </p>
                    ) : null}
                </section>
                <section aria-labelledby="plan-pays" className={CARD}>
                    <h2 id="plan-pays" className={cn(TITLE, "mb-1")}>
                        Who pays what
                    </h2>
                    <p className="mb-1.5 text-pretty text-[12.5px] text-muted-foreground">
                        A price change only applies to people who join after it.
                        Everyone else keeps what they agreed to.
                    </p>
                    {pays.length ? (
                        pays.map((p) => (
                            <div key={p.label} className={cn(ROW, "py-2")}>
                                <span className="flex-1 text-foreground/75">
                                    {p.label}
                                </span>
                                <span className="font-semibold tabular-nums">
                                    {p.amount}
                                </span>
                            </div>
                        ))
                    ) : (
                        <p className="border-t border-border/70 pt-1.5 text-[13px] text-muted-foreground">
                            Nobody&apos;s on this plan yet.
                        </p>
                    )}
                </section>
            </div>
            <aside className="grid min-w-0 max-w-full flex-[0_0_300px] gap-3.5">
                <section aria-labelledby="plan-glance" className={CARD}>
                    <h2 id="plan-glance" className={cn(TITLE, "mb-1")}>
                        At a glance
                    </h2>
                    <dl>
                        {glance.map((g) => (
                            <div key={g.label} className={cn(ROW, "py-[7px]")}>
                                <dt className="flex-1 text-muted-foreground">
                                    {g.label}
                                </dt>
                                <dd className="font-semibold tabular-nums">
                                    {g.value}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
                <p className="text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                    Changing the price only affects people who join after the
                    change. Archiving stops new sign-ups; everyone already on it
                    carries on.
                </p>
            </aside>
        </div>
    );
}
