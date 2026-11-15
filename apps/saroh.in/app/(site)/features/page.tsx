import { Container } from "@saroh/marketing/container";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { TextLink } from "@saroh/marketing/text-link";
import type { Metadata } from "next";

import { featureHref, featureList } from "@/content/features";
import { HOW_IT_WORKS } from "@/content/how-it-works";
import { pageMetadata, pageTitle } from "@/lib/seo";

/**
 * /features, "How it works" (DEC-221, story ownership): the route shell the
 * redesign's /features agent fills. Until then it is noindex and out of the
 * sitemap, and lists every shown feature so the nav's see-all never lands
 * on an empty page.
 */
export const metadata: Metadata = {
    ...pageMetadata({
        title: pageTitle(HOW_IT_WORKS.seoTitle),
        description: HOW_IT_WORKS.seoDescription,
        path: HOW_IT_WORKS.href,
    }),
    robots: { index: false, follow: true },
};

export default function HowItWorksPage() {
    return (
        <Container
            as="section"
            className="grid gap-8 py-[72px] min-[760px]:py-[120px]"
        >
            <SectionHeading
                as="h1"
                size="kit-h1"
                title={HOW_IT_WORKS.title}
                lead={HOW_IT_WORKS.placeholder}
            />
            <ul className="m-0 grid list-none gap-1 p-0">
                {featureList.map((f) => (
                    <li key={f.slug}>
                        <TextLink href={featureHref(f.slug)} tone="ink" arrow>
                            {f.name}
                        </TextLink>
                    </li>
                ))}
            </ul>
        </Container>
    );
}
