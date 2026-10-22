import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type { InsightsPeriod } from "@/lib/insights/period";
import type { VisitPathRead } from "@/lib/insights/reads";
import { pathAnswer, pathSteps } from "@/lib/insights/sources-words";

/**
 * "From visit to paid" (DEC-171, plan U16, #1101; `IBFromD`, `IBFromP`):
 * the period's visits in four plain steps, each a bar against the visits
 * with its share of the step before ("1 in 3 of them"), and the answer in
 * a sentence above them. The read holds each step to at most the one
 * before (`sources.ts`), so the steps never go up.
 *
 * The same card on a phone: the label and its count share a line, the bar
 * under them, so nothing is wider than the screen.
 */
export function VisitPath({
    path,
    period,
}: {
    path: VisitPathRead;
    period: InsightsPeriod;
}) {
    const steps = pathSteps(path);
    return (
        <section
            aria-labelledby="visit-path-heading"
            data-testid="visit-path"
            className="flex min-w-0 flex-col items-start gap-2.5 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-5 sm:py-[18px]"
        >
            <h3
                id="visit-path-heading"
                data-ph-unmask=""
                className="text-[13px] font-semibold text-muted-foreground"
            >
                From visit to paid
            </h3>
            <p
                data-ph-mask=""
                className="max-w-[680px] text-pretty text-base font-medium tabular-nums leading-[1.45]"
            >
                {pathAnswer(path, period)}
            </p>
            <ol className="grid w-full gap-3" data-ph-mask="">
                {steps.map((step, i) => (
                    <li
                        key={step.key}
                        data-step={step.key}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
                    >
                        <span className="grid min-w-0 gap-px text-[13.5px]">
                            <b className="font-semibold">{step.label}</b>
                            {step.share ? (
                                <small className="text-xs text-muted-foreground">
                                    {step.share}
                                </small>
                            ) : null}
                        </span>
                        <span className="min-w-16 text-right font-display text-base font-semibold tabular-nums">
                            {i === 0
                                ? count(step.value, "visit")
                                : formatNumber(step.value)}
                        </span>
                        <span
                            aria-hidden
                            className="col-span-2 h-3 overflow-hidden rounded bg-muted"
                        >
                            <span
                                className="block h-full rounded bg-foreground"
                                style={{ width: `${step.widthPercent}%` }}
                            />
                        </span>
                    </li>
                ))}
            </ol>
        </section>
    );
}
