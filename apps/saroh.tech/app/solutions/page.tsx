import { SolutionsHub } from "@saroh/marketing/solutions/hub";

import { JsonLd } from "@/components/shared/json-ld";
import { StartFree } from "@/components/solution/start-free";
import { solutionHref, solutionList } from "@/content/solutions";
import {
    HUB_GROUPS,
    HUB_PATH,
    HUB_PLACES,
    HUB_WORDS,
} from "@/content/solutions-hub";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf(HUB_PATH);

export const metadata = pageMetadata(page);

/** "Start: see today's classes." → "See today's classes." */
const dayLine = (day: string) => {
    const line = day.replace(/^Start:\s*/, "");
    return line.charAt(0).toUpperCase() + line.slice(1);
};

/**
 * /solutions: saroh.in's /for hub (DEC-221, `SolutionsHub`) over saroh.tech's
 * four trades, each at the hour its demo business opens. No trade has a
 * written day yet, so none is marked as told in full.
 */
export default function SolutionsHubPage() {
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <SolutionsHub
                tiles={solutionList.map((s) => ({
                    slug: s.slug,
                    name: s.name,
                    href: solutionHref(s.slug),
                    line: dayLine(s.card.day),
                    flagship: false,
                    words: `${s.name} ${s.longName} ${s.card.name} ${s.phrase} ${s.headline} ${s.sub}`.toLowerCase(),
                    ...HUB_PLACES[s.slug],
                }))}
                groups={HUB_GROUPS}
                words={HUB_WORDS}
                cta={
                    <StartFree
                        src="solutions-hub"
                        from="start-free-page"
                        variant="secondary"
                    />
                }
                templatesHref="/templates"
            />
        </div>
    );
}
