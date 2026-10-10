"use client";

import type { VerificationService } from "@saroh/block-contract";
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
import {
    readVerificationPaste,
    VERIFICATION_WORDS,
    verificationSavedLine,
} from "@/lib/sites/search-tracking";

import type { SaveSection } from "./parts";
import { LineRow } from "./parts";

/**
 * One verification code (DEC-108, U7): the full `<meta>` tag or the bare
 * code. The code is taken out of the tag in the browser, checked with the
 * shared validator as it is typed, and only the code is sent; a paste that
 * looks secret is refused on the spot and never leaves the page.
 *
 * Read first (owner, 10 Oct): the row says the code saved, or that none
 * is, and Add or Edit opens its sheet, which says where to find the code.
 * Clearing the box there takes the code off the live site.
 *
 * Once saved the row says what is true — the tag is on the live site, go
 * back and press Verify — and links to the live page. There is no
 * "Verified": only the service knows that.
 */
export function VerificationField({
    service,
    saved,
    host,
    liveUrl,
    save,
}: {
    service: VerificationService;
    saved: string | null;
    /** The address the service is told to check; null without one. */
    host: string | null;
    liveUrl: string | null;
    save: SaveSection;
}) {
    const id = useId();
    const words = VERIFICATION_WORDS[service];
    const sheet = useSheetControl();
    const [serverError, setServerError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    const [pending, startTransition] = useTransition();

    function submit(code: string | null) {
        startTransition(async () => {
            const res = await save({ verifications: { [service]: code } });
            if (!res.ok) {
                if (res.field === `verifications.${service}`) {
                    setServerError(res.error);
                }
                return;
            }
            sheet.close();
            setJustSaved(code !== null);
            showSuccess(
                code === null
                    ? `${words.label} code removed from your live site.`
                    : verificationSavedLine(service),
            );
        });
    }

    return (
        <div data-verification={service}>
            <LineRow
                label={words.label}
                action={
                    <Button
                        id={`${id}-edit`}
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        aria-haspopup="dialog"
                        aria-label={`${saved ? "Edit" : "Add"} ${words.label} code`}
                        onClick={() => {
                            setServerError(null);
                            sheet.show();
                        }}
                    >
                        {saved ? "Edit" : "Add"}
                    </Button>
                }
            >
                {saved ? (
                    <span className="font-mono">{saved}</span>
                ) : (
                    <span className="text-muted-foreground">Not set</span>
                )}
                {justSaved && saved ? (
                    <span className="mt-1 block" role="status">
                        {verificationSavedLine(service)}{" "}
                        {liveUrl ? (
                            <a
                                href={liveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline underline-offset-2 hover:text-muted-foreground active:text-foreground"
                            >
                                View your live page
                            </a>
                        ) : null}
                    </span>
                ) : null}
            </LineRow>
            {sheet.opened > 0 ? (
                <VerificationSheet
                    key={sheet.opened}
                    editId={`${id}-edit`}
                    service={service}
                    saved={saved}
                    host={host}
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

function VerificationSheet({
    editId,
    service,
    saved,
    host,
    open,
    pending,
    serverError,
    onTyped,
    onClose,
    onSave,
}: {
    editId: string;
    service: VerificationService;
    saved: string | null;
    host: string | null;
    open: boolean;
    pending: boolean;
    /** The API's refusal of this code, said under it. */
    serverError: string | null;
    onTyped: () => void;
    onClose: () => void;
    onSave: (code: string | null) => void;
}) {
    const id = useId();
    const words = VERIFICATION_WORDS[service];
    const [draft, setDraft] = useState(saved ?? "");
    const read = readVerificationPaste(service, draft);
    const problem = read.state === "bad" ? read.message : serverError;
    const value = read.state === "ok" ? read.value : null;
    const empty = draft.trim() === "";

    return (
        <SettingsSheetFrame
            editId={editId}
            title={words.label}
            description={words.where.replace(
                "{host}",
                host ?? "your site's address",
            )}
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                // Nothing typed: the code comes off, if there was one.
                const next = empty ? null : value;
                if (!empty && next === null) return;
                if (next === saved) onClose();
                else onSave(next);
            }}
        >
            <Label htmlFor={`${id}-code`}>Tag or code</Label>
            <Input
                id={`${id}-code`}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value);
                    onTyped();
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the tag or the code"
                aria-invalid={problem ? true : undefined}
                aria-describedby={`${id}-said`}
                className="font-mono text-sm"
            />
            <div id={`${id}-said`} aria-live="polite">
                {problem ? (
                    <p className={PROBLEM}>{problem}</p>
                ) : read.state === "ok" && read.extracted ? (
                    <p className="text-sm text-muted-foreground">
                        Code found:{" "}
                        <span className="font-mono [overflow-wrap:anywhere]">
                            {read.value}
                        </span>
                    </p>
                ) : (
                    <p className={NOTE}>
                        It is on your live site as soon as you save.
                        {saved ? " Clear the box to remove it." : ""}
                    </p>
                )}
            </div>
        </SettingsSheetFrame>
    );
}
