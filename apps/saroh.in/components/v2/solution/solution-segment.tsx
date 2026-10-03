import { cn } from "@/lib/cn";
import Link from "next/link";

import { featureHref } from "@/content/features";
import type { SegmentView } from "@/content/solutions";

import { Arrow } from "../arrow";
import { ScreenshotFrame } from "../screenshot-frame";

/**
 * One "What changes" problem: the area's label, the pain quote with its left
 * rule, the title, the body, "See {feature} →" on the first segment of each
 * area only, and the shot. Every second segment puts the shot on the left.
 */
export function SolutionSegment({
    segment,
    reverse,
}: {
    segment: SegmentView;
    reverse: boolean;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-12",
                reverse ? "flex-row-reverse" : "flex-row",
            )}
        >
            <div className="grid flex-[1_1_320px] content-center gap-3.5">
                <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {segment.label}
                </span>
                <p className="m-0 border-l-2 border-border pl-3.5 text-[17px] leading-[1.5] text-muted-foreground [text-wrap:pretty]">
                    {segment.pain}
                </p>
                <h3 className="m-0 font-display text-mk-h3 font-bold [text-wrap:balance]">
                    {segment.title}
                </h3>
                <p className="m-0 text-mk-body text-mk-copy [text-wrap:pretty]">
                    {segment.body}
                </p>
                {segment.seeLink ? (
                    <Link
                        href={featureHref(segment.feature)}
                        className="justify-self-start rounded-sm text-[15px] font-semibold text-brand-700 no-underline hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                    >
                        See {segment.featureName}
                        <Arrow />
                    </Link>
                ) : null}
            </div>
            <ScreenshotFrame
                shot={segment.shot}
                alt={segment.alt}
                zoomable
                className="flex-[1.4_1_420px]"
            />
        </div>
    );
}
