"use client";

import type { LookId } from "@saroh/block-contract";
import { templateRender } from "@saroh/site-blocks/showcase";
import { LOOK_SHOWCASE_TEMPLATE } from "@saroh/templates";

import { TemplatePage } from "@/components/sites/templates/template-page";

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
    const look = chosen ?? undefined;
    const templateId = LOOK_SHOWCASE_TEMPLATE[look ?? "classic"];
    const render = templateRender(templateId, undefined, "/", look);
    // Every template in the mapping draws (`look-showcase.test.ts`).
    if (!render) return null;
    return (
        <TemplatePage
            render={render}
            scope="look-showcase"
            look={look}
            marker={{ "data-look-showcase": templateId }}
        />
    );
}
