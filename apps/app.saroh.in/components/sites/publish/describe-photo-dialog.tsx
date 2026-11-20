"use client";

import { FormDialog } from "@saroh/ui/form-dialog";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showSuccess } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { runAction } from "@/lib/api/run-action";
import { describePhoto } from "@/lib/sites/actions";
import type { Flag } from "@/lib/sites/service";

/** How long a description may run: a sentence, not a caption. */
const DESCRIBE_MAX = 250;

/**
 * "Describe it" (plan U10): one field, so a dialog (one sheet, one dialog,
 * one confirm). Writes the photo's description into the page's draft, so
 * it waits for Publish like any edit. A refusal keeps what was typed.
 */
export function DescribePhotoDialog({
    siteId,
    flag,
    onClose,
    onSaved,
}: {
    siteId: string;
    /** The `photoNoDescription` flag being fixed; null when closed. */
    flag: Flag | null;
    onClose: () => void;
    /** Saved: read the checks again. */
    onSaved: () => void;
}) {
    const [alt, setAlt] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fieldId = useId();

    function close() {
        setAlt("");
        setError(null);
        onClose();
    }

    async function save() {
        const { pageId, sectionIndex, field } = flag ?? {};
        if (!pageId || sectionIndex == null || !field) return;
        if (alt.trim() === "") {
            setError("Say what the photo shows first.");
            return;
        }
        const res = await runAction(
            () => describePhoto(siteId, pageId, sectionIndex, field, alt),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        showSuccess("Photo described. It goes live when you publish.");
        close();
        onSaved();
    }

    return (
        <FormDialog
            open={flag !== null}
            size="sm"
            title="Describe the photo"
            description="Google and people using a screen reader read this instead of seeing the photo."
            pending={busy}
            savingLabel="Saving…"
            footNote={SAVE_LINES["waits-for-publish"]}
            onClose={close}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            {flag?.photoSrc ? (
                <div
                    data-ph-mask=""
                    className="overflow-hidden rounded-lg border bg-muted"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a merchant-supplied photo address, not a project asset */}
                    <img
                        src={flag.photoSrc}
                        alt=""
                        className="max-h-48 w-full object-contain"
                    />
                </div>
            ) : null}
            <div className="grid gap-2">
                <Label htmlFor={fieldId}>What it shows</Label>
                <Textarea
                    id={fieldId}
                    value={alt}
                    rows={3}
                    maxLength={DESCRIBE_MAX}
                    disabled={busy}
                    placeholder="Bride in a red lehenga, at the salon"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? `${fieldId}-error` : undefined}
                    onChange={(e) => {
                        setAlt(e.target.value);
                        setError(null);
                    }}
                />
                {error ? (
                    <p
                        id={`${fieldId}-error`}
                        role="alert"
                        className="text-[12px] text-destructive-subtle-foreground"
                    >
                        {error}
                    </p>
                ) : null}
            </div>
        </FormDialog>
    );
}
