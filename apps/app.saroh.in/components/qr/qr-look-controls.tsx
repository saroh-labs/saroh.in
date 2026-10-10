"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId, useState } from "react";

import { businessEditHref } from "@/lib/organizations/business-rows";
import { QR_INK } from "@/lib/qr/colours";
import type { QrStyle } from "@/lib/qr/types";
import { QR_LABEL_MAX } from "@/lib/qr/types";
import { QR_LABELS } from "@/lib/qr/words";

import { ChoiceGroup, Eyebrow, pillClass } from "./choice-group";
import type { QrStyleLock } from "./qr-style-lock";

/** Where the business logo is set: Business → Identity, its sheet open. */
export const LOGO_HREF = businessEditHref("logo");

const CUSTOM = "__custom__";

const linkClass =
    "rounded-[4px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground";

/**
 * The maker's third column, above its buttons ("Saroh QR Codes" design):
 * Style (Plain | Logo + colour), Colour and the label under the code.
 *
 * On a plan without its own look the style stays on Plain with the design's
 * one line, and the colours past ink are dimmed and off; the line's link
 * names the plan that has them, from the catalogue. A code already made in
 * its own look keeps it, and says so.
 */
export function QrLookControls({
    style,
    color,
    label,
    swatches,
    lock,
    brandedLocked,
    colorLocked,
    keptBranded,
    logo,
    colorProblem,
    onStyle,
    onColor,
    onLabel,
}: {
    style: QrStyle;
    color: string;
    label: string;
    swatches: readonly string[];
    lock: QrStyleLock | null;
    /** The plan doesn't let this code go branded. */
    brandedLocked: boolean;
    colorLocked: (hex: string) => boolean;
    /** A branded code made before the plan changed. */
    keptBranded: boolean;
    logo: { has: boolean; read: boolean };
    colorProblem: string | null;
    onStyle: (style: QrStyle) => void;
    onColor: (hex: string) => void;
    onLabel: (label: string) => void;
}) {
    const id = useId();
    const [asked, setCustom] = useState(false);
    // A label that isn't one of the three is the merchant's own, whether
    // they typed it here or it came with a saved code.
    const custom = asked || !QR_LABELS.includes(label);

    return (
        <>
            <div className="flex flex-col gap-2">
                <Eyebrow id={`${id}-style`}>Style</Eyebrow>
                <ChoiceGroup<QrStyle>
                    labelledBy={`${id}-style`}
                    choices={[
                        { value: "PLAIN", label: "Plain" },
                        {
                            value: "BRANDED",
                            label: "Logo + colour",
                            disabled: brandedLocked,
                        },
                    ]}
                    value={style}
                    onChange={onStyle}
                    className="flex gap-1 rounded-[10px] bg-muted p-1"
                    itemClassName={(on, choice) =>
                        cn(
                            "h-[34px] flex-1 rounded-[7px] text-sm font-semibold coarse:h-11",
                            on
                                ? "bg-card text-foreground shadow-sm"
                                : choice.disabled
                                  ? "bg-transparent text-muted-foreground"
                                  : "bg-transparent text-foreground hover:bg-card/60 active:bg-card/90",
                        )
                    }
                />
                {lock ? (
                    <p
                        data-qr-lock=""
                        className="text-[13px] text-foreground/80"
                    >
                        {keptBranded ? `${lock.kept} ` : null}
                        {lock.line}{" "}
                        <Link
                            href={lock.href}
                            aria-label={lock.cta}
                            className={linkClass}
                        >
                            {lock.plan}
                        </Link>
                        .
                    </p>
                ) : null}
                {style === "BRANDED" && !logo.has ? (
                    <p className="text-[13px] text-foreground/80">
                        No logo yet, so your initials stand in.{" "}
                        <Link href={LOGO_HREF} className={linkClass}>
                            Add your logo
                        </Link>
                    </p>
                ) : null}
                {style === "BRANDED" && logo.has && !logo.read ? (
                    <p className="text-[13px] text-foreground/80">
                        Your logo couldn&apos;t be read just now, so your
                        initials stand in. Reload to try again.
                    </p>
                ) : null}
            </div>

            <div className="flex flex-col gap-2">
                <Eyebrow id={`${id}-colour`}>Colour</Eyebrow>
                <ChoiceGroup
                    labelledBy={`${id}-colour`}
                    choices={swatches.map((hex) => ({
                        value: hex,
                        label: null,
                        ariaLabel: hex === QR_INK ? "Ink" : `Colour ${hex}`,
                        disabled: colorLocked(hex),
                        // The swatch is the code's own colour, as it prints.
                        style: { background: hex },
                    }))}
                    value={color}
                    onChange={onColor}
                    className="flex flex-wrap gap-2.5"
                    itemClassName={(on, choice) =>
                        cn(
                            "size-[34px] rounded-full border-[3px] border-card ring-[1.5px] coarse:size-11",
                            on ? "ring-foreground" : "ring-border",
                            // The design's 0.35 for a colour the plan leaves off.
                            choice.disabled
                                ? "opacity-35"
                                : !on && "hover:ring-border-strong",
                        )
                    }
                />
                {colorProblem ? (
                    <p
                        role="alert"
                        className="rounded-[9px] bg-destructive-subtle px-3 py-2 text-[13px] text-destructive-subtle-foreground"
                    >
                        {colorProblem}
                    </p>
                ) : null}
            </div>

            <div className="flex flex-col gap-2">
                <Eyebrow id={`${id}-label`}>Label under the code</Eyebrow>
                <ChoiceGroup
                    labelledBy={`${id}-label`}
                    choices={[
                        ...QR_LABELS.map((l) => ({ value: l, label: l })),
                        { value: CUSTOM, label: "Your own…" },
                    ]}
                    value={custom ? CUSTOM : label}
                    onChange={(value) => {
                        if (value === CUSTOM) {
                            setCustom(true);
                            return;
                        }
                        setCustom(false);
                        onLabel(value);
                    }}
                    className="flex flex-wrap gap-2"
                    itemClassName={(on) => pillClass(on)}
                />
                {custom ? (
                    <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
                        Your label
                        <Input
                            value={label}
                            maxLength={QR_LABEL_MAX}
                            onChange={(e) => onLabel(e.target.value)}
                            placeholder="Scan for today's menu"
                            className="font-normal"
                        />
                        <span className="font-normal text-muted-foreground">
                            Leave it empty for no label.
                        </span>
                    </label>
                ) : null}
            </div>
        </>
    );
}
