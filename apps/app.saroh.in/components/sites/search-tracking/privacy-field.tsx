"use client";

import { checkPrivacyUrl } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useId, useState, useTransition } from "react";

import { PRIVACY_NOTE, PRIVACY_URL_PROBLEM } from "@/lib/sites/search-tracking";

import type { SaveSection } from "./parts";

/**
 * The privacy page the cookie banner links to (DEC-108, U7): optional,
 * `https` only. Without one, the banner links to a short notice Saroh
 * writes, listing the site's tools.
 */
export function PrivacyField({
    saved,
    save,
}: {
    saved: string | null;
    save: SaveSection;
}) {
    const id = useId();
    const [draft, setDraft] = useState(saved ?? "");
    const [serverError, setServerError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const typed = draft.trim();
    const url = typed ? checkPrivacyUrl(typed) : null;
    const problem = typed && url === null ? PRIVACY_URL_PROBLEM : serverError;
    const canSave = !pending && url !== null && url !== saved;

    function submit(next: string | null) {
        startTransition(async () => {
            const res = await save({ privacyUrl: next });
            if (!res.ok) {
                if (res.field === "privacyUrl") setServerError(res.error);
                return;
            }
            setDraft(next ?? "");
            showSuccess(
                next
                    ? "Privacy page saved. The cookie notice links to it."
                    : "Privacy page removed. Visitors see the notice we write.",
            );
        });
    }

    return (
        <div className="space-y-2 px-4 py-3">
            <Label htmlFor={`${id}-url`} className="text-sm font-medium">
                Your privacy page
            </Label>
            <p id={`${id}-note`} className="text-sm text-muted-foreground">
                Optional. The cookie notice links to it. {PRIVACY_NOTE}
            </p>
            <form
                className="flex flex-wrap items-start gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canSave && url) submit(url);
                }}
            >
                <Input
                    id={`${id}-url`}
                    type="url"
                    inputMode="url"
                    value={draft}
                    onChange={(e) => {
                        setDraft(e.target.value);
                        setServerError(null);
                    }}
                    placeholder="https://"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${id}-note ${id}-said`}
                    className="min-w-0 flex-1 basis-56"
                />
                <div className="flex shrink-0 gap-2">
                    <Button type="submit" disabled={!canSave}>
                        {pending ? "Saving…" : "Save"}
                    </Button>
                    {saved ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() => submit(null)}
                        >
                            Remove
                        </Button>
                    ) : null}
                </div>
            </form>
            <div id={`${id}-said`} aria-live="polite">
                {problem ? (
                    <p className="text-sm text-destructive">{problem}</p>
                ) : null}
            </div>
        </div>
    );
}
