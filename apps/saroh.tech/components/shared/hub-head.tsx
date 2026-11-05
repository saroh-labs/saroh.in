import { PageTitle } from "@saroh/marketing/page-title";
import type { ReactNode } from "react";

import type { SitePage } from "@/lib/site-map";

import { Breadcrumb } from "./breadcrumb";
import { JsonLd } from "./json-ld";

import { pageSchema } from "@/lib/schema";

/** A hub page's schema, trail, title and one line. */
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
            <div className="flex max-w-[860px] flex-col gap-4">
                {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
                <PageTitle size="page">{page.h1}</PageTitle>
                <p className="m-0 text-mk-intro text-mk-copy">{children}</p>
                {action}
            </div>
        </>
    );
}
