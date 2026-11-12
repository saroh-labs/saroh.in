"use client";

import type {
    WebhookDeliveryView,
    WebhookEndpointView,
    WebhookEvent,
} from "@saroh/api-contract";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { EmptyState } from "@saroh/ui/data-state";
import { Field } from "@saroh/ui/field";
import { FormSheet, FormSheetBody, FormSheetFoot } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { listTable, ListTable, ListTableHead } from "@saroh/ui/list-table";
import { Notice } from "@saroh/ui/notice";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronRight, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { relativeWhen } from "@/lib/notifications/when";
import {
    createWebhook,
    readDeliveries,
    removeWebhook,
    resendDelivery,
    rollWebhookSecret,
    testWebhook,
    updateWebhook,
} from "@/lib/webhooks/actions";
import {
    addressLine,
    endpointState,
    EVENT_WORDS,
    eventLabel,
} from "@/lib/webhooks/events";
import { SecretOnce } from "./secret-once";

export interface WebhooksProps {
    endpoints: WebhookEndpointView[];
    /** The events this person may subscribe to. */
    events: WebhookEvent[];
    count: number;
    cap: number | null;
    docs: string;
    zone: string;
}

const host = (url: string) => addressLine(url).split("/")[0] ?? url;
/** What a row and its sheet are called: the name the business gave it, else its host. */
const title = (e: WebhookEndpointView) => e.name ?? host(e.url);

/** "Last sent 4 minutes ago", with how it went when it didn't get through. */
export function lastSentLine(
    e: WebhookEndpointView,
    now: Date,
    zone: string,
): string | null {
    if (!e.lastSent) return null;
    const when = relativeWhen(e.lastSent.at, now, zone).toLowerCase();
    if (e.lastSent.status === "FAILED") return `Last try failed ${when}`;
    // A tried message still pending didn't get through, and is being tried again.
    if (e.lastSent.status === "PENDING")
        return `Trying again, last try ${when}`;
    return `Last sent ${when}`;
}

function EndpointStatus({ endpoint }: { endpoint: WebhookEndpointView }) {
    const state = endpointState(endpoint);
    if (state === "working")
        return (
            <Badge variant="success" size="sm">
                Working
            </Badge>
        );
    if (state === "turned-off")
        return (
            <Badge variant="error" size="sm">
                Turned off
            </Badge>
        );
    return (
        <Badge variant="neutral" size="sm">
            Off
        </Badge>
    );
}

function stateLine(e: WebhookEndpointView, zone: string): string | null {
    if (endpointState(e) !== "turned-off" || !e.disabledAt) return null;
    return `${formatDate(e.disabledAt, zone)}, after ${e.failureStreak} messages in a row failed`;
}

/**
 * Settings › API and AI apps › Notifications to your systems (webhooks)
 * ("API and AI apps" board 5): the addresses Saroh sends to, read first,
 * each opening its sheet (what it's told, Sending, the signing secret,
 * the latest messages with Resend, Send a test, Remove). The bell's
 * "turned off" notice lands here.
 */
export function Webhooks({
    endpoints,
    events,
    count,
    cap,
    docs,
    zone,
}: WebhooksProps) {
    const router = useRouter();
    const [openId, setOpenId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [secret, setSecret] = useState<string | null>(null);
    const opened = endpoints.find((e) => e.id === openId) ?? null;
    const turnedOff = endpoints.filter(
        (e) => endpointState(e) === "turned-off",
    );
    const full = cap !== null && count >= cap;
    const now = new Date();

    const add = full ? null : (
        <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            Add an address
        </Button>
    );

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
                <p className="min-w-0 flex-1 basis-[280px] text-[13.5px] text-foreground/80">
                    Saroh tells your systems the moment something happens. The
                    address your payment provider sends updates to is in{" "}
                    <Link
                        data-ph-unmask=""
                        href="/settings/providers"
                        className="font-semibold underline underline-offset-[3px]"
                    >
                        Settings › Providers
                    </Link>
                    .
                </p>
                <span className="text-[12.5px] text-muted-foreground">
                    {cap
                        ? `${count} of ${cap} addresses`
                        : `${count} ${count === 1 ? "address" : "addresses"}`}
                </span>
                {endpoints.length > 0 ? add : null}
            </div>

            {turnedOff.length > 0 ? (
                <Notice
                    tone="warning"
                    title={`${title(turnedOff[0])} was turned off.`}
                >
                    {turnedOff.length === 1
                        ? "Saroh stopped sending after too many messages in a row failed. Open it and send a test. Once one gets through, it turns back on."
                        : `${turnedOff.length} addresses were turned off after too many messages in a row failed. Open each to turn it back on.`}
                </Notice>
            ) : null}

            {endpoints.length === 0 ? (
                <EmptyState
                    size="panel"
                    icon={<Send />}
                    title="No addresses yet"
                    description="Add your system's address and Saroh tells it about new bookings, orders, customers and enquiries."
                    action={add ?? undefined}
                />
            ) : (
                <ListTable>
                    <ListTableHead className="hidden grid-cols-[2fr_1.8fr_0.9fr_44px] gap-3 sm:grid">
                        <span data-ph-unmask="">Name and address</span>
                        <span data-ph-unmask="">State</span>
                        <span data-ph-unmask="">Sends</span>
                        <span />
                    </ListTableHead>
                    <ul>
                        {endpoints.map((e) => {
                            const line =
                                stateLine(e, zone) ??
                                lastSentLine(e, now, zone);
                            return (
                                <li key={e.id} className={listTable.rule}>
                                    <button
                                        type="button"
                                        aria-label={`Open ${title(e)}`}
                                        onClick={() => setOpenId(e.id)}
                                        className={cn(
                                            listTable.rowInner,
                                            listTable.pressable,
                                            "grid min-h-[62px] w-full grid-cols-[1fr_auto] items-center gap-3 text-left text-[13.5px] sm:grid-cols-[2fr_1.8fr_0.9fr_44px]",
                                            e.id === openId &&
                                                listTable.selected,
                                        )}
                                    >
                                        <span
                                            className="min-w-0"
                                            data-ph-mask=""
                                        >
                                            <span className="block font-semibold">
                                                {title(e)}
                                            </span>
                                            <span className="block truncate font-mono text-[12px] text-muted-foreground">
                                                {addressLine(e.url)}
                                            </span>
                                            <span className="block text-[12.5px] text-muted-foreground sm:hidden">
                                                {e.events.length} kinds
                                                {line ? ` · ${line}` : ""}
                                            </span>
                                        </span>
                                        <span className="flex flex-col items-end gap-0.5 sm:items-start">
                                            <EndpointStatus endpoint={e} />
                                            {line ? (
                                                <span className="text-[12.5px] text-muted-foreground max-sm:hidden">
                                                    {line}
                                                </span>
                                            ) : null}
                                        </span>
                                        <span className="max-sm:hidden">
                                            {e.events.length} kinds
                                        </span>
                                        <ChevronRight
                                            aria-hidden
                                            className="size-4 justify-self-end text-muted-foreground max-sm:hidden"
                                        />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </ListTable>
            )}

            <EndpointSheet
                endpoint={opened}
                events={events}
                zone={zone}
                onClose={() => setOpenId(null)}
                onSecret={(s) => {
                    setOpenId(null);
                    setSecret(s);
                }}
            />
            <AddSheet
                open={adding}
                events={events}
                onClose={() => setAdding(false)}
                onAdded={(s) => {
                    setAdding(false);
                    setSecret(s);
                }}
            />
            <SecretOnce
                secret={secret}
                title="Copy your signing secret now"
                lead="Your developer uses it to check messages come from Saroh. This is the only time Saroh shows it."
                note="Keep it where your server keeps its secrets. If someone else sees it, replace it: the old one keeps signing for 24 hours."
                guide={{
                    label: "How to check a message",
                    href: `${docs}/api/webhooks`,
                }}
                thing="secret"
                onDone={() => {
                    setSecret(null);
                    router.refresh();
                }}
            />
        </div>
    );
}

function NameField({
    value,
    onChange,
}: {
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <Field
            label="Name"
            hint="Optional. So you know what it's for, like Order sync."
        >
            <Input
                value={value}
                maxLength={80}
                onChange={(ev) => onChange(ev.target.value)}
            />
        </Field>
    );
}

function EventPicker({
    events,
    picked,
    onChange,
}: {
    events: WebhookEvent[];
    picked: Set<string>;
    onChange: (next: Set<string>) => void;
}) {
    return (
        <Field
            label="Tell it when"
            group
            hint="Only the records you can see yourself."
        >
            <div className="grid gap-x-2.5 gap-y-1 rounded-[10px] border border-border bg-card p-3 sm:grid-cols-2">
                {events.map((e) => (
                    <CheckRow
                        key={e}
                        className="items-start"
                        checked={picked.has(e)}
                        onChange={(on) => {
                            const next = new Set(picked);
                            if (on) next.add(e);
                            else next.delete(e);
                            onChange(next);
                        }}
                    >
                        <span>
                            {EVENT_WORDS[e].label}
                            <span className="block font-mono text-[11.5px] text-muted-foreground">
                                {e}
                            </span>
                        </span>
                    </CheckRow>
                ))}
            </div>
        </Field>
    );
}

function AddSheet({
    open,
    events,
    onClose,
    onAdded,
}: {
    open: boolean;
    events: WebhookEvent[];
    onClose: () => void;
    onAdded: (secret: string) => void;
}) {
    return (
        <FormSheet
            open={open}
            title="Add an address"
            description="Where Saroh sends a message when something happens."
            onClose={onClose}
            key={open ? "open" : "closed"}
        >
            {open ? <AddFields events={events} onAdded={onAdded} /> : null}
        </FormSheet>
    );
}

function AddFields({
    events,
    onAdded,
}: {
    events: WebhookEvent[];
    onAdded: (s: string) => void;
}) {
    const [url, setUrl] = useState("https://");
    const [name, setName] = useState("");
    const [picked, setPicked] = useState<Set<string>>(new Set(events));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setError(null);
        if (picked.size === 0)
            return setError("Choose at least one thing to tell it.");
        const res = await runAction(
            () =>
                createWebhook({
                    url: url.trim(),
                    name: name.trim() || null,
                    events: Array.from(picked) as WebhookEvent[],
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        onAdded(res.data.secret);
    }

    return (
        <>
            <FormSheetBody>
                <NameField value={name} onChange={setName} />
                <Field
                    label="Address"
                    hint="An https address on your own server, like https://hooks.example.com/saroh."
                    error={error}
                >
                    <Input
                        value={url}
                        inputMode="url"
                        onChange={(e) => setUrl(e.target.value)}
                    />
                </Field>
                <EventPicker
                    events={events}
                    picked={picked}
                    onChange={setPicked}
                />
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Add address"
                savingLabel="Adding…"
                pending={busy}
                onSubmit={() => submit()}
            />
        </>
    );
}

function EndpointSheet({
    endpoint: e,
    events,
    zone,
    onClose,
    onSecret,
}: {
    endpoint: WebhookEndpointView | null;
    events: WebhookEvent[];
    zone: string;
    onClose: () => void;
    onSecret: (secret: string) => void;
}) {
    return (
        <FormSheet
            open={e !== null}
            title={e ? title(e) : ""}
            description={e ? addressLine(e.url) : ""}
            onClose={onClose}
            key={e?.id ?? "closed"}
        >
            {e ? (
                <EndpointFields
                    endpoint={e}
                    events={events}
                    zone={zone}
                    onClose={onClose}
                    onSecret={onSecret}
                />
            ) : null}
        </FormSheet>
    );
}

function EndpointFields({
    endpoint: e,
    events,
    zone,
    onClose,
    onSecret,
}: {
    endpoint: WebhookEndpointView;
    events: WebhookEvent[];
    zone: string;
    onClose: () => void;
    onSecret: (secret: string) => void;
}) {
    const router = useRouter();
    const [enabled, setEnabled] = useState(e.enabled);
    const [name, setName] = useState(e.name ?? "");
    // Events it already sends stay listed even when the person can't add them.
    const shown = Array.from(
        new Set([...events, ...(e.events as WebhookEvent[])]),
    ).filter((x) => x in EVENT_WORDS);
    const [picked, setPicked] = useState<Set<string>>(new Set(e.events));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [rolling, setRolling] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [log, setLog] = useState<WebhookDeliveryView[] | null | "loading">(
        "loading",
    );
    const turnedOff = endpointState(e) === "turned-off";
    const now = new Date();

    async function load() {
        setLog("loading");
        setLog(await readDeliveries(e.id).catch(() => null));
    }
    // Read once, when the sheet opens on this address.
    useEffect(() => {
        let live = true;
        void readDeliveries(e.id)
            .catch(() => null)
            .then((rows) => {
                if (live) setLog(rows);
            });
        return () => {
            live = false;
        };
    }, [e.id]);

    async function submit() {
        setError(null);
        if (picked.size === 0)
            return setError("Choose at least one thing to tell it.");
        const res = await runAction(
            () =>
                updateWebhook(e.id, {
                    name: name.trim() || null,
                    events: Array.from(picked) as WebhookEvent[],
                    // Only when changed: a test may have turned it on meanwhile.
                    ...(enabled !== e.enabled ? { enabled } : {}),
                }),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) return setError(res.error);
        showSuccess("Saved.");
        onClose();
        router.refresh();
    }

    async function test() {
        const res = await runAction(() => testWebhook(e.id), {
            setBusy: setTesting,
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            e.enabled
                ? "Test sent. It shows below once it's answered."
                : "Test sent. If it gets through, the address turns back on.",
        );
        await load();
    }

    async function resend(id: string) {
        const res = await runAction(() => resendDelivery(e.id, id));
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess("Sent again.");
        await load();
    }

    async function roll() {
        const res = await runAction(() => rollWebhookSecret(e.id), {
            setBusy: setRolling,
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onSecret(res.data.secret);
    }

    async function remove() {
        const res = await runAction(() => removeWebhook(e.id));
        if (!res) return false;
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess(`${title(e)} is removed.`);
        onClose();
        router.refresh();
        return true;
    }

    return (
        <>
            <FormSheetBody>
                {turnedOff && e.disabledAt ? (
                    <Notice
                        tone="warning"
                        title={`Turned off ${formatDate(e.disabledAt, zone, { now })} after ${e.failureStreak} messages in a row failed.`}
                    >
                        Send a test. If it gets through, it turns back on.
                    </Notice>
                ) : null}
                <NameField value={name} onChange={setName} />
                <CheckRow
                    checked={enabled}
                    onChange={setEnabled}
                    className="items-start rounded-[10px] border border-border bg-card p-3"
                >
                    <span>
                        <b className="block text-[13.5px]">Sending</b>
                        <span
                            data-ph-unmask=""
                            className="text-[12.5px] text-muted-foreground"
                        >
                            {enabled
                                ? "Saroh sends to this address."
                                : "Off. Turns on once a test gets through."}
                        </span>
                    </span>
                </CheckRow>
                <EventPicker
                    events={shown}
                    picked={picked}
                    onChange={setPicked}
                />
                {error ? (
                    <p role="alert" className="text-[13px] text-destructive">
                        {error}
                    </p>
                ) : null}
                <div>
                    <span
                        data-ph-unmask=""
                        className="mb-1.5 block text-[13px] font-semibold"
                    >
                        Signing secret
                    </span>
                    <div className="flex items-center gap-2">
                        <span
                            data-ph-unmask=""
                            data-ph-block=""
                            className="flex h-10 min-w-0 flex-1 items-center rounded-[9px] border border-border bg-muted px-3 font-mono text-[13px]"
                        >
                            whsec_••••••••••••
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            busy={rolling}
                            busyLabel="Replacing…"
                            onClick={() => void roll()}
                        >
                            Replace
                        </Button>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                        {e.previousSecretUntil
                            ? `The old secret signs too until ${formatDateTime(e.previousSecretUntil, zone)}.`
                            : "Your developer uses it to check messages come from Saroh."}
                    </p>
                </div>
                <div>
                    <div className="mb-1.5 flex items-center gap-2">
                        <span
                            data-ph-unmask=""
                            className="text-[13px] font-semibold"
                        >
                            Latest messages
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="ml-auto"
                            busy={testing}
                            busyLabel="Sending…"
                            onClick={() => void test()}
                        >
                            Send a test
                        </Button>
                    </div>
                    {log === "loading" ? (
                        <p
                            data-ph-unmask=""
                            className="text-[12.5px] text-muted-foreground"
                            aria-busy="true"
                        >
                            Loading messages…
                        </p>
                    ) : log === null ? (
                        <p
                            className="text-[12.5px] text-muted-foreground"
                            role="alert"
                        >
                            Couldn't load the messages.{" "}
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                onClick={() => void load()}
                            >
                                Try again
                            </Button>
                        </p>
                    ) : log.length === 0 ? (
                        <EmptyState
                            size="inline"
                            title="No messages yet"
                            description="Send a test to see one here."
                        />
                    ) : (
                        <ul
                            className="overflow-hidden rounded-[10px] border border-border bg-card"
                            data-delivery-log=""
                        >
                            {log.map((d) => (
                                <li
                                    key={d.id}
                                    className="flex min-h-[52px] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                                >
                                    <span className="min-w-0 flex-1 text-[13.5px]">
                                        {eventLabel(d.event)}
                                        <span className="block text-[12.5px] text-muted-foreground">
                                            {relativeWhen(
                                                d.lastAttemptAt ?? d.createdAt,
                                                now,
                                                zone,
                                            )}{" "}
                                            · {deliveryWords(d)}
                                        </span>
                                    </span>
                                    {d.status === "PENDING" ? null : (
                                        <Button
                                            type="button"
                                            variant="link"
                                            size="sm"
                                            onClick={() => void resend(d.id)}
                                        >
                                            Resend
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </FormSheetBody>
            <FormSheetFoot
                pending={busy}
                onSubmit={() => submit()}
                extra={
                    <Button
                        type="button"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setRemoving(true)}
                    >
                        Remove address
                    </Button>
                }
            />
            <ConfirmDialog
                open={removing}
                onOpenChange={setRemoving}
                title={`Remove ${title(e)}?`}
                description="Saroh stops sending to it now, and its message log goes with it. This cannot be undone."
                confirmLabel="Remove address"
                busyLabel="Removing…"
                keepLabel="Keep address"
                onConfirm={remove}
            />
        </>
    );
}

function deliveryWords(d: WebhookDeliveryView): string {
    if (d.status === "DELIVERED") return "Delivered";
    if (d.status === "PENDING")
        return d.attempts > 0
            ? `Trying again (${d.attempts} tries so far)`
            : "On its way";
    const why = d.lastStatusCode
        ? `server error ${d.lastStatusCode}`
        : (d.lastError ?? "no answer");
    return `Failed (${why}) after ${d.attempts} ${d.attempts === 1 ? "try" : "tries"}`;
}
