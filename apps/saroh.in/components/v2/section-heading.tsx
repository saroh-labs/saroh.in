import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

import { Eyebrow } from "./eyebrow";

/**
 * A section's heading, as the designs draw it: an optional eyebrow, the H2
 * and an optional lead line.
 *
 * - `lg` — clamp(34px, 4vw, 48px) at −0.04em, with balanced wrapping: "Eight
 *   parts that know about each other.", "How it works".
 * - `md` — clamp(34px, 4vw, 44px) at −0.035em: "Solutions", "Pricing",
 *   "Questions", "What it does", "Works with".
 */
export function SectionHeading({
    eyebrow,
    title,
    lead,
    size = "lg",
    id,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    lead?: ReactNode;
    size?: "lg" | "md";
    id?: string;
    className?: string;
}) {
    return (
        <div className={cn("grid gap-2", className)}>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h2
                id={id}
                className={cn(
                    "m-0 font-display font-bold text-foreground [text-wrap:balance]",
                    size === "lg" ? "text-mk-h2" : "text-mk-h2-sm",
                )}
            >
                {title}
            </h2>
            {lead ? (
                <p className="m-0 text-mk-body text-mk-copy [text-wrap:pretty]">
                    {lead}
                </p>
            ) : null}
        </div>
    );
}
