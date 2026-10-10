"use client";

import { Button } from "@saroh/ui/button";
import Link from "next/link";
import { useId, useState } from "react";

import type { PrintEnv, QrPrintFormat } from "@/lib/qr/print";
import {
    downloadQrPrint,
    PRINT_BROWSER,
    printInitialsNote,
    QR_PRINTS,
} from "@/lib/qr/print";
import type { QrCodeView } from "@/lib/qr/types";

import { QrPrintThumb } from "./qr-print-thumb";
import type { QrStyleLock } from "./qr-style-lock";
import { qrStyleLockOfRefusal } from "./qr-style-lock";

const HEADING = "font-display text-[19px] font-semibold tracking-[-0.02em]";

const linkClass =
    "rounded-[4px] font-semibold text-brand underline underline-offset-2 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:text-muted-foreground";

/** Said while the maker still shows a sample. */
export const PRINT_NEEDS_CODE =
    "Make this code first. A print file is drawn from its short link, so paper you print keeps working when you point the code somewhere new.";

/** Said for a code whose site has no address to hold its link. */
export const PRINT_NEEDS_ADDRESS =
    "Your site has no web address yet, so there is no link to print.";

export interface QrPrintSlotProps {
    siteId: string;
    /** The saved code on screen; null while the maker shows a sample. */
    code: QrCodeView | null;
    /** The plan leaves print files off: the section is a preview. */
    lock: QrStyleLock | null;
    business: {
        name: string;
        initials?: string;
        /** The logo as a `data:` URL, when this app could read it. */
        dataUrl?: string | null;
        hasLogo?: boolean;
    };
    /** Replaced in tests; the browser's own otherwise. */
    env?: PrintEnv;
}

/**
 * "Ready to print" ("Saroh QR Codes" design, between the maker and "Your
 * QR codes"): the saved code as four PDFs at real size, with crop marks.
 * The API draws each on request (`lib/qr/print.ts`); nothing is stored.
 *
 * - **No code yet**: the paper is drawn empty and the section says to make
 *   the code first. No buttons, so none that do nothing.
 * - **The plan leaves print files off**: a preview, with the one line the
 *   Style control uses and the way up. The API refuses a plain code's file
 *   too, so nothing is offered that would only be refused.
 * - **Downloading**: the pressed button says so; the other three stay
 *   usable. A file that failed says why on its own card and can be tried
 *   again. A refusal by the plan (it changed under the page) turns the
 *   section into the locked preview.
 * - **Initials for a logo**: a branded code's file takes a PNG or JPG
 *   logo. When the API says initials went in and the business has a logo,
 *   one line says so, and why as far as this app can know.
 *
 * Anyone who can see the codes may download (`site:read`, the API's rule).
 */
export function QrPrintSlot(props: QrPrintSlotProps) {
    // A different code starts clean: no other code's failure or note.
    return <PrintSection key={props.code?.id ?? "sample"} {...props} />;
}

type Progress = Partial<Record<QrPrintFormat, "busy" | { failed: string }>>;

function PrintSection({
    siteId,
    code,
    lock: planLock,
    business,
    env = PRINT_BROWSER,
}: QrPrintSlotProps) {
    const id = useId();
    const [progress, setProgress] = useState<Progress>({});
    const [refusedLock, setRefusedLock] = useState<QrStyleLock | null>(null);
    const [initialsNote, setInitialsNote] = useState<string | null>(null);

    const lock = planLock ?? refusedLock;
    const state: "locked" | "sample" | "no-address" | "ready" = lock
        ? "locked"
        : !code
          ? "sample"
          : !code.link
            ? "no-address"
            : "ready";

    async function download(format: QrPrintFormat) {
        if (!code || progress[format] === "busy") return;
        setProgress((p) => ({ ...p, [format]: "busy" }));
        const res = await downloadQrPrint(siteId, code.id, format, env);
        if (res.ok) {
            setProgress((p) => ({ ...p, [format]: undefined }));
            setInitialsNote(
                res.logo === "initials" && code.style === "BRANDED"
                    ? printInitialsNote({
                          hasLogo: business.hasLogo ?? false,
                          dataUrl: business.dataUrl ?? null,
                      })
                    : null,
            );
            return;
        }
        const planLocked = qrStyleLockOfRefusal(res.plan);
        if (planLocked) {
            // Said as the lock, never as a failed download.
            setProgress({});
            setRefusedLock(planLocked);
            return;
        }
        setProgress((p) => ({
            ...p,
            // The API's own sentence, or ours for why (`print.ts`).
            [format]: { failed: res.error },
        }));
    }

    return (
        <section
            aria-labelledby={`${id}-title`}
            data-qr-print={state}
            className="mt-6 flex flex-col gap-3"
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h4 id={`${id}-title`} className={HEADING}>
                    Ready to print
                </h4>
                <span className="text-[13px] text-muted-foreground">
                    PDF at real size, with crop marks.
                </span>
            </div>

            {state === "locked" && lock ? (
                <p
                    data-qr-print-lock=""
                    className="text-[13px] text-foreground/80"
                >
                    {lock.line}{" "}
                    <Link
                        href={lock.href}
                        aria-label={lock.cta}
                        className={linkClass}
                    >
                        {lock.plan}
                    </Link>
                    .
                </p>
            ) : null}
            {state === "sample" ? (
                <p role="note" className="text-[13px] text-foreground/80">
                    {PRINT_NEEDS_CODE}
                </p>
            ) : null}
            {state === "no-address" ? (
                <p role="note" className="text-[13px] text-foreground/80">
                    {PRINT_NEEDS_ADDRESS}
                </p>
            ) : null}

            <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
                {QR_PRINTS.map((print) => {
                    const at = progress[print.format];
                    const busy = at === "busy";
                    const failed = at && at !== "busy" ? at.failed : undefined;
                    const nameId = `${id}-${print.format}`;
                    return (
                        <li
                            key={print.format}
                            data-qr-print-format={print.format}
                            className="flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-border bg-card p-3.5"
                        >
                            <QrPrintThumb
                                print={print}
                                // A file is only ever of a code with a link.
                                code={code?.link ? code : null}
                                business={business}
                                dimmed={state === "locked"}
                            />
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                <span
                                    id={nameId}
                                    className="text-sm font-semibold"
                                >
                                    {print.name}
                                </span>
                                <span className="font-mono text-[11px] text-muted-foreground">
                                    {print.size}
                                </span>
                            </div>
                            {state === "ready" ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={busy}
                                    aria-busy={busy || undefined}
                                    aria-describedby={nameId}
                                    onClick={() => void download(print.format)}
                                >
                                    <span aria-live="polite">
                                        {busy
                                            ? "Making the PDF…"
                                            : failed
                                              ? "Try again"
                                              : "Download PDF"}
                                    </span>
                                </Button>
                            ) : null}
                            {failed ? (
                                <p
                                    role="alert"
                                    className="rounded-[9px] bg-destructive-subtle px-3 py-2 text-[13px] text-destructive-subtle-foreground"
                                >
                                    {failed}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>

            {initialsNote && state === "ready" ? (
                <p
                    role="status"
                    data-qr-print-initials=""
                    className="rounded-[10px] bg-muted px-3.5 py-2.5 text-[13px] text-foreground"
                >
                    {initialsNote}
                </p>
            ) : null}
        </section>
    );
}
