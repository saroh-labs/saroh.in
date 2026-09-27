"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    Eye,
    Link2,
    MessageSquare,
    Monitor,
    Smartphone,
    Tablet,
} from "lucide-react";

import { OptionSelect } from "@/components/shared/option-select";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Device, Zoom } from "@/components/sites/editor-constants";
import { DEVICES, ZOOMS } from "@/components/sites/editor-constants";

/** What the bar's right-hand side can do: how the page is shown, and publish. */
export interface TopBarActionProps {
    device: Device;
    setDevice: (next: Device) => void;
    zoom: Zoom;
    setZoom: (next: Zoom) => void;
    previewing: boolean;
    setPreviewing: (on: boolean) => void;
    asking: boolean;
    inReview: boolean;
    askForReview: () => void;
    publishing: boolean;
    publishDisabled: boolean;
    publishHint: string | undefined;
    flagCount: number;
    onPublish: () => void;
    /**
     * Narrow (G4): the inspector is out of sight until a block is chosen, so
     * Feedback — the whole site's review — gets its own way in.
     */
    onFeedback?: () => void;
    openNotes: number;
}

const ACTION =
    "h-[34px] gap-[7px] rounded-[9px] px-3 text-[0.78125rem] font-semibold text-muted-foreground";

/**
 * The bar's actions: theme, width, zoom and Preview, then Share for review and
 * Publish. Moved out of `editor-top-bar.tsx` (G4) so a phone can show the same
 * controls in its menu, `stacked`, with every target sized for a thumb.
 */
export function TopBarActions({
    stacked = false,
    ...p
}: TopBarActionProps & { stacked?: boolean }) {
    const touch = stacked && "h-11 w-full justify-start";
    return (
        <div
            className={
                stacked
                    ? "flex flex-col gap-2"
                    : "ml-auto flex shrink-0 items-center gap-2"
            }
        >
            <div
                className={cn(
                    "flex items-center gap-2",
                    stacked && "flex-wrap",
                )}
            >
                <ThemeToggle />
                {/*
                 * Width only — the preview is already local, and
                 * switching must not become a re-fetch.
                 */}
                <div
                    role="group"
                    aria-label="Preview width"
                    className="flex h-8 items-center gap-0.5 rounded-md border p-0.5 coarse:h-11"
                >
                    {DEVICES.map((d) => {
                        const Icon =
                            d.key === "phone"
                                ? Smartphone
                                : d.key === "tablet"
                                  ? Tablet
                                  : Monitor;
                        return (
                            <button
                                key={d.key}
                                type="button"
                                onClick={() => p.setDevice(d.key)}
                                aria-pressed={p.device === d.key}
                                aria-label={`Show at ${d.label.toLowerCase()} width`}
                                title={d.label}
                                className={cn(
                                    "flex h-full w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:w-11",
                                    p.device === d.key
                                        ? "bg-secondary text-foreground"
                                        : "text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <Icon aria-hidden className="size-4" />
                            </button>
                        );
                    })}
                </div>

                {/*
                 * The zoom readout IS the control (spec §2): no ⌘scroll,
                 * no pinch, no shortcut.
                 */}
                <OptionSelect
                    aria-label="Zoom"
                    size="sm"
                    value={String(p.zoom)}
                    onValueChange={(v) => {
                        p.setZoom(v === "fit" ? "fit" : (Number(v) as Zoom));
                    }}
                    options={ZOOMS.map((z) => ({
                        value: String(z),
                        label: z === "fit" ? "Fit" : `${z}%`,
                    }))}
                    className="h-8 w-[4.75rem] tabular-nums text-muted-foreground coarse:h-11"
                />
            </div>

            {/*
             * Preview removes the editing tools from the same canvas;
             * it does not switch to another renderer (G5). While it is
             * on, the button says where it goes back to, as the design
             * does, and Escape returns too.
             */}
            <Button
                variant="outline"
                size="sm"
                aria-pressed={p.previewing}
                className={cn(ACTION, p.previewing && "bg-secondary", touch)}
                onClick={() => p.setPreviewing(!p.previewing)}
            >
                <Eye aria-hidden className="size-[15px]" />
                {p.previewing ? "Editing" : "Preview"}
            </Button>

            {p.onFeedback ? (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(ACTION, touch)}
                    onClick={p.onFeedback}
                >
                    <MessageSquare aria-hidden className="size-[15px]" />
                    Feedback
                    {p.openNotes > 0 ? (
                        <span className="tabular-nums text-highlight">
                            {p.openNotes}
                        </span>
                    ) : null}
                </Button>
            ) : null}

            {/*
             * Style is the rail's Brand tab now (G2), as the design
             * draws it, so the bar no longer carries a button for it.
             */}
            <Button
                variant="outline"
                size="sm"
                className={cn(ACTION, touch)}
                disabled={p.asking || p.inReview}
                onClick={p.askForReview}
            >
                <Link2 aria-hidden className="size-[15px]" />
                {p.inReview ? "In review" : "Share for review"}
            </Button>

            {/*
             * The one action that puts the site in front of the
             * public. Not disabled while In review: publishing then
             * is allowed and recorded as a bypass (#278, DEC-047).
             * Its title says what it puts live (G2). Unlike the
             * design it stays pressable when nothing has changed:
             * publishing again is how a new version is made.
             */}
            <Button
                size="sm"
                className={cn(
                    "wk-press h-[34px] rounded-[9px] px-3.5 text-[0.78125rem] font-semibold",
                    stacked && "h-11 w-full",
                )}
                title={p.publishHint}
                onClick={p.onPublish}
                disabled={p.publishDisabled}
            >
                {p.publishing ? "Publishing…" : "Publish"}
                {/*
                 * The outstanding flag count as a badge, so the
                 * button keeps its width while the number moves.
                 */}
                {!p.publishing && p.flagCount > 0 ? (
                    <span className="ml-1.5 rounded bg-background/20 px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none">
                        {p.flagCount}
                    </span>
                ) : null}
            </Button>
            {/* A phone has no hover, so what Publish puts live is written out. */}
            {stacked && p.publishHint ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {p.publishHint}
                </p>
            ) : null}
        </div>
    );
}
