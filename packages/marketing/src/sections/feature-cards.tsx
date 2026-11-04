import { Container } from "../layout/container";
import { CardLink } from "../links/card-link";
import { SectionHeading } from "./section-heading";

/** Home's `#features`: the eyebrow, the title and a card for each feature. */
export function FeatureCards({
    eyebrow,
    title,
    items,
}: {
    eyebrow: string;
    title: string;
    items: readonly { href: string; title: string; body: string }[];
}) {
    return (
        <Container
            as="section"
            id="features"
            aria-labelledby="features-title"
            className="scroll-mt-6 pt-24"
        >
            <SectionHeading
                id="features-title"
                eyebrow={eyebrow}
                title={title}
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(200px,calc((100%-48px)/4))),1fr))] gap-4 pb-14 pt-10">
                {items.map((f) => (
                    <CardLink key={f.href} {...f} />
                ))}
            </div>
        </Container>
    );
}
