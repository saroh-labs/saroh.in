import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
    lookOf,
    lookScope,
    PageSections,
    SiteChromeFrame,
    SiteFooter,
    SiteHeader,
    SiteTheme,
} from "@saroh/site-blocks";

import { env } from "@/env";
import { SITE_FACES } from "@/lib/site-fonts";
import { templateRendersAllowed } from "@/lib/template-renders/guard";
import { rootDomain } from "@/lib/test-release";
import { templateRender } from "@saroh/site-blocks/showcase";

/**
 * A gallery template drawn for its sample business (industry templates U14):
 * `/template-renders/<template>/<colourway>/<page path>` — `bakery/crust`
 * for the home page, `gym/acid/timetable` for another. The real header,
 * blocks, theme, fonts and footer a published site gets, from fixtures and
 * with no API (`@saroh/site-blocks/showcase`, `render.ts`), so the gallery's and the
 * picker's 2× captures are the renderer's own output (KTD-6), taken by
 * `e2e/marketing-shots/template-shots.ts`.
 *
 * Only on the renderer's own host, with `TEMPLATE_RENDERS=on`, and never on
 * a production deployment (`lib/template-renders/guard.ts`); otherwise a
 * 404. Never indexed. `_` for the colourway is the template's first.
 * `?look=quiet` (or `folio`, `live`) draws it in that look (DEC-172, U16),
 * for the editor's Look row pictures; anything else is Classic.
 */

export const metadata: Metadata = {
    title: "Template render",
    robots: { index: false, follow: false },
};

export default async function TemplateRenderPage({
    params,
    searchParams,
}: {
    params: Promise<{ template: string; style: string; path?: string[] }>;
    searchParams: Promise<{ look?: string | string[] }>;
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
    const look = lookOf((await searchParams).look);
    const render = templateRender(
        decodeURIComponent(template),
        style === "_" ? undefined : decodeURIComponent(style),
        `/${(path ?? []).map(decodeURIComponent).join("/")}`,
        look,
    );
    if (!render) notFound();

    return (
        <div
            className="min-h-screen bg-site-bg text-site-body"
            data-template-render={render.templateId}
            {...lookScope(look)}
        >
            <SiteTheme
                variables={render.styleVariables}
                faces={SITE_FACES}
                look={look}
            />
            <SiteChromeFrame
                account={false}
                header={
                    <SiteHeader
                        look={look}
                        name={render.name}
                        navigation={render.navigation}
                        action={render.action}
                        shopServes={render.shopServes}
                    />
                }
                footer={
                    <SiteFooter
                        look={look}
                        footer={render.footer}
                        name={render.name}
                        // The header's menu again at the foot, as live.
                        navigation={render.navigation}
                        shopServes={render.shopServes}
                    />
                }
            >
                <PageSections
                    sections={render.sections}
                    siteName={render.name}
                    bookHref="/book"
                    journal={render.journal}
                    plans={render.plans}
                    packs={render.packs}
                    productGrids={render.productGrids}
                    fixtures={render.fixtures}
                    frontDoor={render.frontDoor}
                    look={look}
                />
            </SiteChromeFrame>
        </div>
    );
}
