import { Container } from "../layout/container";
import { SectionHeading } from "./section-heading";
import type { SegmentProps } from "./solution-segment";
import { SolutionSegment } from "./solution-segment";

/** A solution page's "What changes": its title, then each problem. */
export function SolutionChanges({
    title,
    segments,
}: {
    title: string;
    segments: readonly SegmentProps[];
}) {
    return (
        <Container as="section" aria-labelledby="changes-title">
            <SectionHeading
                id="changes-title"
                eyebrow="What changes"
                title={title}
                className="pt-[120px]"
            />
            {/* With screens, one problem to a row beside its screen.
                With none captured for the trade yet, two columns of
                words: a row each would be mostly empty. */}
            <div
                className={
                    segments.some((seg) => seg.shot)
                        ? "grid gap-24 pt-16"
                        : "grid gap-x-14 gap-y-16 pt-16 md:grid-cols-2"
                }
            >
                {segments.map((seg, i) => (
                    <SolutionSegment
                        key={seg.title}
                        segment={seg}
                        reverse={i % 2 === 1}
                    />
                ))}
            </div>
        </Container>
    );
}
