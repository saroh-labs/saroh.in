import { cn } from "@saroh/ui/lib/utils";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { Answer } from "@/lib/insights/overview-words";

/**
 * One of the Overview's three answers (DEC-171, plan U10; `IBOverviewD`):
 * the question, its answer in one sentence, what draws it, and the way to
 * the tab that says more. The same card on a phone, one under another.
 *
 * - `deny`: the person's role doesn't reach this answer (`IBMemberD`);
 *   dashed, as a space they could be given.
 * - `off`: it couldn't be read just now (`IBFailedD`); the page's one
 *   notice above says so and holds Try again.
 */
export function AnswerCard({
    question,
    children,
    tone,
    className,
    ...rest
}: {
    question: string;
    children: ReactNode;
    tone?: "deny" | "off";
    className?: string;
    "data-testid"?: string;
}) {
    const id = `answer-${question.replace(/[^a-z]+/gi, "-").toLowerCase()}`;
    return (
        <section
            aria-labelledby={id}
            data-tone={tone}
            className={cn(
                "flex min-w-0 flex-col items-start gap-2.5 rounded-[14px] border border-border px-5 py-[18px]",
                tone === "deny"
                    ? "border-dashed bg-muted/40"
                    : tone === "off"
                      ? "bg-muted/40"
                      : "bg-card",
                className,
            )}
            {...rest}
        >
            <h2
                id={id}
                data-ph-unmask=""
                className="text-[13px] font-semibold text-muted-foreground"
            >
                {question}
            </h2>
            {children}
        </section>
    );
}

/** The answer's sentence, its one word first in bold: "Yes. ₹1,84,600 …". */
export function AnswerText({
    answer,
    masked = true,
}: {
    answer: Answer | string;
    /** It holds the business's figures or names: a recording hides it. */
    masked?: boolean;
}) {
    const { lead, text } =
        typeof answer === "string" ? { lead: null, text: answer } : answer;
    return (
        <p
            {...(masked ? { "data-ph-mask": "" } : { "data-ph-unmask": "" })}
            className="max-w-[680px] text-pretty text-base font-medium tabular-nums leading-[1.45]"
        >
            {lead ? <b className="font-bold">{lead}</b> : null}
            {lead ? " " : null}
            {text}
        </p>
    );
}

/** "See money →": the way to the tab that says more. */
export function AnswerLink({
    href,
    children,
}: {
    href: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            scroll={false}
            className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-sm text-[13px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
        >
            {children}
            <ArrowRight aria-hidden className="size-3.5" />
        </Link>
    );
}
