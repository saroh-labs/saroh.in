import { Container } from "../layout/container";
import { CardLink } from "../links/card-link";
import { Pill } from "../links/pill";
import { SectionHeading } from "./section-heading";

/**
 * Home's `#features`: the eyebrow, the title and a card for each feature; a
 * fresh one (`isNew`) gets a Saffron frame and a "New" pill.
 */
export function FeatureCards({
    eyebrow,
    title,
    items,
    prefetch,
}: {
    eyebrow: string;
    title: string;
    items: readonly {
        href: string;
        title: string;
        body: string;
        isNew?: boolean;
    }[];
    prefetch?: boolean;
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
                {items.map(({ isNew, ...f }) =>
                    isNew ? (
                        <CardLink
                            key={f.href}
                            {...f}
                            title={
                                <span className="flex items-center justify-between gap-2">
                                    {f.title}
                                    <Pill tone="soon" className="font-sans">
                                        New
                                    </Pill>
                                </span>
                            }
                            action={<>See {f.title}</>}
                            className="border-2 border-brand-400 p-[21px]"
                            prefetch={prefetch}
                        />
                    ) : (
                        <CardLink key={f.href} {...f} prefetch={prefetch} />
                    ),
                )}
            </div>
        </Container>
    );
}
