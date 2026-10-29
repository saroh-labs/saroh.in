"use client";

import { lookName } from "@/components/sites/looks/look-picker";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { activeColourway } from "@/lib/sites/style";

/**
 * The Brand tab for a Reviewer (DEC-200, RVD2): the same choices the owner
 * sees, as plain rows. No pickers, no sliders, no Reset: they can see the
 * look, and owners and admins change it.
 */
export function BrandReadOnly({
    style,
    options,
    looks,
}: {
    style: SiteStyle;
    options: SiteStyleOptions;
    /** The Look row is drawn, as the owner's is (`SITE_LOOKS`). */
    looks: boolean;
}) {
    const pairs = options.fontPairs ?? [];
    const typeface = (
        pairs.find((p) => p.key === style.fontPair) ?? pairs.at(0)
    )?.name;
    const colourway = activeColourway(style, options.colourways)?.name;
    const groups: { title: string; rows: [string, string][] }[] = [
        {
            title: "Look",
            rows:
                looks || style.look
                    ? [
                          [
                              lookName(style.look),
                              colourway ?? "Your own fonts and colours",
                          ],
                      ]
                    : colourway
                      ? [["Colours", colourway]]
                      : [],
        },
        {
            title: "Typeface",
            rows: typeface ? [["Headings and text", typeface]] : [],
        },
        {
            title: "Colour",
            rows: options.rows.map((row) => [
                row.label,
                row.swatches.find((s) => s.key === style.colours[row.key])
                    ?.label ?? "Not set",
            ]),
        },
        {
            title: "Spacing and shape",
            rows: options.scalars.map((sc) => [
                sc.label,
                `${style.scalars[sc.key] ?? sc.default}${sc.unit}`,
            ]),
        },
    ];
    return (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {groups
                .filter((g) => g.rows.length > 0)
                .map((g) => (
                    <section key={g.title} aria-label={g.title}>
                        <h3 className="label pb-1">{g.title}</h3>
                        <dl className="grid gap-1 text-[0.8125rem]">
                            {g.rows.map(([term, value]) => (
                                <div
                                    key={term}
                                    className="flex items-baseline justify-between gap-3"
                                >
                                    <dt className="text-muted-foreground">
                                        {term}
                                    </dt>
                                    <dd className="text-right font-medium">
                                        {value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                You can see the look. Owners and admins change it.
            </p>
        </div>
    );
}
