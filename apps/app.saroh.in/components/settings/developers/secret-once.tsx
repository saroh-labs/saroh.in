"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { CopyButton } from "@saroh/ui/copy-button";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Notice } from "@saroh/ui/notice";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

/**
 * A key or a signing secret, shown once ("Key shown once" board): the
 * whole value, Copy, what to do with it and "I've saved it". Saroh keeps
 * only a fingerprint, so closing without a copy asks once first. The value
 * is blocked from session recordings.
 */
export function SecretOnce({
    secret,
    title,
    lead,
    note,
    guide,
    thing,
    onDone,
}: {
    /** Null: closed. */
    secret: string | null;
    title: string;
    /** "“Inventory app” is ready. This is the only time Saroh shows it." */
    lead: string;
    note: string;
    guide: { label: string; href: string };
    /** "key", "secret": for the copy's own failure line. */
    thing: string;
    onDone: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const [asking, setAsking] = useState(false);

    function close() {
        if (!copied) return setAsking(true);
        setCopied(false);
        onDone();
    }

    return (
        <>
            <FormSheet
                open={secret !== null}
                title={title}
                description={lead}
                onClose={close}
                doneOnly
                doneLabel="I've saved it"
            >
                <div
                    data-ph-block=""
                    data-secret-once=""
                    className="break-all rounded-[10px] border border-foreground bg-card p-3.5 font-mono text-[14px] leading-normal"
                >
                    {secret}
                </div>
                <CopyButton
                    value={secret ?? ""}
                    label={`Copy ${thing}`}
                    thing={thing}
                    size="default"
                    className="w-full"
                    onCopied={() => setCopied(true)}
                />
                <Notice tone="neutral">{note}</Notice>
                <a
                    href={guide.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 self-start text-[13px] font-semibold underline decoration-border-strong underline-offset-[3px]"
                >
                    {guide.label}{" "}
                    <ExternalLink aria-hidden className="size-3.5" />
                </a>
            </FormSheet>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                tone="neutral"
                title={`Close without copying the ${thing}?`}
                description={`You won't see this ${thing} again. If it's lost, replace it.`}
                confirmLabel="Close anyway"
                keepLabel={`Copy the ${thing}`}
                onConfirm={() => {
                    setCopied(false);
                    onDone();
                }}
            />
        </>
    );
}
