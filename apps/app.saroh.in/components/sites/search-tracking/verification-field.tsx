"use client";

import type { VerificationService } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showSuccess } from "@saroh/ui/toast";
import { useId, useState, useTransition } from "react";

import {
    readVerificationPaste,
    VERIFICATION_WORDS,
    verificationSavedLine,
} from "@/lib/sites/search-tracking";

import type { SaveSection } from "./parts";

/**
 * One verification code (DEC-108, U7): the full `<meta>` tag or the bare
 * code. The code is taken out of the tag here, checked with the shared
 * validator as it is typed, and only the code is sent; a paste that looks
 * secret is refused on the spot and never leaves the page.
 *
 * Once saved it says what is true — the tag is on the live site, go back
 * and press Verify — and links to the live page. There is no "Verified":
 * only the service knows that.
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
    const [draft, setDraft] = useState(saved ?? "");
    const [serverError, setServerError] = useState<string | null>(null);
    const [justSaved, setJustSaved] = useState(false);
    const [pending, startTransition] = useTransition();

    const read = readVerificationPaste(service, draft);
    const problem = read.state === "bad" ? read.message : (serverError ?? null);
    const value = read.state === "ok" ? read.value : null;
    const canSave = !pending && value !== null && value !== saved;

    function onChange(next: string) {
        setDraft(next);
        setServerError(null);
        setJustSaved(false);
    }

    function submit(code: string | null) {
        startTransition(async () => {
            const res = await save({ verifications: { [service]: code } });
            if (!res.ok) {
                if (res.field === `verifications.${service}`) {
                    setServerError(res.error);
                }
                return;
            }
            setDraft(code ?? "");
            if (code === null) {
                setJustSaved(false);
                showSuccess(`${words.label} code removed from your live site.`);
                return;
            }
            setJustSaved(true);
            showSuccess(verificationSavedLine(service));
        });
    }

    const where = words.where.replace("{host}", host ?? "your site's address");

    return (
        <div className="space-y-2 px-4 py-3" data-verification={service}>
            <Label htmlFor={`${id}-code`} className="text-sm font-medium">
                {words.label}
            </Label>
            <p id={`${id}-where`} className="text-sm text-muted-foreground">
                {where}
            </p>
            <form
                className="flex flex-wrap items-start gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canSave && value) submit(value);
                }}
            >
                <Input
                    id={`${id}-code`}
                    value={draft}
                    onChange={(e) => onChange(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste the tag or the code"
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={`${id}-where ${id}-said`}
                    className="min-w-0 flex-1 basis-56 font-mono text-sm"
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
                ) : read.state === "ok" && read.extracted ? (
                    <p className="text-sm text-muted-foreground">
                        Code found:{" "}
                        <span className="font-mono [overflow-wrap:anywhere]">
                            {read.value}
                        </span>
                    </p>
                ) : null}
                {justSaved ? (
                    <p className="text-sm">
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
                    </p>
                ) : null}
            </div>
        </div>
    );
}
