"use client";

import { Button } from "@saroh/ui/button";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type { WaysRead } from "@/components/invoices/bulk-remind-steps";
import {
    DoneStep,
    EmailCard,
    PickStep,
    WalkCard,
    WaysStep,
} from "@/components/invoices/bulk-remind-steps";
import { openWhatsAppShare } from "@/components/invoices/whatsapp-share";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { useLatestCall } from "@/components/shared/live-refresh/use-latest-call";
import { useHold } from "@/components/shared/undo/use-hold";
import { count } from "@/lib/format/plural";
import { previewReminders, sendReminders } from "@/lib/invoices/actions";
import { forgetLink } from "@/lib/invoices/minted-links";
import type { ReminderSendResult } from "@/lib/invoices/remind-all";
import type {
    EmailPhase,
    PickRow,
    RemindedBy,
    Tally,
} from "@/lib/invoices/remind-many";
import {
    chunks,
    emailOutcome,
    firstName,
    joinPreviews,
    joinResults,
    pickLine,
    REMIND_MANY_KEY,
    sendLabel,
    sumWords,
    waysOf,
} from "@/lib/invoices/remind-many";
import type { Invoice } from "@/lib/invoices/service";
import { previewMessage } from "@/lib/invoices/share";

type Step = "pick" | "ways" | "send";

/** What happened to each WhatsApp one in the walk. */
type Walked = Partial<Record<string, "shared" | "skipped">>;

/**
 * Remind many, by channel (DEC-173, U12 #1124, INVBulkSend and
 * INVBulkSendPhone): one `FormSheet` with three steps. On a phone it is
 * the whole screen, its buttons at the foot.
 *
 * 1. **Pick who.** Every owed invoice shown is ticked to start (or the
 *    rows ticked on the list): "7 overdue shown. Ticked: 6 · ₹13,440."
 * 2. **How each one goes.** Remind many's preview (U5), headed by
 *    INVShareB's one look, grouped: "Email, sent for you" (the business's
 *    own email), "WhatsApp, one tap each" and "Can't reach now", each with
 *    why. The button says what happens: "Send 3 emails, then WhatsApp 2".
 * 3. **Send.** The emails are held ten seconds with Undo (`useHold().send`,
 *    and an Undo in the sheet, where the toast can't be reached), then go
 *    in calls of at most 100. Meanwhile the sheet walks the WhatsApp ones
 *    one at a time: "Open WhatsApp for Vivek" opens click-to-chat through
 *    U11's share call (which logs it and counts it as the day's reminder;
 *    Saroh sends nothing on WhatsApp), or "Skip Vivek". It ends on
 *    "Reminders done" with the tally.
 *
 * Undo inside the hold sends nothing and comes back to step 2, unless a
 * WhatsApp one has already opened, which stands. Leaving midway keeps what
 * was sent: a held send still goes, with its Undo on the toast. One
 * reminder a day still applies: the server reads each invoice again as it
 * goes.
 */
export function BulkRemindSheet({
    open,
    onOpenChange,
    rows,
    ticked: tickedAtFirst,
    invoices,
    businessName,
    timeZone,
    onReminded,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Step 1's rows: the owed invoices the list shows, or the ones ticked there. */
    rows: readonly PickRow[];
    /** Ticked to start; every row when left out. */
    ticked?: readonly string[];
    /** The list's invoices, for each WhatsApp message's preview. */
    invoices: readonly Invoice[];
    businessName: string;
    timeZone: string;
    /** One was reminded here, and how: the list says so on its row. */
    onReminded: (invoiceId: string, by: RemindedBy) => void;
}) {
    const [step, setStep] = useState<Step>("pick");
    const [ticked, setTicked] = useState<ReadonlySet<string>>(
        () => new Set(tickedAtFirst ?? rows.map((r) => r.invoiceId)),
    );
    const [read, setRead] = useState<WaysRead>({ status: "loading" });
    const [emails, setEmails] = useState<EmailPhase>({ phase: "none" });
    const [walked, setWalked] = useState<Walked>({});
    const [busy, setBusy] = useState(false);
    // The walk as the hold's callbacks see it, after the render that set it.
    const walkedNow = useRef<Walked>({});
    // The send ran (and so its refusal is a failure, not an Undo).
    const ran = useRef(false);
    const { send: hold, undo } = useHold();
    // Step 2's read: only the newest pick's preview lands (review #12).
    const latest = useLatestCall();

    // Each opening starts again at step 1, unless Undo brought it back.
    const [wasOpen, setWasOpen] = useState(open);
    const [backToWays, setBackToWays] = useState(false);
    // Whether it is open now, for Undo pressed on the toast after it closed.
    const openNow = useRef(open);
    useEffect(() => {
        openNow.current = open;
        // A read from before a close or a reopen answers to nobody.
        latest.drop();
    }, [open, latest]);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open && backToWays) setBackToWays(false);
        else if (open) {
            setStep("pick");
            setTicked(new Set(tickedAtFirst ?? rows.map((r) => r.invoiceId)));
            setRead({ status: "loading" });
            setEmails({ phase: "none" });
            setWalked({});
        }
    }

    const picked = rows.filter((r) => ticked.has(r.invoiceId));
    const ways = read.status === "ready" ? read.ways : null;
    const close = () => onOpenChange(false);

    function toggle(id: string) {
        const next = new Set(ticked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setTicked(next);
    }

    async function load(ids: readonly string[]) {
        const current = latest.begin();
        setRead({ status: "loading" });
        try {
            const parts = await Promise.all(
                chunks(ids).map((invoiceIds) =>
                    previewReminders({ invoiceIds }),
                ),
            );
            // An older pick's preview that answered late: the newer one wins.
            if (!current()) return;
            if (parts.some((p) => !p.ok)) {
                setRead({ status: "failed" });
                return;
            }
            setRead({
                status: "ready",
                ways: waysOf(
                    joinPreviews(parts.flatMap((p) => (p.ok ? [p.data] : []))),
                ),
            });
        } catch {
            if (current()) setRead({ status: "failed" });
        }
    }

    function toWays() {
        if (picked.length === 0) return;
        setStep("ways");
        void load(picked.map((r) => r.invoiceId));
    }

    function walk(id: string, how: "shared" | "skipped") {
        const next = { ...walkedNow.current, [id]: how };
        walkedNow.current = next;
        setWalked(next);
    }

    /** Undo, from the sheet or the toast: back to step 2 unless WhatsApp went. */
    function undone() {
        if (Object.keys(walkedNow.current).length > 0) {
            setEmails({ phase: "undone" });
            return;
        }
        setEmails({ phase: "none" });
        setStep("ways");
        if (!openNow.current) setBackToWays(true);
        onOpenChange(true);
    }

    function send() {
        if (!ways) return;
        const going = ways.email;
        setStep("send");
        walkedNow.current = {};
        setWalked({});
        if (going.length === 0) return;
        ran.current = false;
        setEmails({ phase: "held", names: going.map((r) => r.name) });
        let sent = 0;
        hold(REMIND_MANY_KEY, {
            description: `${count(going.length, "reminder")} from your own email.`,
            run: async () => {
                ran.current = true;
                const parts: ReminderSendResult[] = [];
                const ids = going.map((r) => r.invoiceId);
                let answered = 0;
                for (const invoiceIds of chunks(ids)) {
                    const res = await sendReminders({ invoiceIds });
                    if (!res.ok) {
                        if (parts.length === 0) {
                            return { ok: false, error: res.error };
                        }
                        break;
                    }
                    parts.push(res.data);
                    answered += invoiceIds.length;
                }
                const joined = joinResults(parts);
                for (const row of joined.invoices) {
                    if (row.outcome === "EMAILED") {
                        // A reminder mints a fresh link: the one kept here is gone.
                        forgetLink(row.invoiceId);
                        onReminded(row.invoiceId, "email");
                    }
                }
                const out = emailOutcome(joined);
                // A later call that failed: those didn't go.
                for (const r of going.slice(answered)) {
                    out.failed.push({
                        name: r.name,
                        words: "Couldn't send this one",
                    });
                }
                sent = out.emailed.length;
                setEmails(out);
                return { ok: true };
            },
            sent: () =>
                sent > 0
                    ? `${count(sent, "reminder")} emailed.`
                    : "No reminders were emailed.",
            onBack: () => {
                if (ran.current) setEmails({ phase: "failed" });
                else undone();
            },
        });
    }

    const whatsapp = ways?.whatsapp ?? [];
    const at = whatsapp.findIndex((r) => !walked[r.invoiceId]);
    const next = at >= 0 ? whatsapp[at] : undefined;
    const walkDone = !next;
    const finished = step === "send" && walkDone && emails.phase !== "held";

    async function openNext() {
        if (!next || busy) return;
        // Opened inside the press, so no popup blocker stops it.
        const tab =
            typeof window === "undefined"
                ? null
                : window.open("about:blank", "_blank");
        setBusy(true);
        try {
            const ok = await openWhatsAppShare(next.invoiceId, "REMINDER", tab);
            if (ok) {
                walk(next.invoiceId, "shared");
                forgetLink(next.invoiceId);
                onReminded(next.invoiceId, "whatsapp");
            }
        } finally {
            setBusy(false);
        }
    }

    function messageFor(invoiceId: string): string | null {
        const invoice = invoices.find((i) => i.id === invoiceId);
        if (!invoice) return null;
        return previewMessage({
            invoice,
            kind: "REMINDER",
            business: businessName,
            timeZone,
        });
    }

    const tally: Tally = {
        emailed: emails.phase === "sent" ? emails.emailed : [],
        whatsapp: whatsapp
            .filter((r) => walked[r.invoiceId] === "shared")
            .map((r) => r.name),
        skipped: whatsapp
            .filter((r) => walked[r.invoiceId] === "skipped")
            .map((r) => r.name),
        waits: [
            ...(ways?.cantReach.filter((r) => r.waits).map((r) => r.name) ??
                []),
            ...(emails.phase === "sent" ? emails.waits : []),
        ],
        cantReach:
            ways?.cantReach.filter((r) => !r.waits).map((r) => r.name) ?? [],
        failed: [
            ...(emails.phase === "sent"
                ? emails.failed.map((f) => f.name)
                : []),
            ...(emails.phase === "failed" && ways
                ? ways.email.map((r) => r.name)
                : []),
        ],
    };

    const overdue = rows.every((r) => r.lateDays > 0);
    const title = overdue
        ? "Remind about overdue invoices"
        : "Remind about invoices";
    const pickedWords = `${picked.length} picked${sumWords(picked) ? ` · ${sumWords(picked)}` : ""}`;

    // The step's description, body and foot.
    let description: string;
    let body: ReactNode;
    let foot: {
        saveLabel: string;
        saveOff?: boolean;
        cancelLabel?: string;
        footNote?: ReactNode;
        extra?: ReactNode;
        doneOnly?: boolean;
        doneLabel?: string;
        submit: () => void | Promise<void>;
    };

    if (step === "pick") {
        description = "Step 1 of 3 · Pick who";
        body = <PickStep rows={rows} ticked={ticked} onToggle={toggle} />;
        foot = {
            saveLabel: "Next: how each one goes",
            saveOff: picked.length === 0,
            cancelLabel: "Not now",
            footNote: (
                <p className="text-[12.5px] tabular-nums text-muted-foreground">
                    {pickLine(rows, picked)}
                </p>
            ),
            submit: toWays,
        };
    } else if (step === "ways") {
        const reach = ways ? ways.email.length + ways.whatsapp.length : 0;
        description = "Step 2 of 3 · How each one goes";
        body = (
            <WaysStep
                read={read}
                onRetry={() => void load(picked.map((r) => r.invoiceId))}
            />
        );
        foot = {
            saveLabel: ways ? sendLabel(ways) : "Send",
            saveOff: !ways || reach === 0,
            cancelLabel: "Not now",
            footNote:
                ways && ways.email.length > 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                        Email goes from your own provider. Saroh never emails
                        your customers from its address.
                    </p>
                ) : null,
            extra: (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        latest.drop();
                        setStep("pick");
                    }}
                >
                    Back
                </Button>
            ),
            submit: send,
        };
    } else if (finished) {
        description = "Reminders done";
        body = <DoneStep picked={pickedWords} tally={tally} />;
        foot = {
            saveLabel: "Done",
            doneOnly: true,
            doneLabel: "Done",
            submit: close,
        };
    } else {
        description = next
            ? `Step 3 of 3 · WhatsApp, ${at + 1} of ${whatsapp.length}`
            : "Step 3 of 3 · Email";
        body = (
            <div className="grid content-start gap-4">
                <EmailCard
                    emails={emails}
                    total={ways?.email.length ?? 0}
                    onUndo={() => undo(REMIND_MANY_KEY)}
                />
                {next ? (
                    <WalkCard row={next} message={messageFor(next.invoiceId)} />
                ) : (
                    <p className="text-[13px] text-muted-foreground">
                        WhatsApp ones done. The emails go in a few seconds.
                    </p>
                )}
            </div>
        );
        const first = next ? firstName(next.name) : "";
        foot = next
            ? {
                  saveLabel: `Open WhatsApp for ${first}`,
                  cancelLabel: "Close",
                  extra: (
                      <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => walk(next.invoiceId, "skipped")}
                      >
                          Skip {first}
                      </Button>
                  ),
                  submit: openNext,
              }
            : {
                  saveLabel: "Close",
                  doneOnly: true,
                  doneLabel: "Close",
                  submit: close,
              };
    }

    return (
        <FormSheet
            open={open}
            title={title}
            description={description}
            wide
            pending={busy}
            fieldsClassName="gap-4"
            saveLabel={foot.saveLabel}
            saveOff={foot.saveOff}
            cancelLabel={foot.cancelLabel}
            footNote={foot.footNote}
            extra={foot.extra}
            doneOnly={foot.doneOnly}
            doneLabel={foot.doneLabel}
            onClose={close}
            onSubmit={(event) => {
                event.preventDefault();
                return foot.submit();
            }}
        >
            <div data-remind-step={finished ? "done" : step}>{body}</div>
        </FormSheet>
    );
}
