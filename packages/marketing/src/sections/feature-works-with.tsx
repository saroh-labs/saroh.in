import { Container } from "../layout/container";
import { CardLink } from "../links/card-link";
import { SectionHeading } from "./section-heading";

/**
 * "Works with": the page's lead, then a card for each feature it works with
 * (its name, its short line, "See {name} →"), four across on a desk.
 */
export function FeatureWorksWith({
    lead,
    items,
}: {
    lead: string;
    items: readonly { href: string; title: string; body: string }[];
}) {
    return (
        <Container
            as="section"
            aria-labelledby="works-with"
            className="grid gap-7 pt-[130px]"
        >
            <div className="grid gap-2">
                <SectionHeading id="works-with" title="Works with" size="md" />
                <p className="m-0 text-[16.5px] text-mk-copy [text-wrap:pretty]">
                    {lead}
                </p>
            </div>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,max(220px,calc((100%_-_48px)/4))),1fr))]">
                {items.map((f) => (
                    <CardLink key={f.href} {...f} />
                ))}
            </div>
        </Container>
    );
}
