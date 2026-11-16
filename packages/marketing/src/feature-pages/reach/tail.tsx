import type { ReactNode } from "react";
import { Chip } from "../../kit/chip";
import { MomentCard } from "../../kit/moment-card";
import { PlanLine } from "../../kit/plan-line";

/**
 * A feature page's tail (FIX.md, feature-page tails): ONE moment from the
 * trade's day, the PlanLine, and "Works with" as a chip row. Each part is
 * optional; a page passes only what it has.
 */
export function Tail({
    moment,
    plan,
    works,
}: {
    moment?: {
        at: string;
        line: ReactNode;
        link: { label: string; href: string };
    };
    plan?: { line: ReactNode; compare: { label: string; href: string } };
    works?: { label: string; items: readonly { name: string; href: string }[] };
}) {
    return (
        <div className="grid gap-5">
            {moment ? <MomentCard {...moment} /> : null}
            {plan ? (
                <PlanLine compare={plan.compare} className="px-1 text-[17px]">
                    {plan.line}
                </PlanLine>
            ) : null}
            {works?.items.length ? (
                <nav
                    aria-label={works.label}
                    className="flex flex-wrap items-center gap-2.5"
                >
                    <span className="mr-1.5 text-[15px] text-muted-foreground">
                        {works.label}
                    </span>
                    {works.items.map((w) => (
                        <Chip key={w.href} href={w.href}>
                            {w.name}
                        </Chip>
                    ))}
                </nav>
            ) : null}
        </div>
    );
}
