"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useMemo, useState } from "react";

import { roleFill } from "@/lib/sites/element-style";
import type {
    SiteStyle,
    SiteStyleOptions,
    StyleColourway,
} from "@/lib/sites/style";
import {
    activeColourway,
    inColourway,
    resolveStyleVariables,
} from "@/lib/sites/style";
import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { ALL_FREE } from "@/lib/sites/style-access";

/** The roles the card shows, in the board's order (CSI-C, without Tint). */
const STRIP = [
    ["bg", "Background"],
    ["surface", "Panels"],
    ["fg", "Text"],
    ["accent", "Brand colour"],
    ["rule", "Lines"],
] as const;

/**
 * Site colours, always in view under Pages (board CSI-C): the palette the
 * whole site wears, so the merchant sees it before styling one button.
 * Change opens "Palettes to try": the look's colourways (DEC-090) as rows,
 * each tried live on every page with Keep or Cancel. A paid colourway is
 * refused in place (DEC-177).
 *
 * shortcut: only the site's colourways are offered, pending the owner's
 * answer on "any palette on any look".
 */
export function SiteColoursCard({
    style,
    options,
    rules = ALL_FREE,
    readOnly = false,
    onChange,
    onTry,
    onBrand,
}: {
    style: SiteStyle;
    options: SiteStyleOptions;
    rules?: StyleChoiceRules;
    readOnly?: boolean;
    onChange: (next: SiteStyle) => void;
    onTry: (next: SiteStyle | null) => void;
    /** Change, when the look has no colourways: Brand's colours. */
    onBrand?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [trying, setTrying] = useState<StyleColourway | null>(null);
    const [refused, setRefused] = useState<string | null>(null);
    const colourways = options.colourways ?? [];
    const current = activeColourway(style, colourways);
    const vars = useMemo(
        () => resolveStyleVariables(style, options),
        [style, options],
    );
    const name = current
        ? `${current.name}${current.id === options.startColourway ? " · the look's own" : ""}`
        : "Your own colours";

    const stop = () => {
        setTrying(null);
        onTry(null);
    };
    const tryOn = (cw: StyleColourway) => {
        if (rules.refuses("colourway", cw.id)) {
            setRefused(cw.name);
            return;
        }
        setRefused(null);
        setTrying(cw);
        onTry(inColourway(style, cw));
    };

    return (
        <section
            aria-label="Site colours"
            data-site-colours=""
            className="mx-2 mt-2 grid gap-2 rounded-[10px] border bg-card p-2.5"
        >
            <div className="flex items-center gap-2">
                <h3 className="flex-1 text-sm font-semibold">Site colours</h3>
                {readOnly ? null : colourways.length === 0 ? (
                    onBrand ? (
                        <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0 font-semibold"
                            onClick={onBrand}
                        >
                            Change
                        </Button>
                    ) : null
                ) : (
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        aria-expanded={open}
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                            if (open) stop();
                            setOpen(!open);
                        }}
                    >
                        {open ? "Close" : "Change"}
                    </Button>
                )}
            </div>
            <div className="flex overflow-hidden rounded-md border" aria-hidden>
                {STRIP.map(([v]) => (
                    <span
                        key={v}
                        className="h-6 flex-1"
                        style={{
                            background: roleFill(vars, v),
                        }}
                    />
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                <span className="sr-only">
                    {STRIP.map(([, label]) => label).join(", ")}:{" "}
                </span>
                {name}
            </p>

            {open ? (
                <div className="grid gap-1.5" data-palettes-to-try="">
                    <p className="text-xs font-semibold">Palettes to try</p>
                    {colourways.map((cw) => {
                        const [page, ink] = cw.chips;
                        const accent = cw.chips[2] as string | undefined;
                        const on = (trying ?? current)?.id === cw.id;
                        return (
                            <button
                                key={cw.id}
                                type="button"
                                aria-pressed={on}
                                data-palette={cw.id}
                                onClick={() => tryOn(cw)}
                                className={cn(
                                    "flex min-h-11 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[0.8125rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on
                                        ? "border-foreground ring-1 ring-foreground"
                                        : "hover:bg-muted",
                                )}
                            >
                                <span
                                    aria-hidden
                                    className="grid size-8 shrink-0 place-items-center rounded-md border text-sm font-semibold"
                                    style={{
                                        background: `hsl(${page})`,
                                        color: `hsl(${ink})`,
                                    }}
                                >
                                    Aa
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">
                                    {cw.name}
                                </span>
                                <span
                                    aria-hidden
                                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                    style={{
                                        background: `hsl(${accent ?? ink})`,
                                        color: `hsl(${page})`,
                                    }}
                                >
                                    Button
                                </span>
                                {rules.isPaid("colourway", cw.id) ? (
                                    <span className="text-[11px] text-muted-foreground">
                                        Paid plans
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                    {refused ? (
                        <p role="status" className="text-xs text-destructive">
                            {refused} comes with paid plans. Your colours stay
                            as they are.
                        </p>
                    ) : null}
                    {trying ? (
                        <div
                            role="status"
                            className="grid gap-2 rounded-lg bg-muted p-2 text-xs"
                        >
                            <span>
                                Trying {trying.name} on every page. Buttons on a
                                site colour follow. A custom button keeps its
                                colour.
                            </span>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={stop}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="flex-1"
                                    onClick={() => {
                                        onChange(inColourway(style, trying));
                                        stop();
                                        setOpen(false);
                                    }}
                                >
                                    Keep
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
