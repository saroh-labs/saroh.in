"use client";

import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import { useRef, useState } from "react";

import { useImageUpload } from "@/components/sites/media-picker";
import {
    LOGO_ACCEPT,
    logoFileProblem,
} from "@/lib/organizations/business-logo";
import { saveBusinessLogo } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/**
 * The Logo row of the Identity card ("Saroh Settings" design): the logo, or
 * the business's initial in a dashed tile when there is none, with Upload
 * or Replace and Remove for a role that may change settings.
 *
 * It saves on its own, outside the card's Edit: picking a file uploads it
 * to the library and sets it as the logo at once. A wrong file is said on
 * the row before anything is sent; the API holds the same rule.
 */
export function BusinessLogoRow({
    logoUrl,
    name,
    canEdit,
    onSaved,
}: {
    logoUrl: string | null;
    /** The business name, for the initial when there is no logo. */
    name: string;
    canEdit: boolean;
    onSaved: (settings: OrganizationSettings) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const {
        upload,
        busy,
        error: uploadError,
    } = useImageUpload({
        purpose: "business-logo",
        unserved:
            "Uploaded, but storage is not set up to serve images yet, so the logo cannot print.",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const working = busy || saving;
    const said = error ?? uploadError;

    async function onFile(file: File) {
        const problem = logoFileProblem(file);
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);
        // A failed upload says why on the row (`uploadError`).
        const picked = await upload(file);
        if (!picked?.mediaId) return;
        setSaving(true);
        const result = await saveBusinessLogo(picked.mediaId);
        setSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        onSaved(result.data);
        showSuccess("Logo saved — it prints on your invoices and receipts");
    }

    async function remove() {
        setError(null);
        setSaving(true);
        const result = await saveBusinessLogo(null);
        setSaving(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        onSaved(result.data);
        showSuccess("Logo removed");
    }

    const pickLabel = busy ? "Uploading…" : logoUrl ? "Replace" : "Upload logo";

    return (
        <div className="flex flex-wrap items-center gap-3.5 border-b border-border/70 px-[18px] py-3.5">
            {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- a tenant's own image, outside next/image's allowlist
                <img
                    src={logoUrl}
                    alt="Business logo"
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
            <div className="min-w-0 flex-[1_1_200px]">
                <div className="text-[13.5px] font-semibold">Logo</div>
                <div className="mt-0.5 text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                    {logoUrl
                        ? "On your invoices and receipts."
                        : "Goes on your invoices and receipts. Square, under 1 MB."}
                </div>
                {said ? (
                    <div
                        role="alert"
                        className="mt-1 text-[12.5px] text-destructive-subtle-foreground"
                    >
                        {said}
                    </div>
                ) : null}
            </div>
            {canEdit ? (
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
                        disabled={working}
                        onClick={() => inputRef.current?.click()}
                    >
                        {pickLabel}
                    </Button>
                    {logoUrl ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={working}
                            onClick={() => void remove()}
                            className="text-destructive-subtle-foreground"
                        >
                            Remove
                        </Button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
