import { Container } from "../layout/container";
import { PointGrid } from "./point-grid";
import { SectionHeading } from "./section-heading";

/**
 * "What it does": the page's points, each under a hairline, as many columns
 * as fit at 280px.
 */
export function FeaturePoints({
    points,
}: {
    points: readonly { title: string; body: string }[];
}) {
    return (
        <Container
            as="section"
            aria-labelledby="what-it-does"
            className="grid gap-9 pt-[130px]"
        >
            <SectionHeading id="what-it-does" title="What it does" size="md" />
            <PointGrid points={points} />
        </Container>
    );
}
