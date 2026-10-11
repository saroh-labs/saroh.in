import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { ProgressBar } from "@saroh/ui/progress-bar";
import Link from "next/link";
import { PlanWay } from "./plan-way";

/**
 * The limit notice every screen shares ("Saroh Settings" design, Team): the
 * title, a bar of how much is used, what stops, and the way to more. Saffron
 * from 80%, the destructive tint at 100% — and the words say which, never
 * the colour alone. A soft cap never stops anything, so at 100% it keeps
 * the saffron tint: it informs, it doesn't refuse. Words come from
 * `limitNotice` (`@saroh/pricing-catalog`). The way to more is offered to
 * someone who may change the plan (`PlanWay`); anyone else reads who can.
 *
 * Presentational: server pages pass it the notice (`PlanLimitNotice`), the
 * refusal dialog a 403's (`PlanRefusalHost`).
 */
export function LimitNoticeBlock({
    full,
    soft = false,
    title,
    pct,
    body,
    cta,
    href,
    className,
}: {
    full: boolean;
    /** A soft cap: informs at 100%, never reads as a refusal. */
    soft?: boolean;
    title: string;
    /** "85%"; no bar when absent. */
    pct?: string;
    body: string;
    cta: string;
    href: string;
    className?: string;
}) {
    const refused = full && !soft;
    return (
        <Notice
            tone={refused ? "error" : "warning"}
            role="status"
            icon={false}
            title={title}
            className={className}
            action={
                <PlanWay className="text-foreground/80">
                    <Button asChild size="sm" className="shrink-0">
                        <Link href={href}>{cta}</Link>
                    </Button>
                </PlanWay>
            }
        >
            {pct ? (
                <ProgressBar
                    value={Number.parseFloat(pct) || 0}
                    max={100}
                    size="xs"
                    tone={refused ? "danger" : "ink"}
                    label={`${pct} used`}
                    className="my-1.5 max-w-[320px]"
                />
            ) : null}
            <span className="text-pretty">{body}</span>
        </Notice>
    );
}
