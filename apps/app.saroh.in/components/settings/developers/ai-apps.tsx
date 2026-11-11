"use client";

import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { CopyButton } from "@saroh/ui/copy-button";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { listTable, ListTable, ListTableHead } from "@saroh/ui/list-table";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { Check, ChevronRight, ExternalLink, Lock, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { disconnectAiConnection } from "@/lib/ai-connections/actions";
import { CONNECT_IN } from "@/lib/ai-connections/mcp-address";
import type { AiConnection } from "@/lib/ai-connections/types";
import { runAction } from "@/lib/api/run-action";
import { formatDateTime } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { relativeWhen } from "@/lib/notifications/when";

const CAN = [
    "Build and edit pages as a draft, and show you a preview",
    "Publish only after asking you",
    "Add and update products, services, prices and hours",
    "See, create and move bookings and orders",
];
const CANT = [
    "Cancel or refund anything",
    "See sensitive customer details, like health notes",
    "Change your plan, team or payment settings",
];
const ASKS = [
    "“Add our new seasonal special and set its price”",
    "“Change our Sunday hours to 8 till 2”",
    "“Who's booked on Saturday?”",
    "“Move tomorrow's 10 o'clock booking to Friday”",
];

export interface AiAppsProps {
    connections: AiConnection[];
    business: string;
    selfId: string;
    /** Sees and ends everyone's (`apikey:manage`). */
    owner: boolean;
    mcp: string | null;
    docs: string;
    zone: string;
}

const appName = (c: AiConnection) => c.app.name ?? "An AI app";
const personName = (c: AiConnection, selfId: string) =>
    c.person.id === selfId ? "You" : (c.person.name ?? "Someone");

/** The app's mark: its first letter, quiet. Not the app's own brand. */
function AppMark({ name, small }: { name: string; small?: boolean }) {
    return (
        <span
            aria-hidden
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-lg bg-foreground font-bold text-background",
                small ? "size-[22px] text-[10px]" : "size-[30px] text-[12px]",
            )}
        >
            {name.slice(0, 1).toUpperCase()}
        </span>
    );
}

function ConnectButtons({ column }: { column?: boolean }) {
    return (
        <div
            className={cn(
                "flex gap-2",
                column ? "flex-col" : "flex-col sm:flex-row",
            )}
        >
            <Button asChild className="w-full coarse:min-h-11">
                <a href={CONNECT_IN.claude} target="_blank" rel="noreferrer">
                    <AppMark name="Claude" small />
                    Connect in Claude
                </a>
            </Button>
            <Button
                asChild
                variant="outline"
                className="w-full coarse:min-h-11"
            >
                <a href={CONNECT_IN.chatgpt} target="_blank" rel="noreferrer">
                    <AppMark name="ChatGPT" small />
                    Connect in ChatGPT
                </a>
            </Button>
        </div>
    );
}

function McpAddress({ mcp }: { mcp: string | null }) {
    if (!mcp) return null;
    return (
        <div>
            <Field
                label={
                    <>
                        Using another AI app? Paste this address into it
                        <small
                            data-ph-unmask=""
                            className="ml-1.5 text-[11.5px] font-medium text-muted-foreground"
                        >
                            MCP server
                        </small>
                    </>
                }
            >
                {(control) => (
                    <div className="flex items-center gap-2">
                        <Input
                            {...control}
                            readOnly
                            value={mcp}
                            className="min-w-0 flex-1 bg-muted font-mono text-[13px]"
                        />
                        <CopyButton value={mcp} label="Copy" thing="address" />
                    </div>
                )}
            </Field>
        </div>
    );
}

function CanAndCant() {
    return (
        <div className="space-y-3 text-[13.5px] leading-snug text-foreground/80">
            <div>
                <h4
                    data-ph-unmask=""
                    className="mb-2 text-[13px] font-semibold text-foreground"
                >
                    It can
                </h4>
                <ul className="space-y-2">
                    {CAN.map((line) => (
                        <li key={line} className="flex gap-2">
                            <Check
                                aria-hidden
                                className="mt-px size-4 shrink-0 text-success"
                            />
                            {line}
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <h4
                    data-ph-unmask=""
                    className="mb-2 text-[13px] font-semibold text-foreground"
                >
                    It can’t
                </h4>
                <ul className="space-y-2">
                    {CANT.map((line) => (
                        <li key={line} className="flex gap-2">
                            <X
                                aria-hidden
                                className="mt-px size-4 shrink-0 text-destructive"
                            />
                            {line}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/**
 * Settings › API and AI apps › AI assistants ("API and AI apps" boards 1
 * and 2). Nothing connected: how to run the business from a chat, what an
 * assistant can and can't do, and the MCP address. Connected: the
 * connections (the Owner's every one, anyone else's own), each opening a
 * sheet with Disconnect from this business.
 */
export function AiApps(props: AiAppsProps) {
    const { connections, business, selfId, owner, mcp, docs, zone } = props;
    const [openId, setOpenId] = useState<string | null>(null);
    const open = connections.find((c) => c.id === openId) ?? null;
    const now = new Date();

    if (connections.length === 0) {
        return (
            <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-[22px]">
                    <h2
                        className="font-display text-[21px] font-semibold"
                        data-ph-mask=""
                    >
                        Run {business} from a chat
                    </h2>
                    <p
                        data-ph-unmask=""
                        className="mt-1.5 text-[14px] leading-normal text-foreground/80"
                    >
                        Connect Claude or ChatGPT and ask in your own words.
                        That sounds like:
                    </p>
                    <ul className="mt-3 space-y-2">
                        {ASKS.map((ask) => (
                            <li
                                key={ask}
                                className="rounded-[10px] border border-border bg-muted px-3 py-2.5 text-[14px] leading-snug"
                            >
                                {ask}
                            </li>
                        ))}
                    </ul>
                    <div className="mt-[18px] max-w-[520px]">
                        <ConnectButtons />
                    </div>
                    <p
                        data-ph-unmask=""
                        className="mt-2 text-[12.5px] text-muted-foreground"
                    >
                        You sign in to Saroh and pick the businesses it may use
                        when the app asks. Takes about a minute.
                    </p>
                </section>
                <aside className="flex min-w-0 flex-col gap-3.5 self-start rounded-xl border border-border bg-card p-4">
                    <h3 data-ph-unmask="" className="text-[15px] font-semibold">
                        What an assistant can do here
                    </h3>
                    <CanAndCant />
                    <Notice tone="neutral" icon={<Lock />}>
                        Website changes stay a draft until you say publish, and
                        you can roll the draft back. An assistant can do only
                        what you can do here. What it reads is sent to the
                        company behind that app.
                    </Notice>
                    <McpAddress mcp={mcp} />
                    <a
                        href={`${docs}/api/ai-apps`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 self-start text-[13px] font-semibold underline decoration-border-strong underline-offset-[3px]"
                    >
                        How assistants work with Saroh
                        <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                </aside>
            </div>
        );
    }

    return (
        <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
                <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                    <h2 className="text-[15px] font-semibold" data-ph-mask="">
                        {owner
                            ? `Connected to ${business}`
                            : `Your assistants on ${business}`}
                    </h2>
                    <span className="text-[12.5px] text-muted-foreground">
                        {count(connections.length, "assistant")}
                    </span>
                </div>
                <ListTable>
                    <ListTableHead className="hidden grid-cols-[2fr_1.6fr_1fr_44px] gap-3 sm:grid">
                        <span data-ph-unmask="">Assistant</span>
                        <span data-ph-unmask="">Connected by</span>
                        <span data-ph-unmask="">Last used</span>
                        <span />
                    </ListTableHead>
                    <ul>
                        {connections.map((c) => (
                            <li key={c.id} className={listTable.rule}>
                                <button
                                    type="button"
                                    onClick={() => setOpenId(c.id)}
                                    aria-label={`Open ${appName(c)} connected by ${personName(c, selfId)}`}
                                    className={cn(
                                        listTable.rowInner,
                                        listTable.pressable,
                                        "grid min-h-14 w-full grid-cols-[1fr_20px] items-center gap-3 text-left text-[13.5px] sm:grid-cols-[2fr_1.6fr_1fr_44px]",
                                        c.id === openId && listTable.selected,
                                    )}
                                >
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <AppMark name={appName(c)} />
                                        <span className="min-w-0">
                                            <span className="block font-semibold">
                                                {appName(c)}
                                            </span>
                                            <span className="block text-[12.5px] text-muted-foreground">
                                                <span
                                                    className="sm:hidden"
                                                    data-ph-mask=""
                                                >
                                                    {personName(c, selfId)} ·{" "}
                                                    {c.lastUsedAt
                                                        ? relativeWhen(
                                                              c.lastUsedAt,
                                                              now,
                                                              zone,
                                                          )
                                                        : "Not used yet"}
                                                </span>
                                                <span className="max-sm:hidden">
                                                    {c.connectedAt
                                                        ? `Connected ${relativeWhen(c.connectedAt, now, zone)}`
                                                        : null}
                                                </span>
                                            </span>
                                        </span>
                                    </span>
                                    <span
                                        className="max-sm:hidden"
                                        data-ph-mask=""
                                    >
                                        {c.person.name ?? "Someone"}
                                        {c.person.id === selfId ? (
                                            <span className="block text-[12.5px] text-muted-foreground">
                                                You
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="text-muted-foreground max-sm:hidden">
                                        {c.lastUsedAt
                                            ? relativeWhen(
                                                  c.lastUsedAt,
                                                  now,
                                                  zone,
                                              )
                                            : "Not used yet"}
                                    </span>
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 justify-self-end text-muted-foreground"
                                    />
                                </button>
                            </li>
                        ))}
                    </ul>
                </ListTable>
                <p className="mt-2.5 text-[12.5px] text-muted-foreground">
                    Open one to see when it was used, or disconnect it.
                    {owner ? null : " Only your own connections show here."}
                </p>
            </section>
            <aside className="flex min-w-0 flex-col gap-3 self-start rounded-xl border border-border bg-card p-4">
                <h3 data-ph-unmask="" className="text-[15px] font-semibold">
                    Connect another
                </h3>
                <p
                    data-ph-unmask=""
                    className="text-[13.5px] leading-normal text-foreground/80"
                >
                    Each person connects their own. It can do only what they can
                    do here.
                </p>
                <ConnectButtons column />
                <McpAddress mcp={mcp} />
            </aside>
            <ConnectionSheet
                connection={open}
                business={business}
                selfId={selfId}
                zone={zone}
                onClose={() => setOpenId(null)}
            />
        </div>
    );
}

function ConnectionSheet({
    connection,
    business,
    selfId,
    zone,
    onClose,
}: {
    connection: AiConnection | null;
    business: string;
    selfId: string;
    zone: string;
    onClose: () => void;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const c = connection;
    const mine = c?.person.id === selfId;
    const app = c ? appName(c) : "";
    const who = c?.person.name ?? "Someone";
    const now = new Date();

    async function disconnect() {
        if (!c) return;
        const res = await runAction(() => disconnectAiConnection(c.id));
        if (!res) return false;
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess(`${app} is disconnected from ${business}.`);
        onClose();
        router.refresh();
        return true;
    }

    return (
        <>
            <FormSheet
                open={c !== null}
                title={app}
                description={mine ? "Your connection" : `${who}’s connection`}
                onClose={onClose}
                doneOnly
                doneQuiet
                doneLabel="Close"
                extra={
                    <Button
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setAsking(true)}
                    >
                        Disconnect
                    </Button>
                }
            >
                {c ? (
                    <>
                        <dl className="grid grid-cols-[118px_1fr] gap-x-3 gap-y-2.5 rounded-[10px] border border-border bg-card p-3 text-[13.5px]">
                            <dt
                                data-ph-unmask=""
                                className="text-muted-foreground"
                            >
                                Connected by
                            </dt>
                            <dd data-ph-mask="">
                                {mine ? `${who} (you)` : who}
                            </dd>
                            <dt
                                data-ph-unmask=""
                                className="text-muted-foreground"
                            >
                                Connected
                            </dt>
                            <dd>
                                {c.connectedAt ? (
                                    formatDateTime(c.connectedAt, zone)
                                ) : (
                                    <AbsentValue says="Not known" />
                                )}
                            </dd>
                            <dt
                                data-ph-unmask=""
                                className="text-muted-foreground"
                            >
                                Last used
                            </dt>
                            <dd>
                                {c.lastUsedAt
                                    ? relativeWhen(c.lastUsedAt, now, zone)
                                    : "Not used yet"}
                            </dd>
                            {c.otherBusinesses > 0 ? (
                                <>
                                    <dt
                                        data-ph-unmask=""
                                        className="text-muted-foreground"
                                    >
                                        Also reaches
                                    </dt>
                                    <dd>
                                        {count(
                                            c.otherBusinesses,
                                            "other business",
                                            "other businesses",
                                        )}
                                    </dd>
                                </>
                            ) : null}
                        </dl>
                        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
                            <span data-ph-unmask="" className="font-semibold">
                                What it changed
                            </span>
                            <Link
                                data-ph-unmask=""
                                href="/settings/activity"
                                className="ml-auto font-semibold underline decoration-border-strong underline-offset-[3px]"
                            >
                                See all in Activity
                            </Link>
                        </div>
                    </>
                ) : null}
            </FormSheet>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                title={`Disconnect ${app} from this business?`}
                description={
                    <>
                        {mine
                            ? `${app} stops working with ${business} now. You can connect again.`
                            : `${who}’s ${app} stops working with ${business} now. They can connect again.`}
                        {c && c.otherBusinesses > 0
                            ? ` It keeps working with the ${count(c.otherBusinesses, "other business", "other businesses")} it reaches.`
                            : null}
                    </>
                }
                confirmLabel="Disconnect from this business"
                busyLabel="Disconnecting…"
                keepLabel={`Keep ${app}`}
                onConfirm={disconnect}
            />
        </>
    );
}
