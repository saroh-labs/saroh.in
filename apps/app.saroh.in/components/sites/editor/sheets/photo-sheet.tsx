"use client";

import { Button } from "@saroh/ui/button";
import { FailedState, LoadingState } from "@saroh/ui/data-state";
import { FormSheet, FormSheetBody, FormSheetFoot } from "@saroh/ui/form-sheet";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { Segmented } from "@saroh/ui/segmented";
import { Textarea } from "@saroh/ui/textarea";
import { Check, Upload } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";

import type { PickedImage } from "@/components/shared/fields/media-picker";
import { useImageUpload } from "@/components/shared/fields/media-picker";
import { Refusal } from "@/components/shared/states/refusal";
import { DESCRIBE_MAX } from "@/components/sites/publish/describe-photo-dialog";
import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { listLibrary } from "@/lib/media/actions";
import type { LibraryItem } from "@/lib/media/service";

import { SECTION_LABELS, sectionTitle } from "../editor-constants";
import type { EditorModel } from "../shell/editor-model";

/** The section image being replaced: which section, and which field. */
export interface PhotoTarget {
    /** The section's index on the open page. */
    index: number;
    /** The image field in the section's content, as the contract names it. */
    field: string;
}

export interface PhotoSheetProps {
    model: EditorModel;
    /** What is being replaced; null: the sheet is closed. */
    target: PhotoTarget | null;
    onClose: () => void;
}

/** The photo the section shows, as the contract stores it. */
interface Photo {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
    focus?: { x: number; y: number };
}

/** The photo chosen in the sheet, before Use this photo. */
interface Chosen {
    src: string;
    filename: string;
    width?: number;
    height?: number;
}

const CENTRE = { x: 50, y: 50 };

/** The crop each screen draws a wide photo at (the hero's shapes). */
const SHAPES = { desk: "aspect-video", phone: "aspect-[4/5]" } as const;

/** "1920 × 1280 · Large, sharp on every screen", from the natural size. */
export function sizeLine(width?: number, height?: number): string {
    if (!width || !height) return "";
    const size =
        width >= 1600
            ? "Large, sharp on every screen"
            : width >= 1000
              ? "Medium, sharp on a phone and most screens"
              : "Small, may look soft on a wide screen";
    return `${width} × ${height} · ${size}`;
}

/** The file's own name from its address, for a photo the library didn't name. */
function nameOf(src: string): string {
    return decodeURIComponent(src.split("?")[0]?.split("/").pop() ?? src);
}

/**
 * Replace a section's photo (U46d, `fix/WXKMedia`): the business's photos
 * with a search and Upload, the focus point that stays in view on Desk and
 * Phone (the image's `focus`), and Describe the photo (its `alt`). Use this
 * photo writes the section's draft, so it waits for Publish like any edit.
 * Folders, From Instagram and where else the photo is used wait for the
 * media library's tags (batch 5). A reader never opens it.
 */
export function PhotoSheet({ model, target, onClose }: PhotoSheetProps) {
    const [opened, setOpened] = useState(0);
    const [seen, setSeen] = useState<PhotoTarget | null>(null);
    if (target !== seen) {
        setSeen(target);
        if (target) setOpened((n) => n + 1);
    }
    const section = target ? model.draft.sections[target.index] : undefined;
    const open = Boolean(target && section && !model.readOnly);
    const where = section
        ? `${model.page?.title ?? "This page"} · ${sectionTitle(section)}`
        : "";
    const isTop = section?.type === "hero";

    return (
        <FormSheet
            open={open}
            wide
            title={isTop ? "Replace the top photo" : "Replace the photo"}
            description={where}
            onClose={onClose}
        >
            {open && target && section ? (
                <PhotoDraft
                    key={opened}
                    current={
                        (section.content as Record<string, unknown>)[
                            target.field
                        ] as Photo | undefined
                    }
                    cropFor={
                        isTop
                            ? "the top of the page"
                            : `this ${SECTION_LABELS[section.type].toLowerCase()} section`
                    }
                    onUse={(photo) => {
                        model.draft.replaceAt(target.index, {
                            ...section,
                            content: {
                                ...(section.content as Record<string, unknown>),
                                [target.field]: photo,
                            },
                        } as typeof section);
                        onClose();
                    }}
                />
            ) : null}
        </FormSheet>
    );
}

function PhotoDraft({
    current,
    cropFor,
    onUse,
}: {
    current: Photo | undefined;
    /** "the top of the page": where the crop is for. */
    cropFor: string;
    onUse: (photo: Photo) => void;
}) {
    const [chosen, setChosen] = useState<Chosen | null>(
        current ? { ...current, filename: nameOf(current.src) } : null,
    );
    const [alt, setAlt] = useState(current?.alt ?? "");
    const [focus, setFocus] = useState(current?.focus ?? CENTRE);
    const [screen, setScreen] = useState<keyof typeof SHAPES>("desk");
    const [query, setQuery] = useState("");
    const [library, setLibrary] = useState<LibraryItem[] | null | "loading">(
        "loading",
    );
    const [attempt, setAttempt] = useState(0);
    const [file, setFile] = useState("");
    const input = useRef<HTMLInputElement>(null);
    const ids = useId();
    const { upload, busy, progress, error } = useImageUpload();

    useEffect(() => {
        let live = true;
        void listLibrary().then((items) => {
            if (live) setLibrary(items);
        });
        return () => {
            live = false;
        };
    }, [attempt]);

    /** A different photo starts its own description and focus point. */
    function choose(next: Chosen) {
        setChosen(next);
        const kept = next.src === current?.src ? current : undefined;
        setAlt(kept?.alt ?? "");
        setFocus(kept?.focus ?? CENTRE);
    }

    async function onFile(picked: File) {
        setFile(picked.name);
        const img: PickedImage | null = await upload(picked);
        if (input.current) input.current.value = "";
        if (!img) return;
        choose({
            src: img.src,
            filename: img.filename ?? picked.name,
            width: img.width,
            height: img.height,
        });
        setLibrary((list) =>
            Array.isArray(list) && img.mediaId
                ? [
                      {
                          id: img.mediaId,
                          filename: img.filename ?? picked.name,
                          contentType: picked.type,
                          status: "READY",
                          url: img.src,
                          createdAt: new Date().toISOString(),
                      },
                      ...list,
                  ]
                : list,
        );
    }

    const q = query.trim().toLowerCase();
    const items = Array.isArray(library)
        ? library.filter((m) => m.filename.toLowerCase().includes(q))
        : [];

    return (
        <>
            <FormSheetBody className="gap-5">
                <section aria-label="All media" className="grid gap-2.5">
                    <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                            <ListSearch
                                placeholder="Search your photos"
                                describe="By the file's name"
                                onSearch={setQuery}
                            />
                        </div>
                        <input
                            ref={input}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden="true"
                            onChange={(e) => {
                                const f = e.target.files?.item(0);
                                if (f) void onFile(f);
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            busy={busy}
                            busyLabel={
                                progress === null
                                    ? "Uploading…"
                                    : `Uploading ${progress}%`
                            }
                            onClick={() => input.current?.click()}
                        >
                            <Upload aria-hidden className="mr-1.5 size-4" />
                            Upload
                        </Button>
                    </div>
                    {/* The file's name, then why (the limit is the API's). */}
                    <Refusal>{error ? `${file}: ${error}` : null}</Refusal>
                    {library === "loading" ? (
                        <LoadingState rows={2} label="Loading your photos" />
                    ) : library === null ? (
                        <FailedState
                            size="panel"
                            title="Your photos couldn’t be read"
                            onRetry={() => {
                                setLibrary("loading");
                                setAttempt((n) => n + 1);
                            }}
                        />
                    ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {q
                                ? `No photos match “${query.trim()}”.`
                                : "No photos yet. Upload one from this device."}
                        </p>
                    ) : (
                        <div
                            data-photo-library=""
                            className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1"
                        >
                            {items.map((m) => {
                                const on = chosen?.src === m.url;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() =>
                                            m.url &&
                                            choose({
                                                src: m.url,
                                                filename: m.filename,
                                            })
                                        }
                                        className={cn(
                                            "grid min-w-0 gap-1 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            on &&
                                                "bg-muted ring-2 ring-foreground",
                                        )}
                                    >
                                        <span className="relative block aspect-square overflow-hidden rounded-md bg-muted">
                                            {/* eslint-disable-next-line @next/next/no-img-element -- a merchant's photo address, not a project asset */}
                                            <img
                                                src={m.url ?? ""}
                                                alt=""
                                                loading="lazy"
                                                className="size-full object-cover"
                                            />
                                            {on ? (
                                                <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-foreground text-background">
                                                    <Check
                                                        aria-hidden
                                                        className="size-3"
                                                    />
                                                </span>
                                            ) : null}
                                        </span>
                                        <span
                                            data-ph-mask=""
                                            className="truncate text-xs font-medium"
                                        >
                                            {m.filename}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                {chosen ? (
                    <>
                        <section className="grid gap-2">
                            <div className="flex items-center gap-2">
                                <span className="flex-1 text-sm font-medium">
                                    Crop for {cropFor}
                                </span>
                                <Segmented
                                    label="Crop for"
                                    value={screen}
                                    onValueChange={setScreen}
                                    options={[
                                        { value: "desk", label: "Desk" },
                                        { value: "phone", label: "Phone" },
                                    ]}
                                />
                            </div>
                            <FocusPicker
                                src={chosen.src}
                                focus={focus}
                                onFocus={setFocus}
                                onSize={(width, height) =>
                                    setChosen((c) =>
                                        c && !c.width
                                            ? { ...c, width, height }
                                            : c,
                                    )
                                }
                            />
                            <div
                                data-photo-crop={screen}
                                className={cn(
                                    "mx-auto w-full overflow-hidden rounded-md border bg-muted",
                                    SHAPES[screen],
                                    screen === "phone"
                                        ? "max-w-40"
                                        : "max-w-72",
                                )}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element -- a merchant's photo address, not a project asset */}
                                <img
                                    src={chosen.src}
                                    alt=""
                                    className="size-full object-cover"
                                    style={{
                                        objectPosition: `${focus.x}% ${focus.y}%`,
                                    }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Drag the dot to the part that matters. On any
                                screen it stays in view.
                            </p>
                        </section>

                        <section className="grid gap-1.5">
                            <Label htmlFor={`${ids}-alt`}>
                                Describe the photo
                            </Label>
                            <Textarea
                                id={`${ids}-alt`}
                                value={alt}
                                rows={2}
                                maxLength={DESCRIBE_MAX}
                                placeholder="Bride in a red lehenga, at the salon"
                                onChange={(e) => setAlt(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Read aloud to people who can’t see the photo,
                                and used by Google. You can use the photo now
                                and change this later.
                            </p>
                        </section>
                    </>
                ) : null}
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Use this photo"
                saveOff={!chosen || busy}
                note={
                    chosen ? (
                        <span data-ph-mask="" data-photo-size="">
                            {[
                                chosen.filename,
                                sizeLine(chosen.width, chosen.height),
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    ) : (
                        SAVE_LINES["waits-for-publish"]
                    )
                }
                onSubmit={(e) => {
                    e.preventDefault();
                    if (!chosen) return;
                    const moved = focus.x !== CENTRE.x || focus.y !== CENTRE.y;
                    onUse({
                        src: chosen.src,
                        alt: alt.trim(),
                        ...(chosen.width
                            ? { width: chosen.width, height: chosen.height }
                            : {}),
                        // Centred is the default: leave it out, as before.
                        ...(moved ? { focus } : {}),
                    });
                }}
            />
        </>
    );
}

const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)));

/**
 * The whole photo with its focus point: drag or tap the dot, or move it
 * with the arrow keys, 5% a press.
 */
function FocusPicker({
    src,
    focus,
    onFocus,
    onSize,
}: {
    src: string;
    focus: { x: number; y: number };
    onFocus: (next: { x: number; y: number }) => void;
    onSize: (width: number, height: number) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);

    function at(e: PointerEvent<HTMLDivElement>) {
        const r = box.current?.getBoundingClientRect();
        if (!r?.width || !r.height) return;
        onFocus({
            x: clamp(((e.clientX - r.left) / r.width) * 100),
            y: clamp(((e.clientY - r.top) / r.height) * 100),
        });
    }

    function onKey(e: KeyboardEvent<HTMLDivElement>) {
        const step: Record<string, [number, number]> = {
            ArrowLeft: [-5, 0],
            ArrowRight: [5, 0],
            ArrowUp: [0, -5],
            ArrowDown: [0, 5],
        };
        const d = step[e.key] as [number, number] | undefined;
        if (!d) return;
        e.preventDefault();
        onFocus({ x: clamp(focus.x + d[0]), y: clamp(focus.y + d[1]) });
    }

    return (
        <div
            ref={box}
            role="slider"
            tabIndex={0}
            aria-label="Focus point"
            aria-valuetext={`${focus.x}% from the left, ${focus.y}% from the top`}
            aria-valuenow={focus.x}
            aria-valuemin={0}
            aria-valuemax={100}
            data-focus-point={`${focus.x},${focus.y}`}
            onKeyDown={onKey}
            onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                at(e);
            }}
            onPointerMove={(e) => dragging.current && at(e)}
            onPointerUp={() => {
                dragging.current = false;
            }}
            className="relative mx-auto w-fit cursor-crosshair touch-none select-none overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- a merchant's photo address, not a project asset */}
            <img
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) =>
                    onSize(
                        e.currentTarget.naturalWidth,
                        e.currentTarget.naturalHeight,
                    )
                }
                className="block max-h-56 w-auto max-w-full"
            />
            <span
                aria-hidden="true"
                className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground/80 shadow"
                style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
            />
        </div>
    );
}
