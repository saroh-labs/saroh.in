import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { Arrow } from "../links/arrow";
import { textLinkClasses } from "../links/text-link";
import { ScreenshotFrame } from "../media/screenshot-frame";
import type { ShotView } from "../media/shot";
import { Eyebrow } from "./eyebrow";

export interface SegmentProps {
    label: string;
    pain: string;
    title: string;
    body: string;
    /** "See {feature} →", on the first segment of each area only. */
    see?: { href: string; label: ReactNode };
    shot?: ShotView;
}

/**
 * One "What changes" problem: the area's label, the pain quote with its left
 * rule, the title, the body, the link to its feature and the shot. Every
 * second segment puts the shot on the left.
 *
 * A segment with no shot (a trade with no screen captured yet) is its words
 * alone, at a width that reads: no empty frame, and never another trade's
 * screen in its place.
 */
export function SolutionSegment({
    segment,
    reverse,
}: {
    segment: SegmentProps;
    reverse: boolean;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-12",
                segment.shot && reverse ? "flex-row-reverse" : "flex-row",
            )}
        >
            <div
                className={cn(
                    "grid content-center gap-3.5",
                    segment.shot ? "flex-[1_1_320px]" : "max-w-[68ch]",
                )}
            >
                <Eyebrow as="span" tone="muted">
                    {segment.label}
                </Eyebrow>
                <p className="m-0 border-l-2 border-border pl-3.5 text-[17px] leading-[1.5] text-muted-foreground [text-wrap:pretty]">
                    {segment.pain}
                </p>
                <h3 className="m-0 font-display text-mk-h3 font-bold [text-wrap:balance]">
                    {segment.title}
                </h3>
                <p className="m-0 text-mk-body text-mk-copy [text-wrap:pretty]">
                    {segment.body}
                </p>
                {segment.see ? (
                    <Link
                        href={segment.see.href}
                        className={textLinkClasses({
                            className:
                                "justify-self-start text-[15px] font-semibold",
                        })}
                    >
                        {segment.see.label}
                        <Arrow />
                    </Link>
                ) : null}
            </div>
            {segment.shot ? (
                <ScreenshotFrame
                    shot={segment.shot}
                    zoomable
                    className="flex-[1.4_1_420px]"
                />
            ) : null}
        </div>
    );
}
