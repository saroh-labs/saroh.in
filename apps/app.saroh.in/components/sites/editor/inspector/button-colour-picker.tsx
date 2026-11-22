"use client";

import {
    contrastRatio,
    customColourWords,
    darkenToRead,
} from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Segmented } from "@saroh/ui/segmented";
import { Check, Pipette, Plus, TriangleAlert, X } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import {
    eyeDropper,
    typedHex,
} from "@/components/sites/looks/brand-colour-sheet";
import type { Hsv } from "@/lib/sites/element-style";
import {
    hexToHsv,
    hsvToHex,
    recentColours,
    rememberColour,
} from "@/lib/sites/element-style";

/** "White words read clearly (4.9 : 1)", always shown (CS1). */
export function ReadableLine({
    ratio,
    light,
    className = "mt-2",
}: {
    ratio: number;
    light: boolean;
    className?: string;
}) {
    const ok = ratio >= 4.5;
    return (
        <p
            data-readable={ok ? "yes" : "no"}
            className={cn(
                "flex items-center gap-1.5 text-xs",
                ok ? "text-success" : "text-destructive",
                className,
            )}
        >
            {ok ? (
                <Check aria-hidden className="size-3.5" />
            ) : (
                <TriangleAlert aria-hidden className="size-3.5" />
            )}
            {light ? "White" : "Dark"} words{" "}
            {ok ? "read clearly" : "are hard to read"} ({ratio.toFixed(1)} : 1)
        </p>
    );
}

/** One of the site's colours, as the Site colours tab lists it. */
export interface RoleColour {
    value: string;
    label: string;
    /** `#RRGGBB`, or null when the palette doesn't name it. */
    hex: string | null;
}

/**
 * Custom, as the picker "Button colour" (CSI-C, states 2 and 3): Site
 * colours lists the roles with their hex and Recent; Custom is the
 * saturation square, the hue strip, hex and the eyedropper. The colour is
 * drawn on the canvas as it is picked (`onTry`), checked as it is picked
 * (CS4): white words that don't read show the two fixes, and "Use this
 * colour" waits for one, so an unreadable button is never saved.
 */
export function CustomColour({
    value,
    start,
    role,
    roles,
    onRole,
    onUse,
    onTry,
}: {
    /** The button's own custom colour, if it has one. */
    value: string | null;
    /** The colour the button wears now: where the picker starts. */
    start: string;
    /** The role it follows, when it follows one. */
    role: string | null;
    roles: readonly RoleColour[];
    onRole: (role: string) => void;
    onUse: (hex: string) => void;
    onTry?: (hex: string | null) => void;
}) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"site" | "custom">("custom");
    const [typed, setTyped] = useState(value ?? start);
    const [fix, setFix] = useState<"dark" | "darken" | null>(null);
    const [recent, setRecent] = useState<string[]>([]);
    // Beside the inspector on a desk, where the whole height is free;
    // above the tile on a phone.
    const [side, setSide] = useState<"left" | "top">("left");
    const hex = typedHex(typed);
    const hsv: Hsv = hex ? hexToHsv(hex) : { h: 0, s: 0, v: 0 };
    // A grey has no hue of its own: the strip keeps the last one chosen.
    const [hueKept, setHueKept] = useState(hsv.h);
    const hue = hsv.s > 0 && hsv.v > 0 ? hsv.h : hueKept;
    const words = hex ? customColourWords(hex) : null;
    const whiteReads = words?.words === "light" && words.readable;
    const shade = hex && !whiteReads ? darkenToRead(hex) : null;
    const canUse =
        hex !== null &&
        (whiteReads ||
            (fix === "dark" && words?.readable === true) ||
            fix === "darken");
    const chosen = fix === "darken" && shade ? shade : hex;

    // The colour on trial, on the canvas, while the picker is open.
    const tryRef = useRef(onTry);
    useEffect(() => {
        tryRef.current = onTry;
    });
    // Only the Custom tab previews: Site colours ends the trial (ER3 re-check).
    const trying =
        open &&
        tab === "custom" &&
        chosen !== null &&
        chosen !== (value ?? start);
    useEffect(() => {
        if (!trying || !chosen) return;
        tryRef.current?.(chosen);
        return () => tryRef.current?.(null);
    }, [trying, chosen]);

    const pick = (next: string) => {
        setTyped(next);
        setFix(null);
    };
    const pickHsv = (next: Hsv) => {
        setHueKept(next.h);
        pick(hsvToHex(next));
    };
    const openWith = (next: boolean) => {
        if (next) {
            setTyped(value ?? start);
            setFix(null);
            setTab("custom");
            setRecent(recentColours());
            setSide(
                window.matchMedia("(min-width: 768px)").matches
                    ? "left"
                    : "top",
            );
        }
        setOpen(next);
    };
    const use = () => {
        if (!chosen || !canUse) return;
        setRecent(rememberColour(chosen));
        onUse(chosen);
        setOpen(false);
    };

    const square = useRef<HTMLDivElement>(null);
    const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
        const box = square.current?.getBoundingClientRect();
        if (!box || box.width === 0) return;
        const clamp = (n: number) => Math.min(1, Math.max(0, n));
        pickHsv({
            h: hue,
            s: clamp((e.clientX - box.left) / box.width),
            v: clamp(1 - (e.clientY - box.top) / box.height),
        });
    };
    const onSquareKey = (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
        };
        const d = move[e.key] as [number, number] | undefined;
        if (!d) return;
        e.preventDefault();
        const clamp = (n: number) => Math.min(1, Math.max(0, n));
        pickHsv({ h: hue, s: clamp(hsv.s + d[0]), v: clamp(hsv.v + d[1]) });
    };

    const recentRow = (
        <div className="flex flex-wrap items-center gap-2" data-recent="">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
            </span>
            {recent.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                    Colours you use land here.
                </span>
            ) : null}
            {recent.map((h) => (
                <button
                    key={h}
                    type="button"
                    aria-label={`Recent colour ${h}`}
                    onClick={() => {
                        pick(h);
                        setTab("custom");
                    }}
                    className="size-[22px] rounded-md border border-foreground/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ background: h }}
                />
            ))}
        </div>
    );

    return (
        <Popover open={open} onOpenChange={openWith}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-colour-custom=""
                    aria-pressed={value !== null}
                    className={cn(
                        "flex w-[52px] flex-col items-center gap-1 rounded-lg text-[11px] tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    <span
                        aria-hidden
                        className={cn(
                            "grid size-10 place-items-center rounded-lg border bg-card",
                            value &&
                                "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                        )}
                        style={value ? { background: value } : undefined}
                    >
                        {value ? null : <Plus className="size-4" />}
                    </span>
                    Custom
                </button>
            </PopoverTrigger>
            <PopoverContent
                side={side}
                align={side === "left" ? "center" : "start"}
                sideOffset={8}
                collisionPadding={12}
                aria-label="Button colour"
                data-button-colour=""
                // Never past the screen: the body scrolls, the actions stay.
                className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-24px)] flex-col gap-3 overflow-hidden p-0"
            >
                <div className="flex shrink-0 items-center gap-2 pl-3.5 pr-2 pt-2">
                    <p className="flex-1 text-sm font-semibold">
                        Button colour
                    </p>
                    <IconButton
                        label="Close"
                        icon={<X />}
                        tooltip={false}
                        className="size-8"
                        onClick={() => setOpen(false)}
                    />
                </div>
                <div className="shrink-0 px-3.5">
                    <Segmented<"site" | "custom">
                        label="Colours"
                        block
                        size="sm"
                        value={tab}
                        onValueChange={setTab}
                        options={[
                            { value: "site", label: "Site colours" },
                            { value: "custom", label: "Custom" },
                        ]}
                    />
                </div>

                {tab === "site" ? (
                    <div
                        data-picker-body=""
                        className="grid min-h-0 gap-3 overflow-y-auto px-3.5 pb-3"
                    >
                        <div className="grid gap-0.5">
                            {roles.map((r) => (
                                <button
                                    key={r.value}
                                    type="button"
                                    aria-pressed={role === r.value}
                                    data-role-row={r.value}
                                    onClick={() => {
                                        onRole(r.value);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "flex min-h-9 items-center gap-2.5 rounded-md px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11",
                                        role === r.value
                                            ? "bg-muted font-semibold"
                                            : "hover:bg-muted",
                                    )}
                                >
                                    <span
                                        aria-hidden
                                        className="size-[22px] shrink-0 rounded-md border border-foreground/15"
                                        style={{
                                            background: r.hex ?? undefined,
                                        }}
                                    />
                                    {r.label}
                                    <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">
                                        {r.hex?.slice(1)}
                                    </span>
                                </button>
                            ))}
                        </div>
                        {recentRow}
                    </div>
                ) : (
                    <>
                        <div
                            data-picker-body=""
                            className="grid min-h-0 gap-3 overflow-y-auto px-3.5"
                        >
                            <div
                                ref={square}
                                role="slider"
                                tabIndex={0}
                                aria-label="Saturation and brightness"
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(hsv.s * 100)}
                                aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
                                data-colour-square=""
                                onPointerDown={(e) => {
                                    e.currentTarget.setPointerCapture(
                                        e.pointerId,
                                    );
                                    fromPointer(e);
                                }}
                                onPointerMove={(e) => {
                                    if (e.buttons === 1) fromPointer(e);
                                }}
                                onKeyDown={onSquareKey}
                                className="relative h-[150px] touch-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                style={{
                                    background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
                                }}
                            >
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
                                    style={{
                                        left: `${hsv.s * 100}%`,
                                        top: `${(1 - hsv.v) * 100}%`,
                                    }}
                                />
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={359}
                                value={Math.round(hue)}
                                aria-label="Hue"
                                data-colour-hue=""
                                onChange={(e) =>
                                    pickHsv({
                                        h: Number(e.target.value),
                                        s: hsv.s,
                                        v: hsv.v,
                                    })
                                }
                                className="h-3 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
                                style={{
                                    background:
                                        "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
                                }}
                            />
                            <div className="flex items-center gap-1.5">
                                <Label
                                    htmlFor={`${id}-hex`}
                                    className="text-xs text-muted-foreground"
                                >
                                    Hex
                                </Label>
                                <Input
                                    id={`${id}-hex`}
                                    dense
                                    value={typed}
                                    onChange={(e) => pick(e.target.value)}
                                    aria-invalid={!hex}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 font-mono uppercase"
                                />
                                {eyeDropper() ? (
                                    <IconButton
                                        label="Pick a colour from the page"
                                        icon={<Pipette />}
                                        variant="outline"
                                        className="size-8 shrink-0 coarse:size-11"
                                        onClick={async () => {
                                            try {
                                                const got =
                                                    await eyeDropper()?.open();
                                                if (got) pick(got.sRGBHex);
                                            } catch {
                                                // Esc: nothing picked.
                                            }
                                        }}
                                    />
                                ) : null}
                            </div>
                            {hex && whiteReads ? (
                                <ReadableLine
                                    ratio={words.ratio}
                                    light
                                    className=""
                                />
                            ) : null}
                            {hex && words && !whiteReads ? (
                                <div
                                    role="alert"
                                    className="grid gap-2 rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
                                >
                                    <span>
                                        <b>
                                            White words on this colour are hard
                                            to read
                                        </b>{" "}
                                        (
                                        {contrastRatio("#FFFFFF", hex).toFixed(
                                            1,
                                        )}{" "}
                                        : 1, it needs 4.5 : 1). Pick one:
                                    </span>
                                    {words.words === "dark" &&
                                    words.readable ? (
                                        <FixRow
                                            on={fix === "dark"}
                                            onClick={() => setFix("dark")}
                                            fill={hex}
                                            ink={words.ink}
                                            text="Keep the colour, dark words"
                                            ratio={words.ratio}
                                        />
                                    ) : null}
                                    {shade ? (
                                        <FixRow
                                            on={fix === "darken"}
                                            onClick={() => setFix("darken")}
                                            fill={shade}
                                            ink="#FFFFFF"
                                            text={`Darken it to ${shade}`}
                                            ratio={
                                                customColourWords(shade).ratio
                                            }
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                            {recentRow}
                        </div>
                        <div
                            data-picker-actions=""
                            className="flex shrink-0 justify-end gap-2 border-t px-3.5 py-2.5"
                        >
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={!canUse}
                                onClick={use}
                            >
                                Use this colour
                            </Button>
                        </div>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}

function FixRow({
    on,
    onClick,
    fill,
    ink,
    text,
    ratio,
}: {
    on: boolean;
    onClick: () => void;
    fill: string;
    ink: string;
    text: string;
    ratio: number;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={cn(
                "flex min-h-11 w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5 text-left text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on && "border-foreground ring-1 ring-foreground",
            )}
        >
            <span
                aria-hidden
                className="inline-flex h-6 w-12 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{ background: fill, color: ink }}
            >
                Book
            </span>
            {text}
            <span className="ml-auto whitespace-nowrap text-xs font-semibold text-success">
                {ratio.toFixed(1)} : 1
            </span>
        </button>
    );
}
