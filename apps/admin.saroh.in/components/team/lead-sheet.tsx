"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, LoadingState } from "@saroh/ui/data-state";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useCallback, useEffect, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { FailedPanel } from "@/components/states/failed-panel";
import { formatDate, formatDateTime } from "@/lib/format";
import {
    assignLeadAction,
    leadManagersAction,
    readLeadAction,
} from "@/lib/saroh-lead-actions";
import type {
    LeadCard,
    LeadContact,
    LeadDetail,
    LeadManager,
} from "@/lib/saroh-lead-words";
import {
    CONTACT_LABEL,
    followUpWords,
    leadLine,
    ownerWords,
    STAGE_LABEL,
} from "@/lib/saroh-lead-words";

import { LeadDetailsForm } from "./lead-details";
import { LeadStageControl } from "./lead-stage";
import { LogCallSheet } from "./log-call-sheet";

const SELECT =
    "h-9 w-full rounded-md border border-input bg-field px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Loaded =
    | { state: "loading" }
    | { state: "failed"; error: string }
    | { state: "ready"; lead: LeadDetail };

/**
 * One of Saroh's own leads, in a side sheet over the board (DEC-169, R33,
 * U20): who it is and where it came from, its Stage control, its details,
 * the calls and visits logged on it, and, for Support or a Platform owner
 * on an unowned lead, Give to a manager. Read when it opens, so it is never
 * stale; every change tells the board, which lights the card.
 */
export function LeadSheet({
    leadId,
    today,
    allScope,
    onOpenChange,
    onChanged,
}: {
    leadId: string;
    today: string;
    allScope: boolean;
    onOpenChange: (open: boolean) => void;
    /** A change was saved: the card as it is now, and what to say. */
    onChanged: (card: LeadCard, message: string) => void;
}) {
    const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
    const [editing, setEditing] = useState(false);
    const [logging, setLogging] = useState(false);

    const load = useCallback(async () => {
        const result = await readLeadAction(leadId);
        setLoaded(
            result.ok
                ? { state: "ready", lead: result.data }
                : { state: "failed", error: result.error },
        );
    }, [leadId]);

    useEffect(() => {
        let live = true;
        void readLeadAction(leadId).then((result) => {
            if (!live) return;
            setLoaded(
                result.ok
                    ? { state: "ready", lead: result.data }
                    : { state: "failed", error: result.error },
            );
        });
        return () => {
            live = false;
        };
    }, [leadId]);

    const changed = (card: LeadCard, message: string) => {
        onChanged(card, message);
        void load();
    };

    const lead = loaded.state === "ready" ? loaded.lead : null;

    return (
        <Sheet open onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-lg">
                <SheetHeader>
                    <SheetTitle>{lead ? lead.name : "Lead"}</SheetTitle>
                    <SheetDescription>
                        {lead
                            ? `${STAGE_LABEL[lead.stage]} · ${leadLine(lead)}`
                            : "Saroh's own lead."}
                    </SheetDescription>
                </SheetHeader>

                {loaded.state === "loading" ? (
                    <LoadingState label="Loading the lead" rows={4} />
                ) : null}
                {loaded.state === "failed" ? (
                    <div className="grid gap-2">
                        <p role="alert" className="text-sm text-destructive">
                            {loaded.error}
                        </p>
                        <FailedPanel
                            things="lead"
                            onRetry={() => void load()}
                        />
                    </div>
                ) : null}

                {lead ? (
                    <>
                        <Facts lead={lead} today={today} />

                        {lead.mayAssign ? (
                            <GiveToManager
                                lead={lead}
                                onGiven={(card) =>
                                    changed(
                                        card,
                                        `${lead.name} is ${card.owner?.name ?? "given out"}'s now.`,
                                    )
                                }
                            />
                        ) : null}

                        {lead.mayWrite ? (
                            <LeadStageControl
                                leadId={lead.id}
                                stage={lead.stage}
                                allScope={allScope}
                                onMoved={(card) =>
                                    changed(
                                        card,
                                        `${lead.name} moved to ${STAGE_LABEL[card.stage]}.`,
                                    )
                                }
                            />
                        ) : null}

                        <section aria-label="Details" className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Details
                                </h3>
                                {lead.mayWrite && !editing ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditing(true)}
                                    >
                                        Edit details
                                    </Button>
                                ) : null}
                            </div>
                            {editing ? (
                                <LeadDetailsForm
                                    lead={lead}
                                    onCancel={() => setEditing(false)}
                                    onSaved={(card) => {
                                        setEditing(false);
                                        changed(card, `${card.name} saved.`);
                                    }}
                                />
                            ) : (
                                <DetailList lead={lead} />
                            )}
                        </section>

                        <section
                            aria-label="Calls and visits"
                            className="grid gap-2"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold">
                                    Calls and visits
                                </h3>
                                {lead.mayWrite ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setLogging(true)}
                                    >
                                        Log a call
                                    </Button>
                                ) : null}
                            </div>
                            <ContactList log={lead.log} />
                        </section>

                        {logging ? (
                            <LogCallSheet
                                leadId={lead.id}
                                leadName={lead.name}
                                followUpOn={lead.followUpOn}
                                onOpenChange={setLogging}
                                onLogged={(entry) =>
                                    changed(
                                        {
                                            ...lead,
                                            lastContactAt: entry.happenedAt,
                                        },
                                        `${CONTACT_LABEL[entry.kind]} logged on ${lead.name}.`,
                                    )
                                }
                            />
                        ) : null}
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}

function Facts({ lead, today }: { lead: LeadDetail; today: string }) {
    const due = followUpWords(lead, today);
    return (
        <dl className="grid gap-1.5 text-sm">
            <Row term="Looked after by">{ownerWords(lead)}</Row>
            {due ? (
                <Row term="Next">
                    <span
                        className={
                            lead.overdue
                                ? "font-semibold text-destructive"
                                : undefined
                        }
                    >
                        {due}
                    </span>
                </Row>
            ) : null}
            {lead.stage === "WON" && lead.wonOrganization ? (
                <Row term="Became">
                    {lead.wonOrganization.name}
                    {lead.wonAt ? ` · ${formatDate(lead.wonAt)}` : ""}
                </Row>
            ) : null}
            {lead.stage === "LOST" && lead.lostReason ? (
                <Row term="Lost because">{lead.lostReason}</Row>
            ) : null}
        </dl>
    );
}

function DetailList({ lead }: { lead: LeadDetail }) {
    return (
        <dl className="grid gap-1.5 text-sm">
            <Row term="Email">{lead.email ?? "Not known"}</Row>
            {lead.signUpEmail ? (
                <Row term="Sign-up email">{lead.signUpEmail}</Row>
            ) : null}
            <Row term="Phone">{lead.phone ?? "Not known"}</Row>
            <Row term="City">{lead.city ?? "Not known"}</Row>
            <Row term="Follow up on">
                {lead.followUpOn ? formatDate(lead.followUpOn) : "Not set"}
            </Row>
            <Row term="Came in">{formatDate(lead.createdAt)}</Row>
            {lead.notes ? (
                <Row term="Notes">
                    <span className="whitespace-pre-line">{lead.notes}</span>
                </Row>
            ) : null}
        </dl>
    );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[8.5rem_1fr] gap-2">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 break-words">{children}</dd>
        </div>
    );
}

function ContactList({ log }: { log: LeadContact[] }) {
    if (log.length === 0) {
        return (
            <EmptyState
                size="inline"
                title="No calls or visits yet"
                description="Log the first one after you talk to them."
            />
        );
    }
    return (
        <ol className="grid gap-3">
            {log.map((entry) => (
                <li key={entry.id} className="grid gap-0.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                            {CONTACT_LABEL[entry.kind]}
                        </Badge>
                        <span className="text-muted-foreground">
                            {formatDateTime(entry.happenedAt)}
                            {entry.minutes ? ` · ${entry.minutes} min` : ""}
                            {entry.by ? ` · ${entry.by}` : ""}
                        </span>
                    </div>
                    <p className="whitespace-pre-line">{entry.summary}</p>
                    {entry.feedback ? (
                        <p className="whitespace-pre-line text-muted-foreground">
                            About Saroh: {entry.feedback}
                        </p>
                    ) : null}
                </li>
            ))}
        </ol>
    );
}

/** Give an unowned lead to an account manager, with a reason (Support, Platform owner). */
function GiveToManager({
    lead,
    onGiven,
}: {
    lead: LeadDetail;
    onGiven: (card: LeadCard) => void;
}) {
    const [managers, setManagers] = useState<LeadManager[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        void leadManagersAction().then((result) => {
            if (!live) return;
            if (result.ok) setManagers(result.data);
            else setError(result.error);
        });
        return () => {
            live = false;
        };
    }, []);

    const none = managers !== null && managers.length === 0;
    return (
        <OperatorDialog
            trigger="Give to a manager…"
            title={`Give ${lead.name} to a manager?`}
            effect="They see it on their board and work it from here. It stays theirs; their name goes on it as given to them."
            disabled={managers === null || none}
            disabledReason={
                error ??
                (none
                    ? "Nobody holds the Account manager role yet."
                    : "Loading the account managers…")
            }
            fields={
                <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Account manager</span>
                    <select name="platformAdminId" className={SELECT} required>
                        {(managers ?? []).map((m) => (
                            <option
                                key={m.platformAdminId}
                                value={m.platformAdminId}
                            >
                                {m.name} · {m.openLeads} open
                            </option>
                        ))}
                    </select>
                </label>
            }
            submitLabel="Give the lead"
            onSubmit={async ({ reason, idempotencyKey, values }) => {
                const platformAdminId = values.platformAdminId ?? "";
                if (!platformAdminId) {
                    return { ok: false, error: "Pick an account manager." };
                }
                const result = await assignLeadAction({
                    id: lead.id,
                    platformAdminId,
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) return { ok: false, error: result.error };
                onGiven(result.data);
                return { ok: true };
            }}
        />
    );
}
