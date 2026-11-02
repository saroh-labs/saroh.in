import { pageSchema } from "@/lib/schema";
import type { SitePage } from "@/lib/site-map";
import { signupHref } from "@/site.config";

import { Breadcrumb } from "./breadcrumb";
import { ButtonLink } from "./button";

/** A page its phase hasn't built yet: the right words at the right address, noindex. */
export function StubPage({ page }: { page: SitePage }) {
    return (
        <div
            data-page-type={page.type}
            className="mx-auto flex max-w-[1440px] flex-col gap-6 px-4 pt-6 md:px-20 md:pt-7"
        >
            {pageSchema(page).map((ld, i) => (
                <script
                    key={i}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(ld).replace(/</g, "\\u003c"),
                    }}
                />
            ))}
            {page.crumb ? <Breadcrumb crumbs={page.crumb} /> : null}
            <h1 className="m-0 font-display text-[34px] font-bold leading-[1.02] tracking-[-0.045em] md:text-[56px] md:leading-none">
                {page.h1}
            </h1>
            <p className="m-0 max-w-[66ch] text-lg leading-normal text-body">
                {page.description}
            </p>
            <div>
                <ButtonLink
                    href={signupHref(page.type)}
                    data-cta="start-free-page"
                >
                    Start free
                </ButtonLink>
            </div>
        </div>
    );
}
