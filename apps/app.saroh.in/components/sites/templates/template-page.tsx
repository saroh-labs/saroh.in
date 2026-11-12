"use client";

import type { LookId } from "@saroh/block-contract";
import {
    PageSections,
    SiteFooter,
    SiteHeader,
    SiteThemeScope,
} from "@saroh/site-blocks";
import type { TemplateRender } from "@saroh/site-blocks/showcase";
import type { ReactNode } from "react";
import { Component } from "react";

import { useSiteFaces } from "@/components/sites/looks/site-faces";

/**
 * One page of a template as the renderer draws it (`templateRender`,
 * `@saroh/site-blocks/showcase`): the header, its sections and the footer
 * with its theme scoped to the page drawn here, never the app around it.
 * A look's Preview (DEC-182) and a template's (DEC-216) both draw through
 * it. A picture, not a visit: the caller makes it inert.
 */
export function TemplatePage({
    render,
    scope,
    look,
    marker,
}: {
    render: TemplateRender;
    /** The theme scope's name, unique on the screen. */
    scope: string;
    look?: LookId;
    /** Data attributes on the page, for tests and recordings. */
    marker?: Record<`data-${string}`, string>;
}) {
    const faces = useSiteFaces();
    return (
        <SiteThemeScope
            name={scope}
            variables={render.styleVariables}
            faces={faces}
            look={look}
        >
            <div
                {...marker}
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

/**
 * A page that throws while drawing shows `fallback` instead of taking the
 * dialog with it (DEC-216, "couldn't draw the preview"). Keyed by the
 * caller on what it draws, so a new template tries again.
 */
export class DrawOrElse extends Component<
    { fallback: ReactNode; children: ReactNode },
    { failed: boolean }
> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
