import type { ReactNode } from "react";
import { cn } from "../../cn";
import { PlanLine } from "../../kit/plan-line";
import { Container } from "../../layout/container";

/**
 * Every feature page's ending, on both sites (BUGS #37–#39, #50, #52; owner,
 * 16 Nov): the plan line and Compare plans, nothing else. The "Everything …
 * does" fold, "Used by", the day's moment and "Works with" are gone: the
 * steps, FAQ, Features menu and Solutions menu already say them. The "How
 * to …" links stay beside each page's steps.
 */
export function Tail({
    line,
    compare,
    id,
    className,
}: {
    line: ReactNode;
    /** Null while the site has no Pricing to show: the line alone, not a region. */
    compare: { label: string; href: string } | null;
    id?: string;
    className?: string;
}) {
    return (
        <Container
            as={compare ? "section" : "div"}
            id={id}
            aria-label={compare?.label}
            className={cn("pt-12 min-[760px]:pt-[120px]", className)}
        >
            <PlanLine compare={compare} className="text-[18px]">
                {line}
            </PlanLine>
        </Container>
    );
}
