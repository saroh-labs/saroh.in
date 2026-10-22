"use client";

import type { LookId } from "@saroh/block-contract";
import {
    PageSections,
    SiteFooter,
    SiteHeader,
    SiteThemeScope,
} from "@saroh/site-blocks";
import { templateRender } from "@saroh/site-blocks/showcase";
import { LOOK_SHOWCASE_TEMPLATE } from "@saroh/templates";

import { useSiteFaces } from "@/components/sites/site-faces";

/**
 * A look's showcase (DEC-182): the home page of the template that shows
 * best what the look can do (`LOOK_SHOWCASE_TEMPLATE`: Quiet the Salon,
 * Live the Gym, Folio the Studio, Classic the Bakery), drawn for its
 * sample business with the gallery's sample words and pictures. The same
 * render the template gallery draws (`@saroh/site-blocks/showcase`), with
 * no API and nothing of the business's own.
 *
 * Its theme is scoped to the page drawn here, never the editor around it.
 * A picture, not a visit: the caller makes it inert.
 */
export function LookShowcase({ look: chosen }: { look: LookId | null }) {
    const faces = useSiteFaces();
    const look = chosen ?? undefined;
    const templateId = LOOK_SHOWCASE_TEMPLATE[look ?? "classic"];
    const render = templateRender(templateId, undefined, "/", look);
    // Every template in the mapping draws (`look-showcase.test.ts`).
    if (!render) return null;
    return (
        <SiteThemeScope
            name="look-showcase"
            variables={render.styleVariables}
            faces={faces}
            look={look}
        >
            <div
                data-look-showcase={templateId}
                className="bg-[hsl(var(--site-bg))] font-site-body text-[hsl(var(--site-fg))]"
            >
                <SiteHeader
                    look={look}
                    name={render.name}
                    navigation={render.navigation}
                    action={render.action}
                    shopServes={render.shopServes}
                />
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
                <SiteFooter
                    look={look}
                    footer={render.footer}
                    name={render.name}
                    navigation={render.navigation}
                    shopServes={render.shopServes}
                />
            </div>
        </SiteThemeScope>
    );
}
