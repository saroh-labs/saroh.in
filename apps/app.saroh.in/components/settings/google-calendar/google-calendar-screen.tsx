"use client";

import { Button } from "@saroh/ui/button";
import { FormSheet } from "@saroh/ui/form-sheet";
import { IconButton } from "@saroh/ui/icon-button";
import { IntentLink } from "@saroh/ui/intent-link";
import { Notice } from "@saroh/ui/notice";
import {
    CalendarDays,
    CalendarSearch,
    ChevronRight,
    Plus,
    Video,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PlanWay } from "@/components/billing/plan-way";
import { MeetAccessChoice } from "@/components/shared/google-meet/meet-access-choice";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { runAction } from "@/lib/api/run-action";
import { saveBusinessMeetAccess } from "@/lib/google-calendar/actions";
import type {
    CalendarAccount,
    CalendarStatus,
    MeetAccess,
} from "@/lib/google-calendar/types";
import type { OutcomeMessage } from "@/lib/google-calendar/words";
import {
    accountLine,
    accountPill,
    bookingsGoToWords,
    GC_WORDS,
    MEET_ACCESS_WORDS,
    outcomeMessage,
    pausedWords,
    roomForAnother,
} from "@/lib/google-calendar/words";
import { planLabel } from "@saroh/ui/lib/state-copy";

import { AccountSheet } from "./account-sheet";
import { BookingsSheet } from "./bookings-sheet";
import { useConnect } from "./use-connect";

/**
 * Settings › Google Calendar's body (boards GC2Entry, GC2Connected,
 * GC2Accounts, GC2Disconnected, GC2Reconnected): one message at a time at
 * the top (what came back from Google, a disconnect, a move), then either
 * the Connect card or Bookings (where they go, Change) and Google accounts
 * (rows that open their sheet; a lapsed one reconnects in its own row),
 * and the business's "Who can join" for whoever may change services.
 */
export function GoogleCalendarScreen({
    status,
    outcome,
    morePlan,
    mayMeetAccess,
}: {
    status: CalendarStatus;
    outcome: string | null;
    /** The plan with more Google accounts, by name (never a count). */
    morePlan: { name: string; href: string } | null;
    mayMeetAccess: boolean;
}) {
    const [message, setMessage] = useState<OutcomeMessage | null>(() =>
        outcomeMessage(outcome, status, morePlan?.name),
    );
    const [opened, setOpened] = useState<string | null>(null);
    const [changing, setChanging] = useState(false);
    const [lastEmail, setLastEmail] = useState<string | null>(null);

    // Said once: a reload doesn't say it again.
    useEffect(() => {
        if (!outcome) return;
        const url = new URL(window.location.href);
        url.searchParams.delete("calendar");
        window.history.replaceState(null, "", url.toString());
    }, [outcome]);

    const say = (m: OutcomeMessage) => {
        setMessage(m);
        window.scrollTo({ top: 0 });
    };
    const account = status.accounts.find((a) => a.id === opened) ?? null;
    const connected = status.state !== "NOT_CONNECTED";
    const paused = status.state === "PAUSED" ? status.pausedBecause : null;

    return (
        <div className="grid max-w-[904px] gap-7">
            {message ? (
                <Notice
                    tone={message.tone}
                    title={message.title}
                    action={
                        <IconButton
                            label="Dismiss"
                            variant="ghost"
                            size="sm"
                            icon={<X />}
                            onClick={() => setMessage(null)}
                        />
                    }
                >
                    {message.body}
                    {message.plan && morePlan ? (
                        <>
                            {" "}
                            <PlanWay>
                                <IntentLink
                                    href={morePlan.href}
                                    className="font-semibold underline underline-offset-2"
                                >
                                    {planLabel(morePlan.name)}
                                </IntentLink>
                            </PlanWay>
                        </>
                    ) : null}
                </Notice>
            ) : paused ? (
                <Notice tone="neutral" title={pausedWords(paused).title}>
                    {pausedWords(paused).body}
                </Notice>
            ) : null}

            {!connected ? (
                <ConnectCard
                    again={lastEmail}
                    onFailed={(error) =>
                        say({
                            tone: "error",
                            title: "Couldn't open Google",
                            body: error,
                        })
                    }
                />
            ) : (
                <>
                    <Section title={GC_WORDS.bookings}>
                        <BookingsCard
                            status={status}
                            onChange={() => setChanging(true)}
                        />
                    </Section>
                    <Section title={GC_WORDS.accounts}>
                        <div className="overflow-hidden rounded-lg border border-border bg-card">
                            {status.accounts.map((a) => (
                                <AccountRow
                                    key={a.id}
                                    account={a}
                                    onOpen={() => {
                                        setLastEmail(a.googleEmail);
                                        setOpened(a.id);
                                    }}
                                    onFailed={(error) =>
                                        say({
                                            tone: "error",
                                            title: "Couldn't open Google",
                                            body: error,
                                        })
                                    }
                                />
                            ))}
                            {roomForAnother(status) && !paused ? (
                                <AddAccountRow
                                    onFailed={(error) =>
                                        say({
                                            tone: "error",
                                            title: "Couldn't open Google",
                                            body: error,
                                        })
                                    }
                                />
                            ) : null}
                        </div>
                        {!roomForAnother(status) && morePlan ? (
                            <PlanWay fallback={null}>
                                <p className="m-0 mt-3 text-[13px] text-muted-foreground">
                                    Busy times from more Google accounts come
                                    with {morePlan.name}.{" "}
                                    <IntentLink
                                        href={morePlan.href}
                                        className="ml-1 font-semibold text-foreground underline underline-offset-2"
                                    >
                                        {planLabel(morePlan.name)}
                                    </IntentLink>
                                </p>
                            </PlanWay>
                        ) : null}
                    </Section>
                </>
            )}

            {mayMeetAccess ? (
                <Section title={GC_WORDS.meet}>
                    <MeetDefault value={status.meetAccess} />
                </Section>
            ) : null}

            <AccountSheet
                account={account}
                status={status}
                onClose={() => setOpened(null)}
                onSaid={say}
            />
            {connected ? (
                <BookingsSheet
                    status={status}
                    open={changing}
                    onClose={() => setChanging(false)}
                    onSaid={say}
                />
            ) : null}
        </div>
    );
}

function Section({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="grid min-w-0 gap-3">
            <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em]">
                {title}
            </h2>
            <div className="min-w-0">{children}</div>
        </section>
    );
}

/** Google's consent page: the one place Saroh sends anyone away to. */
function ConnectCard({
    again,
    onFailed,
}: {
    /** The account just disconnected: connecting it again picks its bookings up. */
    again: string | null;
    onFailed: (error: string) => void;
}) {
    const { busy, go } = useConnect(onFailed);
    const icons = [CalendarDays, Video, CalendarSearch];
    return (
        <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:p-[22px]">
            <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em]">
                {GC_WORDS.connectTitle}
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0">
                {GC_WORDS.facts.map((f, i) => {
                    const Icon = icons[i] ?? CalendarDays;
                    return (
                        <li key={f.lead} className="flex gap-3 text-[14px]">
                            <Icon
                                aria-hidden
                                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            />
                            <span>
                                <strong className="font-semibold">
                                    {f.lead}
                                </strong>{" "}
                                {f.rest}
                            </span>
                        </li>
                    );
                })}
            </ul>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button type="button" disabled={busy} onClick={() => go()}>
                    {busy ? GC_WORDS.connecting : GC_WORDS.connect}
                </Button>
                <p className="m-0 min-w-0 max-w-[420px] flex-1 text-[12.5px] text-muted-foreground">
                    {again
                        ? `Connect ${again} again and your upcoming bookings go back on, with the same Meet links.`
                        : GC_WORDS.consentNote}
                </p>
            </div>
        </section>
    );
}

function BookingsCard({
    status,
    onChange,
}: {
    status: CalendarStatus;
    onChange: () => void;
}) {
    const words = bookingsGoToWords(status);
    const canChange = status.accounts.some((a) => a.state === "CONNECTED");
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
            <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted"
            >
                <CalendarDays className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold">{words.title}</p>
                <p className="m-0 break-words text-[13px] text-muted-foreground">
                    {words.line}
                </p>
            </div>
            {canChange ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onChange}
                >
                    {status.bookingsGoTo ? GC_WORDS.change : GC_WORDS.choose}
                </Button>
            ) : null}
        </div>
    );
}

function Monogram({ lapsed }: { lapsed: boolean }) {
    return (
        <span
            aria-hidden
            data-ph-unmask=""
            className={
                lapsed
                    ? "flex size-9 shrink-0 items-center justify-center rounded-full border border-warning bg-warning-subtle text-[13px] font-semibold text-warning-subtle-foreground"
                    : "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[13px] font-semibold"
            }
        >
            G
        </span>
    );
}

function AccountRow({
    account,
    onOpen,
    onFailed,
}: {
    account: CalendarAccount;
    onOpen: () => void;
    onFailed: (error: string) => void;
}) {
    const { busy, go } = useConnect(onFailed);
    const pill = accountPill(account);
    const lapsed = account.state === "LAPSED";
    const body = (
        <>
            <Monogram lapsed={lapsed} />
            <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-all text-[14px] font-semibold">
                        {account.googleEmail}
                    </span>
                    <StatusBadge tone={pill.tone} dot>
                        {pill.label}
                    </StatusBadge>
                </span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">
                    {accountLine(account)}
                </span>
            </span>
        </>
    );
    const row =
        "flex w-full items-center gap-3 border-b border-border px-4 py-3.5 text-left last:border-b-0";
    if (lapsed) {
        return (
            <div className={`${row} flex-wrap`}>
                {body}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => go()}
                >
                    {busy ? GC_WORDS.connecting : GC_WORDS.reconnect}
                </Button>
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`${account.googleEmail}: ${pill.label}. Open its calendars`}
            className={`${row} transition-colors hover:bg-muted/60 active:bg-accent-active coarse:min-h-11`}
        >
            {body}
            <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
            />
        </button>
    );
}

function AddAccountRow({ onFailed }: { onFailed: (error: string) => void }) {
    const { busy, go } = useConnect(onFailed);
    return (
        <button
            type="button"
            disabled={busy}
            onClick={() => go()}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-semibold transition-colors hover:bg-muted/60 active:bg-accent-active coarse:min-h-11"
        >
            <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong"
            >
                <Plus className="size-4" />
            </span>
            {busy ? GC_WORDS.connecting : GC_WORDS.addAccount}
        </button>
    );
}

/** The business's own "Who can join", for whoever may change services. */
function MeetDefault({ value }: { value: MeetAccess }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<MeetAccess>(value);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setError(null);
        const res = await runAction(() => saveBusinessMeetAccess(draft), {
            setBusy: setPending,
            onUnreached: setError,
            quiet: true,
        });
        if (!res) return;
        if (!res.ok) return setError(res.error);
        setOpen(false);
        router.refresh();
    }

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
            <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold">
                    Who can join: {MEET_ACCESS_WORDS[value].label}
                </p>
                <p
                    data-ph-unmask=""
                    className="m-0 text-[13px] text-muted-foreground"
                >
                    For every Meet Saroh makes, unless a service or a booking
                    says otherwise.
                </p>
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                    setDraft(value);
                    setError(null);
                    setOpen(true);
                }}
            >
                {GC_WORDS.change}
            </Button>
            <FormSheet
                open={open}
                title="Who can join a Google Meet"
                description="Your business's default. Upcoming Meets that follow it change too."
                pending={pending}
                dirty={draft !== value}
                onClose={() => setOpen(false)}
                onSubmit={() => save()}
            >
                <MeetAccessChoice value={draft} onChange={setDraft} />
                {error ? (
                    <p
                        role="alert"
                        className="m-0 text-[13px] text-destructive"
                    >
                        {error}
                    </p>
                ) : null}
            </FormSheet>
        </div>
    );
}
