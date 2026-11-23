"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { Segmented } from "@saroh/ui/segmented";
import { Switch } from "@saroh/ui/switch";
import {
    ArrowLeftRight,
    ChevronLeft,
    Monitor,
    Share2,
    Smartphone,
    Tablet,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { DeviceFrame } from "@/components/sites/canvas/device-frame";
import { DraftPreview } from "@/components/sites/canvas/section-preview";
import { count } from "@/lib/format/plural";

import type { EditorModel } from "../shell/editor-model";
import { useOpenPage } from "../use-editor-selection";

/**
 * Whether the three-size preview is built (U46f). The shell draws
 * `PreviewFrames` in the canvas's place while previewing.
 */
export const PREVIEW_FRAMES_READY = true as boolean;

export interface PreviewFramesProps {
    model: EditorModel;
    /** Back to editing, with the same selection (Esc too). */
    onBack: () => void;
}

type Size = "desktop" | "tablet" | "phone";
type Mode = "all" | Size;

/** The widths each frame lays the page out at (`fix/WXMPreview`). */
export const FRAME_WIDTH: Record<Size, number> = {
    desktop: 1440,
    tablet: 768,
    phone: 390,
};
const SIZES: Size[] = ["desktop", "tablet", "phone"];
const LABEL: Record<Size, string> = {
    desktop: "Desktop",
    tablet: "Tablet",
    phone: "Phone",
};
const GAP = 40;
const PAD_X = 32;
/** The scroller's border, one px each side. */
const BORDER = 2;
/** The board draws the page at 0.7; never larger than the page itself. */
const MAX_SCALE = 1;

/**
 * The scale that fits `widths` side by side in `room` px, gaps and padding
 * taken off first. Pure, for the test.
 */
export function fitScale(widths: number[], room: number): number {
    const total = widths.reduce((a, b) => a + b, 0);
    const free =
        room - PAD_X * 2 - GAP * (widths.length - 1) - BORDER * widths.length;
    if (total <= 0 || free <= 0) return 0.25;
    return Math.max(0.25, Math.min(MAX_SCALE, free / total));
}

/**
 * A page laid out at `width` px (in a frame of its own, so the blocks'
 * breakpoints read that width, as `DeviceFrame` explains) and drawn at
 * `scale`. The box takes the scaled size, so it scrolls and lines up as
 * the scaled page. Also History's Compare (U46b).
 */
export function ScaledPage({
    width,
    scale,
    title,
    children,
}: {
    width: number;
    scale: number;
    /** Names the frame for a screen reader. */
    title: string;
    children: ReactNode;
}) {
    // `zoom`, not `transform: scale`: the page is laid out and painted at
    // the smaller size, so text stays sharp at any scale (a scaled bitmap
    // blurs), and the box takes the zoomed size itself, so no measuring.
    return (
        <div
            className="relative overflow-hidden"
            style={{ width: width * scale }}
        >
            <div style={{ width, zoom: scale }}>
                <DeviceFrame title={title}>{children}</DeviceFrame>
            </div>
        </div>
    );
}

/**
 * Preview at three sizes (U46f, `fix/WXMPreview`): the draft as visitors
 * will see it at desktop, tablet and phone width side by side, or one of
 * them; Scroll together keeps the three at the same place on the page; and
 * Share a test link makes one (DEC-071), as More does. Over the whole
 * editor, with its own bar; Back to editing (or Esc, the viewport's) puts
 * the editor back as it was, selection and all, since nothing under it
 * unmounts. On a phone, the phone width only.
 *
 * It is today's Preview with more frames: the same renderer, links that
 * open the site's pages, and forms that say they were not sent.
 */
export function PreviewFrames({ model, onBack }: PreviewFramesProps) {
    const phone = model.layout === "phone";
    const [mode, setMode] = useState<Mode>(phone ? "phone" : "all");
    const [together, setTogether] = useState(true);
    const stage = useRef<HTMLDivElement>(null);
    const [room, setRoom] = useState({ width: 1600, height: 900 });
    const scrollers = useRef<(HTMLDivElement | null)[]>([]);
    // Where a frame was put by Scroll together, so its own scroll event
    // is not taken for the merchant scrolling it.
    const placed = useRef<(number | undefined)[]>([]);

    useEffect(() => {
        const el = stage.current;
        if (!el) return;
        const measure = () =>
            setRoom({ width: el.clientWidth, height: el.clientHeight });
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const watch = new ResizeObserver(measure);
        watch.observe(el);
        return () => watch.disconnect();
    }, []);

    const openPage = useOpenPage({
        siteId: model.siteId,
        pageId: model.pageId,
        dirty: model.unsaved,
        onSamePage: () => undefined,
    });

    const shown = mode === "all" ? SIZES : [mode];
    const scale = fitScale(
        shown.map((s) => FRAME_WIDTH[s]),
        room.width,
    );

    function onScroll(index: number) {
        const el = scrollers.current[index];
        if (!el) return;
        const was = placed.current[index];
        placed.current[index] = undefined;
        if (was !== undefined && Math.abs(el.scrollTop - was) < 2) return;
        if (!together) return;
        const ratio =
            el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
        scrollers.current.forEach((other, j) => {
            if (!other || j === index) return;
            const top = ratio * (other.scrollHeight - other.clientHeight);
            if (Math.abs(other.scrollTop - top) < 2) return;
            placed.current[j] = top;
            other.scrollTop = top;
        });
    }

    const waiting = model.status.waiting;
    const line = model.publish.neverPublished
        ? "the draft, not live yet"
        : waiting > 0
          ? `the draft, with ${count(waiting, "change")} not yet live`
          : "the draft, the same as what is live";
    const releases = model.releases;
    const canShare =
        !model.readOnly && releases.available && releases.abilities.canUpdate;
    const style = model.siteStyle.trying ?? model.siteStyle.style;

    return (
        <div
            role="region"
            aria-label="Preview"
            data-preview-frames={mode}
            className="fixed inset-0 z-40 flex flex-col bg-background"
        >
            <header className="flex min-h-[60px] shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b bg-background py-2 pl-3 pr-3.5">
                <Button
                    type="button"
                    className="h-10 shrink-0 rounded-[9px]"
                    onClick={onBack}
                >
                    <ChevronLeft aria-hidden className="size-4" />
                    Back to editing
                </Button>
                <span aria-hidden className="mx-1 h-6 w-px bg-border" />
                <span
                    aria-hidden
                    className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-muted font-serif text-sm font-semibold"
                >
                    {model.siteName.trim().charAt(0).toUpperCase()}
                </span>
                <h2 className="text-base font-semibold">Preview</h2>
                <span className="min-w-0 truncate text-[0.8125rem] text-muted-foreground">
                    {model.page?.title ?? "Page"} · {line}
                </span>
                <span className="flex-1" />
                {phone ? null : (
                    <Segmented<Mode>
                        label="Sizes"
                        size="md"
                        value={mode}
                        onValueChange={setMode}
                        options={[
                            { value: "all", label: "All three" },
                            {
                                value: "desktop",
                                label: "Desktop",
                                icon: <Monitor aria-hidden />,
                            },
                            {
                                value: "tablet",
                                label: "Tablet",
                                icon: <Tablet aria-hidden />,
                            },
                            {
                                value: "phone",
                                label: "Phone",
                                icon: <Smartphone aria-hidden />,
                            },
                        ]}
                    />
                )}
                {shown.length > 1 ? (
                    <span className="mx-2 flex shrink-0 items-center gap-2">
                        <ArrowLeftRight aria-hidden className="size-4" />
                        <Label
                            htmlFor="preview-scroll-together"
                            className="text-[0.8125rem] font-normal"
                        >
                            Scroll together
                        </Label>
                        <Switch
                            id="preview-scroll-together"
                            aria-label="Scroll together"
                            checked={together}
                            onCheckedChange={setTogether}
                        />
                    </span>
                ) : null}
                <span className="flex-1" />
                {canShare ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 rounded-[9px]"
                        onClick={() => releases.setMaking(true)}
                    >
                        <Share2 aria-hidden className="size-4" />
                        Share a test link
                    </Button>
                ) : null}
            </header>
            <div
                ref={stage}
                className="flex min-h-0 flex-1 items-start justify-center gap-10 overflow-x-auto bg-muted px-8 pt-5"
            >
                {shown.map((size, index) => (
                    <section
                        key={size}
                        aria-label={`${LABEL[size]} preview`}
                        data-preview-frame={size}
                        className="flex min-w-0 shrink-0 flex-col gap-2"
                    >
                        <h2 className="text-[0.8125rem] font-semibold">
                            {LABEL[size]}
                        </h2>
                        <div
                            ref={(el) => {
                                scrollers.current[index] = el;
                            }}
                            onScroll={() => onScroll(index)}
                            className="overflow-y-auto overflow-x-hidden rounded-lg border bg-card shadow-lg"
                            style={{
                                width: FRAME_WIDTH[size] * scale + BORDER,
                                height: Math.max(200, room.height - 48),
                            }}
                        >
                            <ScaledPage
                                width={FRAME_WIDTH[size]}
                                scale={scale}
                                title={`The page at ${size} width`}
                            >
                                <DraftPreview
                                    siteId={model.siteId}
                                    siteAddress={model.address}
                                    sections={model.draft.sections}
                                    pages={model.pages}
                                    page={model.page ?? null}
                                    style={style}
                                    styleOptions={model.styleOptions}
                                    chrome={model.canvasChrome}
                                    onOpenPage={openPage}
                                />
                            </ScaledPage>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
