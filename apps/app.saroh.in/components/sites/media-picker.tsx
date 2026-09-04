"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";

import { completeUpload, createUpload } from "@/lib/media/actions";

/** What a picked image hands back — the shape the section contract accepts. */
export interface PickedImage {
    src: string;
    width?: number;
    height?: number;
    /** The file's size on disk, for the share-image limits (#220). */
    bytes?: number;
}

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
export function MediaPicker({
    onPick,
    label = "Choose a photo",
    className,
}: {
    onPick: (image: PickedImage) => void;
    label?: string;
    className?: string;
}) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [over, setOver] = useState(false);

    async function handleFile(file: File) {
        setError(null);
        if (!file.type.startsWith("image/")) {
            setError("That is not an image. Choose a JPG, PNG, WebP or GIF.");
            return;
        }
        setBusy(true);
        setProgress(0);
        try {
            // Dimensions first, from the bytes already on the device, so the
            // upload never has to be followed by a second round trip to ask
            // storage what it just received.
            const dims = await readDimensions(file);

            const ticket = await createUpload({
                contentType: file.type,
                contentLength: file.size,
                filename: file.name,
            });
            if (!ticket.ok) {
                setError(ticket.error);
                return;
            }

            await putWithProgress(
                ticket.data.uploadUrl,
                ticket.data.headers,
                file,
                setProgress,
            );

            const done = await completeUpload(ticket.data.mediaId);
            if (!done.ok) {
                setError(done.error);
                return;
            }
            if (!done.data.url) {
                // The upload succeeded and nothing can serve it. Say that,
                // rather than writing a src nobody can fetch into the section.
                setError(
                    "Uploaded, but storage is not set up to serve images yet. Paste an image address below instead.",
                );
                return;
            }
            onPick({ src: done.data.url, ...dims, bytes: file.size });
        } catch (e) {
            setError(
                e instanceof Error && e.message
                    ? e.message
                    : "The upload did not go through. Try again.",
            );
        } finally {
            setBusy(false);
            setProgress(null);
            // Let the same file be chosen twice in a row — a retry after a
            // failure is the common case, and a file input ignores a repeat.
            if (inputRef.current) inputRef.current.value = "";
        }
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
                accept="image/*"
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
                    over ? "border-ring bg-accent" : "border-border",
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
                        className="h-full bg-foreground transition-[width] duration-150 ease-out"
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
