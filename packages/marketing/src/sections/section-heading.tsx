import type { ReactNode } from "react";
import { cn } from "../cn";

import { Eyebrow } from "./eyebrow";

/**
 * A section's heading, as the designs draw it: an optional eyebrow, the H2
 * and an optional lead line.
 *
 * - `lg` — clamp(34px, 4vw, 48px) at −0.04em, with balanced wrapping: "Eight
 *   parts that know about each other.", "How it works".
 * - `md` — clamp(34px, 4vw, 44px) at −0.035em: "Solutions", "Pricing",
 *   "Questions", "What it does", "Works with".
 * - `sm` — clamp(28px, 3vw, 34px) at −0.03em: "What it costs to use",
 *   Contact's "Before you write".
 * - `article` — 26px at −0.02em: an H2 inside an article's column (an
 *   integration page's sections and its Questions).
 * - `kit-h1` — the redesign's page title, 72px on desk and 42px on a phone
 *   (KIT.md); drawn as the page's `<h1>` with `as="h1"`, one `Mark` in it.
 * - `kit-h2` — the redesign's section heading, 44px and 30px.
 *
 * `align="center"` centres the heading and its lead (a landing hero, a
 * closing CTA). Its lead is the scene lead at the kit sizes.
 */
export function SectionHeading({
    eyebrow,
    title,
    lead,
    size = "lg",
    as: Tag = "h2",
    align = "start",
    id,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    lead?: ReactNode;
    size?: "lg" | "md" | "sm" | "article" | "kit-h1" | "kit-h2";
    as?: "h1" | "h2";
    align?: "start" | "center";
    id?: string;
    className?: string;
}) {
    const kit = size === "kit-h1" || size === "kit-h2";
    return (
        <div
            className={cn(
                "grid",
                kit ? "gap-5 min-[760px]:gap-6" : "gap-2",
                align === "center" && "justify-items-center text-center",
                className,
            )}
        >
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Tag
                id={id}
                className={cn(
                    "m-0 font-display font-bold text-foreground [text-wrap:balance]",
                    size === "lg"
                        ? "text-mk-h2"
                        : size === "md"
                          ? "text-mk-h2-sm"
                          : size === "sm"
                            ? "text-mk-h2-xs"
                            : size === "kit-h1"
                              ? "max-w-[18ch] text-mk-kit-h1"
                              : size === "kit-h2"
                                ? "max-w-[22ch] text-mk-kit-h2"
                                : "text-mk-h2-article",
                )}
            >
                {title}
            </Tag>
            {lead ? (
                <p
                    className={cn(
                        "m-0 text-mk-copy [text-wrap:pretty]",
                        kit ? "max-w-[62ch] text-mk-kit-lead" : "text-mk-body",
                    )}
                >
                    {lead}
                </p>
            ) : null}
        </div>
    );
}
