import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { FaqItems } from "../sections/faq";
import { SectionHeading } from "../sections/section-heading";

/**
 * A pricing page's questions (the 22 Nov boards): the heading and an email
 * for anything else on the left, the questions on the right; one column
 * on a phone. Every answer is in the markup (closed `<details>`), so search
 * and the FAQ structured data read them all.
 */
export function PricingFaq({
    title,
    items,
    email,
}: {
    title: string;
    items: readonly { q: string; a: string }[];
    email: string;
}) {
    if (!items.length) return null;
    return (
        <Container
            as="section"
            id="faq"
            aria-labelledby="faq-title"
            className="grid scroll-mt-6 gap-6 pt-[72px] min-[760px]:grid-cols-[320px_1fr] min-[760px]:gap-12 min-[760px]:pt-[120px]"
        >
            <div>
                <SectionHeading id="faq-title" title={title} size="kit-h2" />
                <p className="m-0 mt-3 text-[16px] text-mk-copy">
                    Something else? Email{" "}
                    <TextLink href={`mailto:${email}`} tone="ink">
                        {email}
                    </TextLink>
                </p>
            </div>
            <FaqItems items={[...items]} />
        </Container>
    );
}
