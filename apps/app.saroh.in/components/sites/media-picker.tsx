"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ImagePlus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { completeUpload, createUpload } from "@/lib/media/actions";

/** What a picked image hands back — the shape the section contract accepts. */
export interface PickedImage {
    src: string;
    width?: number;
    height?: number;
    /** The file's size on disk, for the share-image limits (#220). */
    bytes?: number;
    /** The library object it became, for places that keep the link. */
    mediaId?: string;
    filename?: string;
    /** "video" for an MP4 or MOV picked where videos are allowed (#517). */
    kind?: "photo" | "video";
    /** A video's length in seconds, read on the device. */
    durationSec?: number;
    /** A video's poster: a frame uploaded as a photo, when one could be taken. */
    posterMediaId?: string;
    posterSrc?: string;
}

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

/**
 * Put a photograph on a site from the field it belongs to (#205).
 *
 * The editor used to ask for a URL where it should ask for a picture. The
 * merchant has the photo on their phone; there was no affordance anywhere for
 * the thing they actually wanted to do, so the widest gulf in the product sat
 * on its most visual feature.
 *
 * BROWSE IS THE CONTROL. Drag-and-drop is layered on top for a desk, but the
 * design's own §17 consequence is that it does not exist on a phone, so a drop
 * zone that was the only route would be a route two of the four scenes could
 * not take. The button is first-class; the drop is an accelerant.
 *
 * The three-step flow — mint a ticket, PUT the bytes, confirm — runs here
 * because the middle step has to. The presigned URL exists so the bytes go
 * from the browser to storage directly; the two API calls around it go through
 * server actions with the session forwarded. XMLHttpRequest rather than fetch
 * for the PUT, for one reason: fetch cannot report upload progress, and an
 * upload from a phone on a shop floor can take long enough that "is anything
 * happening?" is a real question.
 *
 * DIMENSIONS TRAVEL WITH THE PICTURE. The renderer takes width and height and
 * uses a plain <img> — deliberately, to stay clear of next/image's per-domain
 * allowlist for tenant origins — so without them the page reflows when the
 * image arrives. They are read from the file before the upload starts, so a
 * picked image never lands without them.
 */
/**
 * The upload itself — read the size, mint a ticket, PUT the bytes with
 * progress, confirm — for any control that takes a picture. `upload` hands
 * back the picture, or null having set `error` to say why not.
 */
export function useImageUpload(
    options: {
        /** The library bucket; site images unless said. */
        purpose?: "site-image" | "business-logo";
        /** What to say when storage cannot serve the upload. */
        unserved?: string;
        /**
         * Take an MP4 or MOV too (a product's videos, #517): it goes up under
         * the video purpose, with its length and a poster frame read on the
         * device first.
         */
        allowVideo?: boolean;
    } = {},
) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    /*
     * Whether the control is still on screen. An upload from a phone can
     * outlast the field that started it — the merchant picks another section
     * or leaves the panel — and a late finish must not hand a picture to a
     * field they have moved on from, or write state into a component that is
     * gone. The upload itself is left to finish; only what it would write
     * back is skipped. Set in the effect as well as the initialiser so a
     * remount in development's double-invoked effects starts true again.
     */
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    async function upload(file: File): Promise<PickedImage | null> {
        setError(null);
        const video = !!options.allowVideo && VIDEO_TYPES.has(file.type);
        if (!video && !file.type.startsWith("image/")) {
            setError(
                options.allowVideo
                    ? "That is not a photo or a video. Choose a JPG, PNG, WebP, MP4 or MOV."
                    : "That is not an image. Choose a JPG, PNG, WebP or GIF.",
            );
            return null;
        }
        setBusy(true);
        setProgress(0);
        if (video) {
            try {
                return await uploadVideo(file);
            } catch (e) {
                if (mounted.current) {
                    setError(
                        e instanceof Error && e.message
                            ? e.message
                            : "The upload did not go through. Try again.",
                    );
                }
                return null;
            } finally {
                if (mounted.current) {
                    setBusy(false);
                    setProgress(null);
                }
            }
        }
        try {
            // Dimensions first, from the bytes already on the device, so the
            // upload never has to be followed by a second round trip to ask
            // storage what it just received.
            const dims = await readDimensions(file);

            const ticket = await createUpload({
                contentType: file.type,
                contentLength: file.size,
                filename: file.name,
                ...(options.purpose ? { purpose: options.purpose } : {}),
            });
            if (!ticket.ok) {
                if (mounted.current) setError(ticket.error);
                return null;
            }

            await putWithProgress(
                ticket.data.uploadUrl,
                ticket.data.headers,
                file,
                (pct) => {
                    if (mounted.current) setProgress(pct);
                },
            );

            const done = await completeUpload(ticket.data.mediaId);
            // Past the last wait: nothing below may reach a control that has
            // gone.
            if (!mounted.current) return null;
            if (!done.ok) {
                setError(done.error);
                return null;
            }
            if (!done.data.url) {
                // The upload succeeded and nothing can serve it. Say that,
                // rather than writing a src nobody can fetch.
                setError(
                    options.unserved ??
                        "Uploaded, but storage is not set up to serve images yet. Paste an image address below instead.",
                );
                return null;
            }
            return {
                src: done.data.url,
                ...dims,
                bytes: file.size,
                mediaId: ticket.data.mediaId,
                filename: file.name,
            };
        } catch (e) {
            if (!mounted.current) return null;
            setError(
                e instanceof Error && e.message
                    ? e.message
                    : "The upload did not go through. Try again.",
            );
            return null;
        } finally {
            if (mounted.current) {
                setBusy(false);
                setProgress(null);
            }
        }
    }

    /**
     * A video: its length and a poster frame from the file on the device,
     * then the video itself (the progress bar follows it), then the poster
     * as a photo. A browser that can't draw a frame uploads no poster — the
     * product shows a plain video tile instead. Throws with the words to
     * show when the video can't go up.
     */
    const isMounted = () => mounted.current;

    async function uploadVideo(file: File): Promise<PickedImage | null> {
        const meta = await readVideo(file);
        const sent = await send(file, "product-video", (pct) => {
            if (mounted.current) setProgress(pct);
        });
        if (!isMounted()) return null;
        let poster: { mediaId: string; url: string } | null = null;
        if (meta.poster) {
            poster = await send(
                new File([meta.poster], `${file.name}-poster.jpg`, {
                    type: "image/jpeg",
                }),
                "site-image",
            ).catch(() => null);
        }
        // Read again: the poster's upload is one more wait.
        if (!isMounted()) return null;
        return {
            src: sent.url,
            ...(meta.width ? { width: meta.width, height: meta.height } : {}),
            bytes: file.size,
            mediaId: sent.mediaId,
            filename: file.name,
            kind: "video",
            ...(meta.durationSec != null
                ? { durationSec: meta.durationSec }
                : {}),
            ...(poster
                ? { posterMediaId: poster.mediaId, posterSrc: poster.url }
                : {}),
        };
    }

    /** Ticket, PUT, confirm — for one file. Throws with the words to show. */
    async function send(
        file: File,
        purpose: "site-image" | "product-video",
        onProgress?: (pct: number) => void,
    ): Promise<{ mediaId: string; url: string }> {
        const ticket = await createUpload({
            contentType: file.type,
            contentLength: file.size,
            filename: file.name,
            purpose,
        });
        if (!ticket.ok) throw new Error(ticket.error);
        await putWithProgress(
            ticket.data.uploadUrl,
            ticket.data.headers,
            file,
            onProgress ?? (() => undefined),
        );
        const done = await completeUpload(ticket.data.mediaId);
        if (!done.ok) throw new Error(done.error);
        if (!done.data.url) {
            throw new Error(
                options.unserved ??
                    "Uploaded, but storage is not set up to serve it yet.",
            );
        }
        return { mediaId: ticket.data.mediaId, url: done.data.url };
    }

    return { upload, busy, progress, error, setError };
}

/**
 * A video's length, size and a poster frame, from the file on the device. A
 * browser that can't open the file, or won't let a frame be drawn, still
 * uploads it — just without what it couldn't read.
 */
function readVideo(file: File): Promise<{
    durationSec: number | null;
    width?: number;
    height?: number;
    poster: Blob | null;
}> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        let settled = false;
        const finish = (out: {
            durationSec: number | null;
            width?: number;
            height?: number;
            poster: Blob | null;
        }) => {
            if (settled) return;
            settled = true;
            URL.revokeObjectURL(url);
            resolve(out);
        };
        const empty = { durationSec: null, poster: null };
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        video.onerror = () => finish(empty);
        // A file the browser can't decode must not hold the upload up.
        const timer = window.setTimeout(() => finish(empty), 8000);
        video.onloadedmetadata = () => {
            const durationSec = Number.isFinite(video.duration)
                ? Math.round(video.duration)
                : null;
            const size = {
                width: video.videoWidth || undefined,
                height: video.videoHeight || undefined,
            };
            video.onseeked = () => {
                window.clearTimeout(timer);
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                try {
                    canvas.getContext("2d")?.drawImage(video, 0, 0);
                    canvas.toBlob(
                        (blob) =>
                            finish({ durationSec, ...size, poster: blob }),
                        "image/jpeg",
                        0.85,
                    );
                } catch {
                    finish({ durationSec, ...size, poster: null });
                }
            };
            // A frame a little way in: the very first is often black.
            video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
        };
        video.src = url;
    });
}

export function MediaPicker({
    onPick,
    label = "Choose a photo",
    className,
    allowVideo = false,
    check,
}: {
    onPick: (image: PickedImage) => void;
    label?: string;
    className?: string;
    /** Take an MP4 or MOV as well (a product's videos). */
    allowVideo?: boolean;
    /** Why this file can't be added, before it is uploaded; "" when it can. */
    check?: (file: File) => string;
}) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const { upload, busy, progress, error, setError } = useImageUpload({
        allowVideo,
    });
    const [over, setOver] = useState(false);

    async function handleFile(file: File) {
        const problem = check?.(file) ?? "";
        if (problem) {
            setError(problem);
            if (inputRef.current) inputRef.current.value = "";
            return;
        }
        const picked = await upload(file);
        // Let the same file be chosen twice in a row — a retry after a
        // failure is the common case, and a file input ignores a repeat.
        if (inputRef.current) inputRef.current.value = "";
        if (picked) onPick(picked);
    }

    return (
        <div
            className={cn("grid gap-1.5", className)}
            onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                const file = e.dataTransfer.files.item(0);
                if (file) void handleFile(file);
            }}
        >
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={
                    allowVideo ? "image/*,video/mp4,video/quicktime" : "image/*"
                }
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                    const file = e.target.files?.item(0) ?? null;
                    if (file) void handleFile(file);
                }}
            />
            <div
                className={cn(
                    "flex items-center gap-2 rounded-md border border-dashed px-2.5 py-2 transition-colors",
                    // The same border as the fields around it, dashed because
                    // it is a place to drop something rather than type.
                    over ? "border-ring bg-accent" : "border-input",
                )}
            >
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                >
                    <ImagePlus className="mr-1.5 size-3.5" />
                    {busy
                        ? progress === null
                            ? "Working…"
                            : `Uploading ${progress}%`
                        : label}
                </Button>
                <span className="text-xs text-muted-foreground">
                    or drop one here
                </span>
            </div>
            {busy && progress !== null ? (
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    aria-label="Upload progress"
                    className="h-1 w-full overflow-hidden rounded bg-muted"
                >
                    <div
                        className="h-full bg-foreground transition-[width] duration-fast ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            ) : null}
            {error ? (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

/** Read a picture's natural size from the file on the device. */
function readDimensions(
    file: File,
): Promise<{ width?: number; height?: number }> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
        };
        // A picture the browser cannot decode still uploads; it just lands
        // without dimensions, which is what it would have done anyway.
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({});
        };
        img.src = url;
    });
}

/** PUT to the presigned URL, reporting progress as it goes. */
function putWithProgress(
    url: string,
    headers: Record<string, string>,
    file: File,
    onProgress: (pct: number) => void,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        for (const [k, v] of Object.entries(headers)) {
            // The browser sets Content-Length itself and refuses to let a page
            // set it; sending it anyway logs an error and changes nothing.
            if (k.toLowerCase() === "content-length") continue;
            xhr.setRequestHeader(k, v);
        }
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else
                reject(
                    new Error(
                        `Storage refused the upload (${xhr.status}). Try again in a moment.`,
                    ),
                );
        };
        xhr.onerror = () =>
            reject(
                new Error(
                    "Could not reach storage. Check the connection and try again.",
                ),
            );
        xhr.send(file);
    });
}
