import { Container } from "../layout/container";
import { PillLink } from "../links/pill";
import { Eyebrow } from "./eyebrow";

/** "Used by": a chip for each solution page the feature serves. */
export function FeatureUsedBy({
    items,
}: {
    items: readonly { href: string; name: string }[];
}) {
    return (
        <Container
            as="section"
            aria-labelledby="used-by"
            className="grid gap-4 pt-[130px]"
        >
            <Eyebrow id="used-by" role="heading" aria-level={2}>
                Used by
            </Eyebrow>
            <div className="flex flex-wrap gap-3">
                {items.map((s) => (
                    <PillLink key={s.href} href={s.href} size="lg">
                        {s.name}
                    </PillLink>
                ))}
            </div>
        </Container>
    );
}
