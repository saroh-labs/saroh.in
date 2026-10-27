import { cn } from "@/lib/cn";
import Link from "next/link";

import { featureHref } from "@/content/features";
import type { SegmentView } from "@/content/solutions";

import { Arrow } from "../shared/links/arrow";
import { textLinkClasses } from "../shared/links/text-link";
import { ScreenshotFrame } from "../shared/media/screenshot-frame";
import { Eyebrow } from "../shared/sections/eyebrow";

/**
 * One "What changes" problem: the area's label, the pain quote with its left
 * rule, the title, the body, "See {feature} →" on the first segment of each
 * area only, and the shot. Every second segment puts the shot on the left.
 *
 * A segment with no shot (a trade with no screen captured yet) is its words
 * alone, at a width that reads: no empty frame, and never another trade's
 * screen in its place.
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
                {segment.seeLink ? (
                    <Link
                        href={featureHref(segment.feature)}
                        className={textLinkClasses({
                            className:
                                "justify-self-start text-[15px] font-semibold",
                        })}
                    >
                        See {segment.featureName}
                        <Arrow />
                    </Link>
                ) : null}
            </div>
            {segment.shot ? (
                <ScreenshotFrame
                    shot={segment.shot}
                    alt={segment.alt}
                    zoomable
                    className="flex-[1.4_1_420px]"
                />
            ) : null}
        </div>
    );
}
