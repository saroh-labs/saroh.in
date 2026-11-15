import { Container } from "@saroh/marketing/container";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { TextLink } from "@saroh/marketing/text-link";

import { featureHref, featureList } from "@/content/features";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf("/features");

export const metadata = pageMetadata(page);

/**
 * /features, "How it works" (DEC-221): the route shell the redesign's
 * /features agent fills, as saroh.in's. Noindex and out of the sitemap
 * until then (`unreviewed`); it lists every shown feature so the nav's
 * see-all never lands on an empty page.
 */
export default function Page() {
    return (
        <Container
            as="section"
            data-page-type={page.type}
            className="grid gap-8 py-[72px] min-[760px]:py-[120px]"
        >
            <SectionHeading
                as="h1"
                size="kit-h1"
                title={page.h1}
                lead="This page is being redrawn. Every feature has its own page meanwhile."
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
