import type { RenderedFeatures } from "@saroh/block-contract";

import { EditableText } from "../editable-text";
import { cn } from "../lib/utils";

/**
 * Highlights' `band` layout (BLOCK-MAP §3 block 2, board LAHighlights
 * "Band"): the Facts row's fields on a full-width band in the site's band
 * colour, the one Call to action uses, so every word on it is drawn from
 * the band's own text colour (never the accent, which may be the band).
 * For a promise worth stopping on: house rules, pickup, delivery.
 *
 * Each point: its figure large when it has one, its title, its line. The
 * heading is optional; with no points the section is left out.
 */
export function FeaturesBand({ content }: { content: RenderedFeatures }) {
    const items = content.items.filter((item) => said(item.title) !== null);
    if (items.length === 0) return null;
    const note = said(content.note);
    const heading = said(content.heading);
    const intro = said(content.intro);
    return (
        <section
            data-site-ground="cta"
            data-features-band=""
            className="bg-site-cta-bg text-site-cta-fg w-full py-[var(--site-section-padding)]"
        >
            <div className="mx-auto w-full max-w-screen-xl px-5 sm:px-[var(--site-page-margin)]">
                {heading ? (
                    <h2
                        data-site-title=""
                        className="font-site-heading text-[calc(1.875rem*var(--site-heading-scale))] font-semibold leading-tight tracking-[-0.01em]"
                    >
                        <EditableText field="heading">{heading}</EditableText>
                    </h2>
                ) : null}
                {intro ? (
                    <p className="mt-3 max-w-2xl text-[17px] leading-relaxed">
                        <EditableText field="intro">{intro}</EditableText>
                    </p>
                ) : null}
                <ul
                    className={cn(
                        "grid gap-x-8 gap-y-6 sm:grid-cols-2",
                        items.length >= 4
                            ? "lg:grid-cols-4"
                            : items.length === 3 && "lg:grid-cols-3",
                        (heading !== null || intro !== null) && "mt-7",
                    )}
                >
                    {items.map((item, i) => (
                        <li
                            key={i}
                            className="border-site-cta-fg/30 grid min-w-0 content-start gap-2 border-t pt-4"
                        >
                            {said(item.value) ? (
                                <p className="font-site-heading text-[calc(1.75rem*var(--site-heading-scale))] font-medium leading-tight [overflow-wrap:anywhere]">
                                    {said(item.value)}
                                </p>
                            ) : null}
                            <h3 className="font-site-heading text-[calc(1.25rem*var(--site-heading-scale))] font-semibold leading-snug [overflow-wrap:anywhere]">
                                {item.title}
                            </h3>
                            {said(item.body) ? (
                                <p className="text-[15px] leading-relaxed">
                                    {item.body}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {note ? (
                    <p className="mt-8 max-w-2xl whitespace-pre-line text-[14px] leading-relaxed">
                        {note}
                    </p>
                ) : null}
            </div>
        </section>
    );
}

function said(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}
