"use client";

import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { readOnlyLine } from "@/components/shared/states/who-can-change";
import { ComponentStyleList } from "@/components/sites/looks/component-styles";
import { ROW_NAMES } from "@/components/sites/looks/look-changes";
import { lookName } from "@/components/sites/looks/look-picker";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { activeColourway } from "@/lib/sites/style";

/**
 * Brand for a Reviewer (DEC-200, RVD2; groups as U24b names them): the
 * same choices the owner sees, as plain rows. No pickers, no Reset: they
 * can see the look, and owners and admins change it.
 */
export function BrandReadOnly({
    style,
    options,
    looks,
    template,
    denied = false,
}: {
    /**
     * An editor whose role can't change the look (C11, `fix/WXKStates` "No
     * access to Brand"): the shared note says so and who can change it.
     */
    denied?: boolean;
    style: SiteStyle;
    options: SiteStyleOptions;
    /** The Look row is drawn, as the owner's is (`SITE_LOOKS`). */
    looks: boolean;
    /**
     * The site's template (DEC-216); null when not recorded; absent draws
     * no Template row (the choice is off, DEC-135).
     */
    template?: string | null;
}) {
    const pairs = options.fontPairs ?? [];
    const typeface = (
        pairs.find((p) => p.key === style.fontPair) ?? pairs.at(0)
    )?.name;
    const colourway = activeColourway(style, options.colourways)?.name;
    const started: [string, string][] =
        template === undefined
            ? []
            : [
                  template
                      ? ["Started from", template]
                      : ["Started from", "Your own pages"],
              ];
    const groups: { title: string; rows: [string, string][] }[] = [
        {
            title: "Look",
            rows: [
                ...(looks || style.look
                    ? [[lookName(style.look), "Now"] as [string, string]]
                    : []),
                ...started,
            ],
        },
        {
            title: "Colours",
            rows: [
                ...(colourway || style.brandColour
                    ? [
                          [
                              "Colours",
                              colourway ?? "Made from your brand colour",
                          ] as [string, string],
                      ]
                    : []),
                ...options.rows.map((row): [string, string] => [
                    ROW_NAMES[row.key] ?? row.label,
                    row.swatches.find((s) => s.key === style.colours[row.key])
                        ?.label ?? "Not set",
                ]),
            ],
        },
        {
            title: "Fonts",
            rows: typeface ? [["Headings and text", typeface]] : [],
        },
    ];
    return (
        <div
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
            data-brand-read-only={denied ? "denied" : "reader"}
        >
            {denied ? (
                <ReadOnlyNote className="mb-0">
                    {readOnlyLine("the look")} You can still change words and
                    photos on every page.
                </ReadOnlyNote>
            ) : null}
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
            <section aria-label="Buttons and shapes">
                <h3 className="label pb-1">Buttons and shapes</h3>
                {/* The owner's choices, drawn off (DEC-200, DEC-227). */}
                <ComponentStyleList
                    style={style}
                    onChange={noChange}
                    disabled
                />
            </section>
            {denied ? null : (
                <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
                    You can see the look. Owners and admins change it.
                </p>
            )}
        </div>
    );
}

const noChange = () => undefined;
