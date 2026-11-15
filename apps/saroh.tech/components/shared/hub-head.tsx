import { PageHero } from "@saroh/marketing/page-hero";
import type { ReactNode } from "react";

import type { SitePage } from "@/lib/site-map";

import { JsonLd } from "./json-ld";

import { pageSchema } from "@/lib/schema";

/** A hub page's schema, trail, title (the kit's h1 with its mark) and one line. */
export function HubHead({
    page,
    children,
    action,
}: {
    page: SitePage;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <>
            <JsonLd data={pageSchema(page)} />
            <PageHero
                crumbs={page.crumb?.map((c) => ({
                    name: c.name,
                    href: c.path,
                }))}
                title={page.h1}
                lead={children}
                className="px-0 pb-0 min-[760px]:pb-0"
            >
                {action}
            </PageHero>
        </>
    );
}
