"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { Segmented } from "@saroh/ui/segmented";
import { Minus, Monitor, Plus, Smartphone, Tablet } from "lucide-react";

import type { Device, Zoom } from "../editor-constants";
import { ZOOMS } from "../editor-constants";
import { PreviewLabel } from "./preview-label";

/** The desk's words for the three widths (RULES §1). */
const WIDTHS: { value: Device; label: string; icon: React.ReactNode }[] = [
    { value: "desktop", label: "Desk", icon: <Monitor /> },
    { value: "tablet", label: "Tablet", icon: <Tablet /> },
    { value: "phone", label: "Phone", icon: <Smartphone /> },
];

/** − and + step through the literal zooms; Fit sits between 75 and 100. */
const STEPS = [50, 75, 100] as const;
export function zoomStep(zoom: Zoom, d: 1 | -1): Zoom {
    if (zoom === "fit") return d < 0 ? 75 : 100;
    const at = STEPS.indexOf(zoom);
    return STEPS[Math.min(Math.max(at + d, 0), STEPS.length - 1)];
}

const zoomWord = (z: Zoom) => (z === "fit" ? "Fit" : `${z}%`);

/**
 * The line over the page (`fix/WXKRest`): where it will be and that it is
 * the draft, then the quick view controls the owner wants on screen, not in
 * More (21 Nov): Desk · Tablet · Phone and the zoom (− 100% +, the
 * percentage choosing 50, 75, 100 or Fit). Looking is allowed, so a
 * Reviewer has them too. The words fold to icons when the bar is narrow.
 */
export function CanvasBar({
    address,
    path,
    device,
    zoom,
    onDevice,
    onZoom,
    previewing = false,
}: {
    address: string | null;
    path: string;
    device: Device;
    zoom: Zoom;
    onDevice: (device: Device) => void;
    onZoom: (zoom: Zoom) => void;
    /** A custom colour is drawn on the page and not saved. */
    previewing?: boolean;
}) {
    const link = address ? `${address}${path === "/" ? "" : path}` : path;
    return (
        <div
            data-canvas-bar=""
            className="flex h-10 shrink-0 items-center gap-2.5 bg-muted px-4 text-xs text-muted-foreground [container-type:inline-size]"
        >
            <span
                aria-hidden
                className="size-[7px] shrink-0 rounded-full bg-muted-foreground/60"
            />
            <b className="min-w-0 truncate font-mono font-medium text-foreground">
                {link}
            </b>
            <span className="shrink-0 font-mono">Draft</span>
            <span className="flex-1" />
            {previewing ? <PreviewLabel /> : null}
            <Segmented<Device>
                label="Preview width"
                value={device}
                onValueChange={onDevice}
                options={WIDTHS.map((w) => ({
                    value: w.value,
                    icon: w.icon,
                    name: w.label,
                    label: (
                        <span className="hidden [@container(min-width:34rem)]:inline">
                            {w.label}
                        </span>
                    ),
                }))}
                className="shrink-0 flex-nowrap bg-background [&>button]:px-2"
            />
            <div
                role="group"
                aria-label="Zoom"
                className="flex shrink-0 items-center"
            >
                <IconButton
                    label="Zoom out"
                    icon={<Minus className="size-4" />}
                    disabled={zoom === 50}
                    onClick={() => onZoom(zoomStep(zoom, -1))}
                    className="size-7 coarse:size-11"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Zoom: ${zoomWord(zoom)}. Choose a zoom`}
                            className="h-7 min-w-12 px-1.5 text-xs tabular-nums coarse:h-11"
                        >
                            {zoomWord(zoom)}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuRadioGroup
                            value={String(zoom)}
                            onValueChange={(v) =>
                                onZoom(
                                    v === "fit" ? "fit" : (Number(v) as Zoom),
                                )
                            }
                        >
                            {ZOOMS.map((z) => (
                                <DropdownMenuRadioItem
                                    key={z}
                                    value={String(z)}
                                >
                                    {zoomWord(z)}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <IconButton
                    label="Zoom in"
                    icon={<Plus className="size-4" />}
                    disabled={zoom === 100}
                    onClick={() => onZoom(zoomStep(zoom, 1))}
                    className="size-7 coarse:size-11"
                />
            </div>
        </div>
    );
}
