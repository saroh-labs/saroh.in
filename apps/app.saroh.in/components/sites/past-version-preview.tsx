"use client";

import type { Section as RenderedSection } from "@saroh/site-blocks";
import { PageSections, SiteTheme } from "@saroh/site-blocks";

/**
 * The class this preview's tokens are scoped to. A literal, for the same
 * reason `DraftPreview` gives: Tailwind and the selector passed to `SiteTheme`
 * must be the same string.
 */
const SCOPE = "past-version-scope";

/**
 * A past version of a merchant's site, drawn from its stored snapshot (#283).
 *
 * It uses the same components the live site renders with, over the tokens the
 * snapshot resolved when it was published. So this is what visitors were
 * served, not old data re-rendered through the editor.
 *
 * INERT: nothing inside can be clicked, focused or submitted. The blocks talk
 * to the public API, and an enquiry form in a version from last spring must not
 * post a real lead from a history screen.
 */
export function PastVersionPreview({
    sections,
    variables,
}: {
    sections: RenderedSection[];
    variables?: Record<string, string> | null;
}) {
    return (
        <div
            inert
            className={`${SCOPE} space-y-4 rounded-[var(--site-radius)] bg-[hsl(var(--site-bg))] p-[var(--site-page-margin)] text-[hsl(var(--site-fg))]`}
        >
            <SiteTheme variables={variables ?? null} selector={`.${SCOPE}`} />
            {sections.length === 0 ? (
                <p className="p-8 text-center text-sm text-[hsl(var(--site-muted))]">
                    This page had no sections when it was published.
                </p>
            ) : (
                <PageSections sections={sections} />
            )}
        </div>
    );
}
