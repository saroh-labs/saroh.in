"use client";

import type {
    ApiKeyKind,
    ApiKeyListItem,
    ApiKeyView,
    CreateApiKeyBody,
} from "@saroh/api-contract";
import { AbsentValue } from "@saroh/ui/absent-value";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { CheckRow } from "@saroh/ui/check-row";
import { RadioCards } from "@saroh/ui/choice-group";
import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { EmptyState } from "@saroh/ui/data-state";
import { Field } from "@saroh/ui/field";
import { FormSheet, FormSheetBody, FormSheetFoot } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { listTable, ListTable, ListTableHead } from "@saroh/ui/list-table";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronRight, ExternalLink, KeyRound, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
    createApiKey,
    revokeApiKey,
    rollApiKey,
    updateApiKey,
} from "@/lib/api-keys/actions";
import type { ScopeLevel, ScopeLevels } from "@/lib/api-keys/scope";
import {
    canDoLine,
    levelsOf,
    NEW_KEY_LEVELS,
    originsFrom,
    originsLine,
    SCOPE_AREAS,
    scopeOf,
} from "@/lib/api-keys/scope";
import { runAction } from "@/lib/api/run-action";
import { formatDate } from "@/lib/format/datetime";
import { relativeWhen } from "@/lib/notifications/when";
import { SecretOnce } from "./secret-once";

const KIND_WORDS: Record<ApiKeyKind, { name: string; term: string }> = {
    PUBLISHABLE: { name: "Website key (read-only)", term: "publishable" },
    SECRET: { name: "Server key", term: "secret" },
};

const EXPIRY = [
    { value: "never", label: "Never (until you revoke it)" },
    { value: "30", label: "In 30 days" },
    { value: "90", label: "In 90 days" },
    { value: "365", label: "In a year" },
] as const;
type Expiry = (typeof EXPIRY)[number]["value"];

export interface KeysProps {
    /** Each with its maker, and whether they're still on the team. */
    keys: ApiKeyListItem[];
    selfId: string;
    business: string;
    /** The actions the viewer holds: a key gets no more. */
    actions: string[];
    /** Kinds the switches and plan open. */
    open: ApiKeyKind[];
    count: number;
    cap: number | null;
    docs: string;
    zone: string;
}

interface Draft {
    kind: ApiKeyKind;
    name: string;
    levels: ScopeLevels;
    origins: string;
    ai: boolean;
    expiry: Expiry;
    /** Set when editing that key: its kind and expiry stay as made. */
    editId?: string;
}

const draftFrom = (key: ApiKeyView | null, kind: ApiKeyKind): Draft =>
    key
        ? {
              kind: key.kind,
              name: key.name,
              levels: levelsOf(key.scope),
              origins: key.allowedOrigins.join("\n"),
              ai: key.aiEnabled,
              expiry: "never",
          }
        : {
              kind,
              name: "",
              levels: NEW_KEY_LEVELS,
              origins: "",
              ai: false,
              expiry: "never",
          };

/**
 * Settings › API and AI apps › Connections (API keys) ("API and AI apps"
 * boards 3 and 4): read-first rows, each opening its sheet (Replace key,
 * Revoke, Edit what it can do); New key and Edit in a sheet; the key
 * shown once. A key whose
 * maker has left or is paused has stopped working: its row says so and its
 * sheet offers to make it again as the viewer.
 */
export function Keys(props: KeysProps) {
    const { keys, business, open, count, cap, docs, zone } = props;
    const router = useRouter();
    const [openId, setOpenId] = useState<string | null>(null);
    const [making, setMaking] = useState<Draft | null>(null);
    const [shown, setShown] = useState<{ name: string; token: string } | null>(
        null,
    );
    const opened = keys.find((k) => k.id === openId) ?? null;
    const gone = (k: ApiKeyListItem) => !k.madeBy.stillHere;
    const maker = (k: ApiKeyListItem) =>
        k.madeBy.name ?? (gone(k) ? "Someone who left" : "Someone");
    const now = new Date();
    const canMake = open.length > 0;
    const startNew = (from: ApiKeyView | null = null) =>
        setMaking(
            draftFrom(
                from,
                open.includes("SECRET") ? "SECRET" : (open[0] ?? "SECRET"),
            ),
        );

    const newButton = canMake ? (
        <Button size="sm" onClick={() => startNew()}>
            <Plus aria-hidden className="size-4" />
            New key
        </Button>
    ) : null;

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
                <p
                    className="min-w-0 flex-1 basis-[280px] text-[13.5px] text-foreground/80"
                    data-ph-mask=""
                >
                    Keys let your own website or software work with {business}.
                    You only need one if a developer asks for it.
                </p>
                <span className="text-[12.5px] text-muted-foreground">
                    {cap
                        ? `${count} of ${cap} keys`
                        : `${count} ${count === 1 ? "key" : "keys"}`}
                </span>
                {keys.length > 0 ? newButton : null}
            </div>

            {keys.length === 0 ? (
                <EmptyState
                    size="panel"
                    icon={<KeyRound />}
                    title="No keys yet"
                    description="A key lets your developer's server, a tool like n8n or your own website work with your business."
                    action={newButton ?? undefined}
                />
            ) : (
                <ListTable>
                    <ListTableHead className="hidden grid-cols-[1.6fr_1.6fr_1.9fr_1.1fr_44px] gap-3 sm:grid">
                        <span data-ph-unmask="">Name</span>
                        <span data-ph-unmask="">Made by</span>
                        <span data-ph-unmask="">Can do</span>
                        <span data-ph-unmask="">Key starts</span>
                        <span />
                    </ListTableHead>
                    <ul>
                        {keys.map((k) => {
                            const can =
                                k.kind === "PUBLISHABLE"
                                    ? originsLine(k.allowedOrigins)
                                    : canDoLine(k.scope, k.aiEnabled);
                            const used = k.lastUsedAt
                                ? `Used ${relativeWhen(k.lastUsedAt, now, zone).toLowerCase()}`
                                : "Not used yet";
                            const warn = gone(k) ? (
                                <Badge
                                    variant="warning"
                                    size="sm"
                                    className="mt-1 w-fit"
                                >
                                    Stopped: its maker isn't on the team
                                </Badge>
                            ) : k.graceUntil ? (
                                <Badge
                                    variant="warning"
                                    size="sm"
                                    className="mt-1 w-fit"
                                >
                                    Replaced: stops{" "}
                                    {formatDate(k.graceUntil, zone, { now })}
                                </Badge>
                            ) : null;
                            return (
                                <li key={k.id} className={listTable.rule}>
                                    <button
                                        type="button"
                                        aria-label={`Open ${k.name}`}
                                        onClick={() => setOpenId(k.id)}
                                        className={cn(
                                            listTable.rowInner,
                                            listTable.pressable,
                                            "grid min-h-[62px] w-full grid-cols-[1fr_20px] items-center gap-3 text-left text-[13.5px] sm:grid-cols-[1.6fr_1.6fr_1.9fr_1.1fr_44px]",
                                            k.id === openId &&
                                                listTable.selected,
                                        )}
                                    >
                                        <span
                                            className="min-w-0"
                                            data-ph-mask=""
                                        >
                                            <span className="block font-semibold">
                                                {k.name}
                                            </span>
                                            <span className="block text-[12.5px] text-muted-foreground">
                                                {KIND_WORDS[k.kind].name}
                                                <span className="sm:hidden">
                                                    {" · "}
                                                    <span className="font-mono">
                                                        {k.prefix}…
                                                    </span>
                                                </span>
                                            </span>
                                            <span className="block text-[12.5px] text-muted-foreground sm:hidden">
                                                Made by {maker(k)} ·{" "}
                                                {used.toLowerCase()}
                                            </span>
                                            <span className="sm:hidden">
                                                {warn}
                                            </span>
                                        </span>
                                        <span
                                            className="flex min-w-0 flex-col max-sm:hidden"
                                            data-ph-mask=""
                                        >
                                            {maker(k)}
                                            {warn ?? (
                                                <span className="text-[12.5px] text-muted-foreground">
                                                    {used}
                                                </span>
                                            )}
                                        </span>
                                        <span
                                            className="min-w-0 break-words max-sm:hidden"
                                            data-ph-mask=""
                                        >
                                            {can}
                                        </span>
                                        <span className="font-mono text-[12.5px] text-foreground/80 max-sm:hidden">
                                            {k.prefix}…
                                        </span>
                                        <ChevronRight
                                            aria-hidden
                                            className="size-4 justify-self-end text-muted-foreground"
                                        />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </ListTable>
            )}

            <KeySheet
                apiKey={opened}
                maker={opened ? maker(opened) : ""}
                gone={opened ? gone(opened) : false}
                canMake={canMake}
                zone={zone}
                onClose={() => setOpenId(null)}
                onRemake={(k) => {
                    setOpenId(null);
                    startNew(k);
                }}
                onEdit={(k) => {
                    setOpenId(null);
                    setMaking({ ...draftFrom(k, k.kind), editId: k.id });
                }}
                onReplaced={(name, token) => {
                    setOpenId(null);
                    setShown({ name, token });
                }}
            />
            <NewKeySheet
                draft={making}
                open={open}
                actions={props.actions}
                business={business}
                docs={docs}
                onClose={() => setMaking(null)}
                onMade={(name, token) => {
                    setMaking(null);
                    setShown({ name, token });
                }}
                onSaved={(name) => {
                    setMaking(null);
                    showSuccess(
                        `${name} is saved. It changes on its next call.`,
                    );
                    router.refresh();
                }}
            />
            <SecretOnce
                secret={shown?.token ?? null}
                title="Copy your key now"
                lead={`“${shown?.name ?? ""}” is ready. This is the only time Saroh shows it.`}
                note="Give it only to your developer, and never put a server key in a website. If someone else sees it, replace it: the old one keeps working for 24 hours."
                guide={{
                    label: "Setup guide for your developer",
                    href: `${docs}/api/keys`,
                }}
                thing="key"
                onDone={() => {
                    setShown(null);
                    router.refresh();
                }}
            />
        </div>
    );
}

function KeySheet({
    apiKey: k,
    maker,
    gone,
    canMake,
    zone,
    onClose,
    onRemake,
    onEdit,
    onReplaced,
}: {
    apiKey: ApiKeyView | null;
    maker: string;
    gone: boolean;
    canMake: boolean;
    zone: string;
    onClose: () => void;
    onRemake: (k: ApiKeyView) => void;
    onEdit: (k: ApiKeyView) => void;
    onReplaced: (name: string, token: string) => void;
}) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [rolling, setRolling] = useState(false);
    const now = new Date();

    async function replace() {
        if (!k) return;
        const res = await runAction(() => rollApiKey(k.id), {
            setBusy: setRolling,
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        onReplaced(k.name, res.data.token);
    }

    async function revoke() {
        if (!k) return;
        const res = await runAction(() => revokeApiKey(k.id));
        if (!res) return false;
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess(`${k.name} is revoked.`);
        onClose();
        router.refresh();
        return true;
    }

    return (
        <>
            <FormSheet
                open={k !== null}
                title={k?.name ?? ""}
                description={k ? KIND_WORDS[k.kind].name : ""}
                onClose={onClose}
                doneOnly
                doneQuiet
                doneLabel="Close"
                extra={
                    <>
                        <Button
                            variant="outline"
                            className="text-destructive"
                            onClick={() => setAsking(true)}
                        >
                            Revoke
                        </Button>
                        {k && !k.graceUntil && !gone ? (
                            <Button variant="outline" onClick={() => onEdit(k)}>
                                Edit what it can do
                            </Button>
                        ) : null}
                    </>
                }
            >
                {k ? (
                    <>
                        {gone ? (
                            <Notice
                                tone="warning"
                                title="Made by someone no longer on the team."
                                action={
                                    canMake ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => onRemake(k)}
                                        >
                                            Make again as me
                                        </Button>
                                    ) : undefined
                                }
                            >
                                This key stopped working when they left or were
                                paused. Make it again as you to keep {k.name}{" "}
                                running.
                            </Notice>
                        ) : null}
                        <dl
                            data-ph-mask=""
                            className="grid grid-cols-[118px_1fr] gap-x-3 gap-y-2.5 rounded-[10px] border border-border bg-card p-3 text-[13.5px]"
                        >
                            <dt className="text-muted-foreground">Kind</dt>
                            <dd>
                                {KIND_WORDS[k.kind].name}
                                <small className="ml-1.5 text-[11.5px] text-muted-foreground">
                                    {KIND_WORDS[k.kind].term}
                                </small>
                            </dd>
                            <dt className="text-muted-foreground">Made by</dt>
                            <dd>
                                {maker},{" "}
                                {formatDate(k.createdAt, zone, { now })}
                            </dd>
                            <dt className="text-muted-foreground">
                                Key starts
                            </dt>
                            <dd className="font-mono">{k.prefix}…</dd>
                            {k.kind === "PUBLISHABLE" ? (
                                <>
                                    <dt className="text-muted-foreground">
                                        Works on
                                    </dt>
                                    <dd className="break-words">
                                        {originsLine(k.allowedOrigins)}
                                    </dd>
                                </>
                            ) : (
                                <>
                                    <dt className="text-muted-foreground">
                                        Can do
                                    </dt>
                                    <dd>{canDoLine(k.scope)}</dd>
                                    <dt className="text-muted-foreground">
                                        AI apps
                                    </dt>
                                    <dd>
                                        {k.aiEnabled
                                            ? "Can use this key"
                                            : "Can't use this key"}
                                    </dd>
                                </>
                            )}
                            <dt className="text-muted-foreground">Last used</dt>
                            <dd>
                                {k.lastUsedAt
                                    ? relativeWhen(k.lastUsedAt, now, zone)
                                    : "Not used yet"}
                            </dd>
                            <dt className="text-muted-foreground">
                                Stops working
                            </dt>
                            <dd>
                                {k.graceUntil
                                    ? formatDate(k.graceUntil, zone, { now })
                                    : k.expiresAt
                                      ? formatDate(k.expiresAt, zone, { now })
                                      : "Never (until you revoke it)"}
                            </dd>
                        </dl>
                        {!k.graceUntil && !gone ? (
                            <div>
                                <Button
                                    variant="outline"
                                    busy={rolling}
                                    busyLabel="Replacing…"
                                    onClick={() => void replace()}
                                >
                                    Replace key
                                </Button>
                                <p
                                    data-ph-unmask=""
                                    className="mt-1.5 text-[12.5px] text-muted-foreground"
                                >
                                    You get a new key. The old one keeps working
                                    for 24 hours while you switch.
                                </p>
                            </div>
                        ) : null}
                    </>
                ) : null}
            </FormSheet>
            <ConfirmDialog
                open={asking}
                onOpenChange={setAsking}
                title={`Revoke ${k?.name ?? "this key"}?`}
                description={`${k?.name ?? "This key"} stops working now. Anything using it will be refused. This cannot be undone.`}
                confirmLabel="Revoke key"
                busyLabel="Revoking…"
                keepLabel="Keep key"
                onConfirm={revoke}
            />
        </>
    );
}

function NewKeySheet({
    draft: start,
    open,
    actions,
    business,
    docs,
    onClose,
    onMade,
    onSaved,
}: {
    draft: Draft | null;
    open: ApiKeyKind[];
    actions: string[];
    business: string;
    docs: string;
    onClose: () => void;
    onMade: (name: string, token: string) => void;
    onSaved: (name: string) => void;
}) {
    const editing = Boolean(start?.editId);
    return (
        <FormSheet
            open={start !== null}
            title={editing ? "Edit what it can do" : "New key"}
            description={
                editing
                    ? "Change its name and what it may do. The key stays the same."
                    : "Name it, choose what it may do, then copy it once."
            }
            onClose={onClose}
            // A fresh draft each opening.
            key={start ? JSON.stringify(start) : "closed"}
        >
            {start ? (
                <NewKeyFields
                    start={start}
                    open={open}
                    actions={actions}
                    business={business}
                    docs={docs}
                    onMade={onMade}
                    onSaved={onSaved}
                />
            ) : null}
        </FormSheet>
    );
}

function NewKeyFields({
    start,
    open,
    actions,
    business,
    docs,
    onMade,
    onSaved,
}: {
    start: Draft;
    open: ApiKeyKind[];
    actions: string[];
    business: string;
    docs: string;
    onMade: (name: string, token: string) => void;
    onSaved: (name: string) => void;
}) {
    const editId = start.editId;
    const [d, setD] = useState<Draft>(start);
    const [error, setError] = useState<string | null>(null);
    const may = (a: string) => actions.includes(a);
    const set = (patch: Partial<Draft>) => setD((v) => ({ ...v, ...patch }));
    const setLevel = (area: keyof ScopeLevels, level: ScopeLevel) =>
        set({ levels: { ...d.levels, [area]: level } });

    const [busy, setBusy] = useState(false);
    async function submit() {
        setError(null);
        const body: CreateApiKeyBody = {
            kind: d.kind,
            name: d.name.trim(),
            ...(d.kind === "SECRET"
                ? { scope: scopeOf(d.levels, may), aiEnabled: d.ai }
                : { allowedOrigins: originsFrom(d.origins) }),
            ...(d.expiry === "never"
                ? {}
                : {
                      expiresAt: new Date(
                          Date.now() + Number(d.expiry) * 24 * 60 * 60 * 1000,
                      ).toISOString(),
                  }),
        };
        if (!body.name)
            return setError("Give it a name, so you know where it's used.");
        if (d.kind === "PUBLISHABLE" && !body.allowedOrigins?.length) {
            return setError("Add the website it works on.");
        }
        if (editId) {
            // Only what changed: a rename never rewrites what the key may do.
            const { name, scope, aiEnabled, allowedOrigins } = body;
            const levelsChanged =
                JSON.stringify(d.levels) !== JSON.stringify(start.levels);
            const originsChanged =
                originsFrom(d.origins).join("\n") !==
                originsFrom(start.origins).join("\n");
            const saved = await runAction(
                () =>
                    updateApiKey(editId, {
                        name,
                        ...(levelsChanged ? { scope } : {}),
                        ...(d.ai !== start.ai ? { aiEnabled } : {}),
                        ...(originsChanged ? { allowedOrigins } : {}),
                    }),
                { setBusy },
            );
            if (!saved) return;
            if (!saved.ok) return setError(saved.error);
            return onSaved(saved.data.name);
        }
        const res = await runAction(() => createApiKey(body), { setBusy });
        if (!res) return;
        if (!res.ok) return setError(res.error);
        onMade(res.data.key.name, res.data.token);
    }

    return (
        <>
            <FormSheetBody>
                <Field label="Kind of key" group>
                    <RadioCards
                        label="Kind of key"
                        value={d.kind}
                        onChange={(kind) => set({ kind })}
                        options={(["PUBLISHABLE", "SECRET"] as const).map(
                            (kind) => ({
                                value: kind,
                                // An edit keeps the key's kind.
                                disabled: editId
                                    ? kind !== d.kind
                                    : !open.includes(kind),
                                label: (
                                    <>
                                        <b>{KIND_WORDS[kind].name}</b>
                                        <small className="ml-1.5 text-[11.5px] text-muted-foreground">
                                            {KIND_WORDS[kind].term}
                                        </small>
                                    </>
                                ),
                                note:
                                    kind === "PUBLISHABLE"
                                        ? "Anyone can see it in your site's code, so it only reads: products, times, posts and plans."
                                        : "For your developer's server or tools like n8n. Keep it secret: it can change things.",
                            }),
                        )}
                    />
                </Field>
                <Field
                    label="Name"
                    hint="So you know where it's used."
                    error={error && !d.name.trim() ? error : null}
                >
                    <Input
                        value={d.name}
                        maxLength={80}
                        onChange={(e) => set({ name: e.target.value })}
                    />
                </Field>
                {d.kind === "PUBLISHABLE" ? (
                    <>
                        <Field
                            label="Works on these websites"
                            hint="Addresses, one a line, like shop.example.com."
                        >
                            <Textarea
                                rows={3}
                                value={d.origins}
                                onChange={(e) =>
                                    set({ origins: e.target.value })
                                }
                            />
                        </Field>
                        <Notice tone="neutral">
                            A website key only reads. To take bookings and
                            orders from your own site, your developer uses your
                            server, a short-lived token from it, or your Saroh
                            booking and checkout pages.{" "}
                            <a
                                href={`${docs}/api/bookings-and-orders`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-semibold underline underline-offset-[3px]"
                            >
                                How to take bookings from your site
                                <ExternalLink
                                    aria-hidden
                                    className="size-3.5"
                                />
                            </a>
                        </Notice>
                    </>
                ) : (
                    <>
                        <Field
                            label="What it can do"
                            group
                            hint="Change includes See. Customers never include sensitive details."
                        >
                            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3.5 gap-y-1 rounded-[10px] border border-border bg-card px-3 py-2.5 text-[13.5px]">
                                <span data-ph-unmask="" className="label">
                                    What
                                </span>
                                <span data-ph-unmask="" className="label">
                                    See
                                </span>
                                <span data-ph-unmask="" className="label">
                                    Change
                                </span>
                                {SCOPE_AREAS.map((row) => {
                                    const level = d.levels[row.area];
                                    const always = row.area === "catalogue";
                                    return (
                                        <ScopeRow
                                            key={row.area}
                                            label={row.label}
                                            see={level !== "none"}
                                            change={level === "change"}
                                            seeOff={
                                                always || !row.see.some(may)
                                            }
                                            changeOff={
                                                row.change.length === 0 ||
                                                !row.change.some(may)
                                            }
                                            hasChange={row.change.length > 0}
                                            onSee={(on) =>
                                                setLevel(
                                                    row.area,
                                                    on ? "see" : "none",
                                                )
                                            }
                                            onChange={(on) =>
                                                setLevel(
                                                    row.area,
                                                    on ? "change" : "see",
                                                )
                                            }
                                        />
                                    );
                                })}
                            </div>
                        </Field>
                        <CheckRow
                            checked={d.ai}
                            onChange={(ai) => set({ ai })}
                            className="items-start"
                        >
                            <span>
                                <b className="block text-[13.5px]">
                                    Let AI apps use this key
                                </b>
                                <span
                                    data-ph-unmask=""
                                    className="text-[12.5px] text-muted-foreground"
                                >
                                    Leave off unless your developer is
                                    connecting an AI tool with it.
                                </span>
                            </span>
                        </CheckRow>
                    </>
                )}
                {editId ? null : (
                    <Field label="Stops working">
                        <OptionSelect
                            value={d.expiry}
                            onValueChange={(expiry) => set({ expiry })}
                            options={EXPIRY}
                        />
                    </Field>
                )}
                <p
                    className="text-[12.5px] text-muted-foreground"
                    data-ph-mask=""
                >
                    Live keys act on the real {business}: there's no test mode
                    yet.
                </p>
                {error && d.name.trim() ? (
                    <p role="alert" className="text-[13px] text-destructive">
                        {error}
                    </p>
                ) : null}
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={editId ? "Save" : "Create key"}
                savingLabel={editId ? "Saving…" : "Creating…"}
                pending={busy}
                onSubmit={() => submit()}
            />
        </>
    );
}

function ScopeRow(p: {
    label: string;
    see: boolean;
    change: boolean;
    seeOff: boolean;
    changeOff: boolean;
    hasChange: boolean;
    onSee: (on: boolean) => void;
    onChange: (on: boolean) => void;
}) {
    return (
        <>
            <span>{p.label}</span>
            <CheckRow
                checked={p.see}
                disabled={p.seeOff}
                onChange={p.onSee}
                className="justify-center"
            >
                <span className="sr-only">{p.label}: see</span>
            </CheckRow>
            {p.hasChange ? (
                <CheckRow
                    checked={p.change}
                    disabled={p.changeOff}
                    onChange={p.onChange}
                    className="justify-center"
                >
                    <span className="sr-only">{p.label}: change</span>
                </CheckRow>
            ) : (
                <AbsentValue
                    className="text-center"
                    says={`${p.label}: nothing to change`}
                />
            )}
        </>
    );
}
