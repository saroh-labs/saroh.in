import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
    PageSections,
    SiteChromeFrame,
    SiteFooter,
    SiteHeader,
    SiteTheme,
} from "@saroh/site-blocks";

import { env } from "@/env";
import { SITE_FACES } from "@/lib/site-fonts";
import { templateRendersAllowed } from "@/lib/template-renders/guard";
import { templateRender } from "@/lib/template-renders/render";
import { rootDomain } from "@/lib/test-release";

/**
 * A gallery template drawn for its sample business (industry templates U14):
 * `/template-renders/<template>/<colourway>/<page path>` — `bakery/crust`
 * for the home page, `gym/acid/timetable` for another. The real header,
 * blocks, theme, fonts and footer a published site gets, from fixtures and
 * with no API (`lib/template-renders/render.ts`), so the gallery's and the
 * picker's 2× captures are the renderer's own output (KTD-6), taken by
 * `e2e/marketing-shots/template-shots.ts`.
 *
 * Only on the renderer's own host, with `TEMPLATE_RENDERS=on`, and never on
 * a production deployment (`lib/template-renders/guard.ts`); otherwise a
 * 404. Never indexed. `_` for the colourway is the template's first.
 */

export const metadata: Metadata = {
    title: "Template render",
    robots: { index: false, follow: false },
};

export default async function TemplateRenderPage({
    params,
}: {
    params: Promise<{ template: string; style: string; path?: string[] }>;
}) {
    const host = (await headers()).get("host");
    if (
        !templateRendersAllowed({
            host,
            rootDomain: rootDomain(),
            flag: env.TEMPLATE_RENDERS,
            vercelEnv: env.VERCEL_ENV,
        })
    ) {
        notFound();
    }

    const { template, style, path } = await params;
    const render = templateRender(
        decodeURIComponent(template),
        style === "_" ? undefined : decodeURIComponent(style),
        `/${(path ?? []).map(decodeURIComponent).join("/")}`,
    );
    if (!render) notFound();

    return (
        <div
            className="min-h-screen bg-site-bg text-site-body"
            data-template-render={render.templateId}
        >
            <SiteTheme variables={render.styleVariables} faces={SITE_FACES} />
            <SiteChromeFrame
                account={false}
                header={
                    <SiteHeader
                        name={render.name}
                        navigation={render.navigation}
                        action={render.action}
                        shopServes={render.shopServes}
                    />
                }
                footer={
                    <SiteFooter footer={render.footer} name={render.name} />
                }
            >
                <PageSections
                    sections={render.sections}
                    bookHref="/book"
                    journal={render.journal}
                    plans={render.plans}
                    packs={render.packs}
                    productGrids={render.productGrids}
                    fixtures={render.fixtures}
                />
            </SiteChromeFrame>
        </div>
    );
}
