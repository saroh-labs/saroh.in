import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

/**
 * The limit notice every screen shares ("Saroh Settings" design, Team): the
 * title, a bar of how much is used, what stops, and the way to more. Saffron
 * from 80%, the destructive tint at 100% — and the words say which, never
 * the colour alone. A soft cap never stops anything, so at 100% it keeps
 * the saffron tint: it informs, it doesn't refuse. Words come from
 * `limitNotice` (`@saroh/pricing-catalog`).
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
        <div
            role="status"
            className={cn(
                "flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border px-3.5 py-3",
                refused
                    ? "border-destructive bg-destructive-subtle"
                    : "border-brand-300 bg-brand-subtle dark:border-brand-700",
                className,
            )}
        >
            <div className="grid min-w-0 flex-[1_1_320px] gap-1.5">
                <span className="text-[13px] font-semibold text-foreground">
                    {title}
                </span>
                {pct ? (
                    <div
                        aria-hidden
                        className="h-[5px] max-w-[320px] overflow-hidden rounded-full bg-muted"
                    >
                        <div
                            className={cn(
                                "h-full rounded-full",
                                refused ? "bg-destructive" : "bg-highlight",
                            )}
                            style={{ width: pct }}
                        />
                    </div>
                ) : null}
                <span className="text-pretty text-[12.5px] leading-normal text-foreground/80">
                    {body}
                </span>
            </div>
            <Button asChild size="sm" className="shrink-0">
                <Link href={href}>{cta}</Link>
            </Button>
        </div>
    );
}
