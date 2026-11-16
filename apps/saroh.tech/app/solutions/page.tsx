import { SolutionsHub } from "@saroh/marketing/solutions/hub";

import { JsonLd } from "@/components/shared/json-ld";
import { StartFree } from "@/components/solution/start-free";
import {
    ALL_TRADES,
    HUB_GROUPS,
    HUB_PATH,
    HUB_WORDS,
} from "@/content/solutions-hub";
import { pageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { pageOf } from "@/lib/site-map";

const page = pageOf(HUB_PATH);

export const metadata = pageMetadata(page);

/**
 * /solutions: saroh.in's /for hub (DEC-221, `SolutionsHub`) over every
 * saroh.tech trade, each at one ordinary moment of its day. No trade has a
 * written day yet, so none is marked as told in full.
 */
export default function SolutionsHubPage() {
    return (
        <div data-page-type={page.type}>
            <JsonLd data={pageSchema(page)} />
            <SolutionsHub
                tiles={ALL_TRADES.map((t) => ({
                    slug: t.slug,
                    name: t.name,
                    href: t.href,
                    line: t.line,
                    flagship: false,
                    words: t.words,
                    group: t.group,
                    at: t.at,
                    way: t.way,
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
