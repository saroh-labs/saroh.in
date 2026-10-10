"use client";

import { Button } from "@saroh/ui/button";
import { useEffect, useRef, useState } from "react";

import { useImageUpload } from "@/components/sites/media-picker";
import {
    LOGO_ACCEPT,
    logoFileProblem,
} from "@/lib/organizations/business-logo";

/** A logo as a form holds it: where it is served, and its library image. */
export interface LogoValue {
    url: string;
    /** Null for a logo that was only ever an address. */
    mediaId: string | null;
}

/**
 * A logo field, whole: the picture (or the name's initial in a dashed tile
 * when there is none), Upload or Replace, and Remove. For any form or
 * sheet that keeps a logo: the business's (Settings › Business › Logo) and
 * a location's own.
 *
 * It keeps no page state and saves nothing. Picking a file checks it (PNG,
 * JPG or WebP, 1 MB at most; the API holds the same rule), uploads it to
 * the library and hands the picture back through `onChange`; Remove hands
 * back `null`. The form that holds the value saves it with its own Save. A
 * wrong file or a failed upload is said under the field.
 *
 * A logo that stands in while there is none (a location's, which uses the
 * business's) is `standIn`: its picture is drawn where the initial would
 * be, and `removeLabel` says what Remove goes back to.
 */
export function LogoUpload({
    value,
    onChange,
    name,
    disabled = false,
    onBusy,
    purpose = "business-logo",
    hint = "Square, under 1 MB. PNG, JPG or WebP.",
    standIn = null,
    removeLabel = "Remove",
}: {
    /** The logo in the draft; `null` for none. */
    value: LogoValue | null;
    onChange: (next: LogoValue | null) => void;
    /** Whose logo it is, for the initial when there is none. */
    name: string;
    /** The form is saving. */
    disabled?: boolean;
    /** An upload started or ended, so the form's Save can wait for it. */
    onBusy?: (busy: boolean) => void;
    /** The library bucket the picture goes to. */
    purpose?: "business-logo" | "site-image";
    /** Said under the buttons while nothing is wrong. */
    hint?: string;
    /** The logo shown while there is none: its address and whose it is. */
    standIn?: { url: string; alt: string } | null;
    /** What the button that takes the logo off says. */
    removeLabel?: string;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const {
        upload,
        busy,
        error: uploadError,
    } = useImageUpload({
        purpose,
        unserved:
            "Uploaded, but storage is not set up to serve images yet, so the logo cannot print.",
    });
    const [problem, setProblem] = useState<string | null>(null);
    const said = problem ?? uploadError;

    useEffect(() => {
        onBusy?.(busy);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- told when the upload starts or ends, not per render
    }, [busy]);

    async function onFile(file: File) {
        const wrong = logoFileProblem(file);
        setProblem(wrong);
        if (wrong) return;
        // A failed upload says why under the field (`uploadError`).
        const picked = await upload(file);
        if (!picked?.mediaId) return;
        onChange({ url: picked.src, mediaId: picked.mediaId });
    }

    return (
        <div className="flex flex-wrap items-center gap-3.5">
            {value ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                <img
                    src={value.url}
                    alt="Logo"
                    className="size-14 flex-none rounded-xl border border-border bg-white object-cover"
                />
            ) : standIn ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                <img
                    src={standIn.url}
                    alt={standIn.alt}
                    className="size-14 flex-none rounded-xl border border-border bg-white object-cover"
                />
            ) : (
                <div
                    aria-hidden
                    className="flex size-14 flex-none items-center justify-center rounded-xl border border-dashed border-border-strong bg-muted font-display text-[20px] font-semibold text-muted-foreground"
                >
                    {(name.trim() || "?").charAt(0).toUpperCase()}
                </div>
            )}
            <div className="grid min-w-0 flex-[1_1_200px] gap-1.5">
                <div className="flex flex-wrap gap-2">
                    <input
                        ref={inputRef}
                        type="file"
                        accept={LOGO_ACCEPT}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            // Picking the same file again must still fire.
                            e.target.value = "";
                            if (file) void onFile(file);
                        }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || disabled}
                        onClick={() => inputRef.current?.click()}
                    >
                        {busy
                            ? "Uploading…"
                            : value
                              ? "Replace"
                              : "Upload logo"}
                    </Button>
                    {value ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy || disabled}
                            onClick={() => {
                                setProblem(null);
                                onChange(null);
                            }}
                        >
                            {removeLabel}
                        </Button>
                    ) : null}
                </div>
                {said ? (
                    <p
                        role="alert"
                        className="text-pretty text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {said}
                    </p>
                ) : (
                    <p className="text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                        {hint}
                    </p>
                )}
            </div>
        </div>
    );
}
