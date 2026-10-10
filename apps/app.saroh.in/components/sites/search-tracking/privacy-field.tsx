"use client";

import { checkPrivacyUrl } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useId, useState, useTransition } from "react";

import {
    NOTE,
    PROBLEM,
    SettingsSheetFrame,
    useSheetControl,
} from "@/components/sites/settings/settings-sheet";
import { PRIVACY_NOTE, PRIVACY_URL_PROBLEM } from "@/lib/sites/search-tracking";

import type { SaveSection } from "./parts";
import { LineRow } from "./parts";

/**
 * The privacy page the cookie banner links to (DEC-108, U7): optional,
 * `https` only. Without one, the banner links to a short notice Saroh
 * writes, listing the site's tools.
 *
 * Read first (owner, 10 Oct): the row says the page saved, or that none
 * is, and Edit opens its sheet. Clearing the box there removes it.
 */
export function PrivacyField({
    saved,
    save,
}: {
    saved: string | null;
    save: SaveSection;
}) {
    const id = useId();
    const sheet = useSheetControl();
    const [pending, startTransition] = useTransition();
    const [serverError, setServerError] = useState<string | null>(null);

    function submit(next: string | null) {
        startTransition(async () => {
            const res = await save({ privacyUrl: next });
            if (!res.ok) {
                if (res.field === "privacyUrl") setServerError(res.error);
                return;
            }
            sheet.close();
            showSuccess(
                next
                    ? "Privacy page saved. The cookie notice links to it."
                    : "Privacy page removed. Visitors see the notice we write.",
            );
        });
    }

    return (
        <div data-privacy-page>
            <LineRow
                label="Privacy page"
                action={
                    <Button
                        id={`${id}-edit`}
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        aria-haspopup="dialog"
                        aria-label={
                            saved ? "Edit privacy page" : "Add privacy page"
                        }
                        onClick={() => {
                            setServerError(null);
                            sheet.show();
                        }}
                    >
                        {saved ? "Edit" : "Add"}
                    </Button>
                }
            >
                {saved ?? (
                    <span className="text-muted-foreground">
                        Not set. {PRIVACY_NOTE}
                    </span>
                )}
            </LineRow>
            {sheet.opened > 0 ? (
                <PrivacySheet
                    key={sheet.opened}
                    editId={`${id}-edit`}
                    saved={saved}
                    open={sheet.open}
                    pending={pending}
                    serverError={serverError}
                    onTyped={() => setServerError(null)}
                    onClose={sheet.close}
                    onSave={submit}
                />
            ) : null}
        </div>
    );
}

function PrivacySheet({
    editId,
    saved,
    open,
    pending,
    serverError,
    onTyped,
    onClose,
    onSave,
}: {
    editId: string;
    saved: string | null;
    open: boolean;
    pending: boolean;
    /** The API's refusal of this field, said under it. */
    serverError: string | null;
    onTyped: () => void;
    onClose: () => void;
    onSave: (next: string | null) => void;
}) {
    const id = useId();
    const [draft, setDraft] = useState(saved ?? "");
    const typed = draft.trim();
    const url = typed ? checkPrivacyUrl(typed) : null;
    const problem = typed && url === null ? PRIVACY_URL_PROBLEM : serverError;

    return (
        <SettingsSheetFrame
            editId={editId}
            title="Your privacy page"
            description={`Optional. The cookie notice links to it. ${PRIVACY_NOTE}`}
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                if (typed && url === null) return;
                if (url === saved) onClose();
                else onSave(url);
            }}
        >
            <Label htmlFor={`${id}-url`}>Page address</Label>
            <Input
                id={`${id}-url`}
                type="url"
                inputMode="url"
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    onTyped();
                }}
                placeholder="https://"
                aria-invalid={problem ? true : undefined}
                aria-describedby={`${id}-said`}
            />
            <div id={`${id}-said`} aria-live="polite">
                {problem ? (
                    <p className={PROBLEM}>{problem}</p>
                ) : (
                    <p className={NOTE}>
                        It applies as soon as you save.
                        {saved ? " Clear the box to remove it." : ""}
                    </p>
                )}
            </div>
        </SettingsSheetFrame>
    );
}
