"use client";

import { customColourWords, mixHex } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { useState } from "react";

/** Five steps from lighter to darker; the middle one is the role itself. */
export function shadesOf(base: string): string[] {
    return [
        mixHex(base, "#FFFFFF", 0.5),
        mixHex(base, "#FFFFFF", 0.25),
        base,
        mixHex(base, "#000000", 0.25),
        mixHex(base, "#000000", 0.5),
    ];
}

/**
 * The shade strip under the selected colour role (ERVPalette): lighter to
 * darker in five steps. The middle step is the role itself (`onRole`); any
 * other is a custom colour (`onShade`). A shade whose words fail 4.5:1 is
 * not applied at once: it says so and waits for "Use it anyway" (DEC-256).
 */
export function ShadeStrip({
    label,
    base,
    current,
    onRole,
    onShade,
}: {
    /** The role's name: "Brand". */
    label: string;
    /** The role's colour, `#RRGGBB`. */
    base: string;
    /** The custom colour in force, when it is one of this role's shades. */
    current: string | null;
    onRole: () => void;
    onShade: (hex: string) => void;
}) {
    const shades = shadesOf(base);
    const [pending, setPending] = useState<string | null>(null);
    const on = current ?? base;
    const pick = (hex: string, i: number) => {
        if (i === 2) {
            setPending(null);
            return onRole();
        }
        if (customColourWords(hex).readable) {
            setPending(null);
            return onShade(hex);
        }
        setPending(hex);
    };
    const bad = pending ? customColourWords(pending) : null;
    return (
        <div className="mt-3 grid gap-1.5" data-shade-strip="">
            <p className="text-xs font-semibold">{label} · shade</p>
            <div
                role="group"
                aria-label={`${label} shade`}
                className="flex gap-1"
            >
                {shades.map((hex, i) => (
                    <button
                        key={i}
                        type="button"
                        aria-label={`${label} shade ${i + 1} of 5, ${hex}`}
                        aria-pressed={(pending ?? on) === hex}
                        data-shade={hex}
                        onClick={() => pick(hex, i)}
                        className={cn(
                            "h-[34px] flex-1 rounded-[7px] border border-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11",
                            (pending ?? on) === hex &&
                                "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                        )}
                        style={{ background: hex }}
                    />
                ))}
            </div>
            <p className="flex justify-between text-[11px] text-muted-foreground">
                <span>Lighter</span>
                <span>Darker</span>
            </p>
            {pending && bad ? (
                <Notice
                    tone="error"
                    data-shade-warning=""
                    className="grid gap-2 text-xs"
                >
                    <span>
                        <b>Words on this shade are hard to read</b> (
                        {bad.ratio.toFixed(2)} : 1, it needs 4.5 : 1). Use it
                        anyway, or pick another.
                    </span>
                    <span className="flex gap-2">
                        <Button
                            type="button"
                            size="sm"
                            className="coarse:h-11"
                            onClick={() => {
                                onShade(pending);
                                setPending(null);
                            }}
                        >
                            Use it anyway
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="coarse:h-11"
                            onClick={() => setPending(null)}
                        >
                            Pick another
                        </Button>
                    </span>
                </Notice>
            ) : null}
        </div>
    );
}
