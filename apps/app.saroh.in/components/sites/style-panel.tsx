"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";

import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { contrastOk } from "@/lib/sites/style";

/**
 * The Style panel (#189) — colour and spacing for a whole site.
 *
 * Curated, not free: six rows of five options each, drawn from the palette the
 * API serves. A colour picker would let a merchant produce something
 * unreadable, and "pick any hex" moves the design problem onto the person least
 * equipped to solve it. Five good choices is the feature.
 *
 * Every change applies to the preview immediately — the values resolve into
 * `--site-*` custom properties on the preview subtree, so nothing round-trips
 * to show a colour.
 */
export function StylePanel({
    style,
    options,
    onChange,
    onReset,
    onBack,
    saving,
}: {
    style: SiteStyle;
    options: SiteStyleOptions;
    onChange: (next: SiteStyle) => void;
    onReset: () => void;
    onBack: () => void;
    saving: boolean;
}) {
    const swatchesFor = (row: string) =>
        options.rows.find((r) => r.key === row)?.swatches ?? [];
    const hslOf = (row: string, key: string) =>
        swatchesFor(row).find((s) => s.key === key)?.hsl;

    const groundHsl = hslOf("pageGround", style.colours.pageGround);

    /** Whether a text colour is legible on the currently chosen page ground. */
    const textReadable = (textHsl: string) =>
        !groundHsl || contrastOk(groundHsl, textHsl);

    /*
     * Which text swatch is actually in force.
     *
     * A style saved before this rule existed — or by an older client — can hold
     * a pair the renderer now corrects. Marking the STORED choice as selected
     * would show a disabled swatch as chosen while the preview rendered a
     * different colour, so the panel follows the preview: it shows what is
     * really being used.
     */
    const storedTextHsl = hslOf("text", style.colours.text);
    const effectiveTextKey =
        storedTextHsl && !textReadable(storedTextHsl)
            ? (swatchesFor("text").find((sw) => textReadable(sw.hsl))?.key ??
              style.colours.text)
            : style.colours.text;

    function setColour(row: string, key: string) {
        const next: SiteStyle = {
            ...style,
            colours: { ...style.colours, [row]: key },
        };

        /*
         * Page ground and text are independent, so a new ground can make the
         * current text unreadable. Move the text to a legible option HERE, so
         * the merchant sees the swatch move, rather than letting the renderer
         * quietly substitute one — a site that silently ignores a choice is
         * worse than one that visibly corrects it.
         */
        if (row === "pageGround") {
            const ground = hslOf("pageGround", key);
            const current = hslOf("text", style.colours.text);
            if (ground && current && !contrastOk(ground, current)) {
                const legible = swatchesFor("text").find((sw) =>
                    contrastOk(ground, sw.hsl),
                );
                if (legible) next.colours.text = legible.key;
            }
        }

        onChange(next);
    }
    function setScalar(key: string, value: number) {
        onChange({ ...style, scalars: { ...style.scalars, [key]: value } });
    }

    return (
        <div className="flex min-h-0 flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-xs font-semibold">Style</span>
                <button
                    type="button"
                    onClick={onBack}
                    className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    Back to sections
                </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
                <section className="space-y-3">
                    <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Colour
                    </h3>
                    {options.rows.map((row) => (
                        <div key={row.key} className="space-y-1.5">
                            <span className="text-xs">{row.label}</span>
                            <div
                                role="radiogroup"
                                aria-label={row.label}
                                className="flex gap-1.5"
                            >
                                {row.swatches.map((swatch) => {
                                    const active =
                                        row.key === "text"
                                            ? effectiveTextKey === swatch.key
                                            : style.colours[row.key] ===
                                              swatch.key;
                                    // Only the text row can be illegible against
                                    // a choice made elsewhere in this panel.
                                    const unreadable =
                                        row.key === "text" &&
                                        !textReadable(swatch.hsl);
                                    return (
                                        <button
                                            key={swatch.key}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            // The swatch is the label: a name
                                            // like "Clay" means nothing without
                                            // the colour, and the colour means
                                            // nothing to a screen reader without
                                            // the name.
                                            aria-label={swatch.label}
                                            disabled={unreadable}
                                            title={
                                                unreadable
                                                    ? `${swatch.label} — too close to the page colour to read`
                                                    : swatch.label
                                            }
                                            onClick={() =>
                                                setColour(row.key, swatch.key)
                                            }
                                            style={{
                                                background: `hsl(${swatch.hsl})`,
                                            }}
                                            className={cn(
                                                "h-7 w-7 rounded border transition-[box-shadow]",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                                active
                                                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                                                    : "border-border hover:ring-2 hover:ring-border",
                                                // Struck through rather than
                                                // hidden: the option still
                                                // exists, it just does not work
                                                // with this page colour.
                                                unreadable &&
                                                    "cursor-not-allowed opacity-30",
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </section>

                <section className="space-y-3 border-t pt-4">
                    <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                        Spacing and shape
                    </h3>
                    {options.scalars.map((scalar) => {
                        const value = style.scalars[scalar.key] ?? scalar.min;
                        return (
                            <div key={scalar.key} className="space-y-1">
                                <div className="flex items-baseline justify-between">
                                    <label
                                        htmlFor={`style-${scalar.key}`}
                                        className="text-xs"
                                    >
                                        {scalar.label}
                                    </label>
                                    <span className="text-xs tabular-nums text-muted-foreground">
                                        {scalar.unit === "×"
                                            ? `${value.toFixed(2)}×`
                                            : `${value}${scalar.unit}`}
                                    </span>
                                </div>
                                <input
                                    id={`style-${scalar.key}`}
                                    type="range"
                                    min={scalar.min}
                                    max={scalar.max}
                                    step={scalar.step}
                                    value={value}
                                    onChange={(e) =>
                                        setScalar(
                                            scalar.key,
                                            Number(e.target.value),
                                        )
                                    }
                                    className="w-full accent-foreground"
                                />
                            </div>
                        );
                    })}
                </section>
            </div>

            <div className="flex items-center justify-between gap-2 border-t p-3">
                <p className="text-xs text-muted-foreground">
                    {saving ? "Saving…" : "Applies to every page on this site."}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onReset}
                >
                    Reset
                </Button>
            </div>
        </div>
    );
}
