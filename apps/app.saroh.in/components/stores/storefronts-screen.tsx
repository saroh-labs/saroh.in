"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { PageHeader } from "@saroh/ui/page-header";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
    closeStorefront,
    updateStorefront,
} from "@/lib/stores/storefront-actions";
import type {
    StorefrontInput,
    StorefrontSettings,
    StorefrontSummary,
} from "@/lib/stores/storefronts";

/**
 * The currencies offered before a storefront's first order. Short on purpose:
 * the ones Saroh's payment providers settle in. A storefront already on
 * another code keeps it — it is added to the list rather than hidden.
 */
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"];

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

const ordersLabel = (n: number) =>
    n === 0 ? "no orders yet" : n === 1 ? "1 order" : `${n} orders`;

/**
 * Sell → Storefronts, after the "Saroh Storefront Settings" design: every
 * storefront on the left, the chosen one's own settings on the right.
 *
 * Only what the storefront really has is drawn. The design also has a shop
 * or online kind, an address and hours, collection, tips, guest checkout,
 * payments per storefront and pausing. None of those exist yet, and a switch
 * that saves nothing tells a merchant their shop works in a way it does not.
 *
 * Every control saves on its own — a toggle when it is flipped, a field when
 * its Save is pressed — so there is no page-wide save to forget.
 */
export function StorefrontsScreen({
    businessName,
    storefronts,
    selected,
    canCreate,
    canEdit,
    canClose,
}: {
    businessName: string;
    storefronts: StorefrontSummary[];
    /** `null` when the chosen storefront could not be read. */
    selected: StorefrontSettings | null;
    canCreate: boolean;
    canEdit: boolean;
    canClose: boolean;
}) {
    const header = (
        <PageHeader
            breadcrumb={["Sell", "Storefronts"]}
            title="Storefronts"
            actions={
                canCreate ? (
                    <Button asChild variant="brand">
                        <Link href="/stores/new">New storefront</Link>
                    </Button>
                ) : undefined
            }
        />
    );

    if (storefronts.length === 0) {
        return (
            <>
                {header}
                <EmptyState
                    title="No storefront yet"
                    description={`${businessName} has Commerce turned on but nowhere to sell from. A storefront is where a catalogue meets a checkout — a shop counter, an online store, a market stall.`}
                    action={
                        canCreate ? (
                            <Button asChild variant="brand">
                                <Link href="/stores/new">
                                    Create a storefront
                                </Link>
                            </Button>
                        ) : undefined
                    }
                />
            </>
        );
    }

    return (
        <>
            {header}
            <div className="flex flex-wrap items-start gap-5">
                <StorefrontList
                    storefronts={storefronts}
                    selectedId={selected?.id ?? null}
                />
                <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
                    {selected ? (
                        // Keyed by storefront, so picking another one starts
                        // from its own values rather than the last one's edits.
                        <StorefrontDetail
                            key={selected.id}
                            store={selected}
                            businessName={businessName}
                            canEdit={canEdit}
                            canClose={canClose}
                        />
                    ) : (
                        <FailedState
                            title="This storefront could not be loaded"
                            description="Its settings could not be read, so none are shown rather than guessed. Nothing has been changed."
                        />
                    )}
                </div>
            </div>
        </>
    );
}

function StorefrontList({
    storefronts,
    selectedId,
}: {
    storefronts: StorefrontSummary[];
    selectedId: string | null;
}) {
    return (
        <nav
            aria-label="Storefronts"
            className="min-w-0 max-w-[280px] flex-[0_1_236px] overflow-hidden rounded-xl border border-border max-sm:max-w-none max-sm:flex-[1_1_100%]"
        >
            <p className="border-b border-border px-[15px] py-[11px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {storefronts.length === 1
                    ? "1 storefront"
                    : `${storefronts.length} storefronts`}
            </p>
            <ul className="flex flex-col gap-0.5 p-1.5">
                {storefronts.map((s) => {
                    const on = s.id === selectedId;
                    return (
                        <li key={s.id}>
                            <Link
                                href={`/commerce/storefronts?storefront=${s.id}`}
                                scroll={false}
                                aria-current={on ? "page" : undefined}
                                className={cn(
                                    "flex min-h-11 items-center gap-[9px] rounded-lg px-[9px] py-[7px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    on ? "bg-muted" : "hover:bg-muted/60",
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {s.name}
                                    </span>
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        {ordersLabel(s.orderCount)}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section
            aria-label={title}
            className="rounded-xl border border-border px-5 py-[18px]"
        >
            <h2 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {title}
            </h2>
            <div className="flex flex-col gap-5">{children}</div>
        </section>
    );
}

function Note({ id, children }: { id?: string; children: ReactNode }) {
    return (
        <p
            id={id}
            className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
        >
            {children}
        </p>
    );
}

function StorefrontDetail({
    store: initial,
    businessName,
    canEdit,
    canClose,
}: {
    store: StorefrontSettings;
    businessName: string;
    canEdit: boolean;
    canClose: boolean;
}) {
    const router = useRouter();
    const [store, setStore] = useState(initial);
    const [pending, startTransition] = useTransition();

    /**
     * One save path for every control. The screen shows what the API returned,
     * not what was asked for — so a value the server normalised ("18" →
     * "18.00") or refused is what the merchant sees afterwards.
     */
    function save(
        input: StorefrontInput,
        said: string,
        onFail?: () => void,
    ): void {
        startTransition(async () => {
            const res = await updateStorefront(store.id, input);
            if (!res.ok) {
                onFail?.();
                showError(res.error);
                return;
            }
            setStore(res.data);
            showSuccess(said);
            if (input.name !== undefined) router.refresh();
        });
    }

    return (
        <>
            <BasicsSection
                store={store}
                businessName={businessName}
                canEdit={canEdit}
                pending={pending}
                onSave={(name) => save({ name }, "Name saved")}
            />
            <CheckoutSection
                store={store}
                canEdit={canEdit}
                pending={pending}
                save={save}
                setStore={setStore}
            />
            <BehaviourSection
                store={store}
                canEdit={canEdit}
                pending={pending}
                save={save}
                setStore={setStore}
            />
            {canClose ? (
                <ClosingSection store={store} businessName={businessName} />
            ) : null}
        </>
    );
}

function BasicsSection({
    store,
    businessName,
    canEdit,
    pending,
    onSave,
}: {
    store: StorefrontSettings;
    businessName: string;
    canEdit: boolean;
    pending: boolean;
    onSave: (name: string) => void;
}) {
    const [name, setName] = useState(store.name);
    const trimmed = name.trim();
    const dirty = trimmed !== store.name;

    return (
        <Section title="Basics">
            <form
                className="grid gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    if (dirty && trimmed) onSave(trimmed);
                }}
            >
                <Label htmlFor="storefront-name">Storefront name</Label>
                <div className="flex gap-2">
                    <Input
                        id="storefront-name"
                        value={name}
                        maxLength={80}
                        readOnly={!canEdit}
                        aria-describedby="storefront-name-note"
                        onChange={(e) => setName(e.target.value)}
                        className="max-w-sm"
                    />
                    {canEdit && dirty ? (
                        <Button type="submit" disabled={pending || !trimmed}>
                            Save
                        </Button>
                    ) : null}
                </div>
                <Note id="storefront-name-note">
                    Customers see this at checkout and on receipts. It is not
                    the business name — {businessName} stays the same across all
                    of them.
                </Note>
            </form>
        </Section>
    );
}

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;
type Setter = (fn: (s: StorefrontSettings) => StorefrontSettings) => void;

function CheckoutSection({
    store,
    canEdit,
    pending,
    save,
    setStore,
}: {
    store: StorefrontSettings;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: Setter;
}) {
    const [rate, setRate] = useState(String(Number(store.taxRate)));
    const rateValid = /^\d{1,2}(\.\d{1,2})?$|^100$/.test(rate.trim());
    const rateDirty = rateValid && Number(rate) !== Number(store.taxRate);
    const currencies = CURRENCIES.includes(store.currency)
        ? CURRENCIES
        : [store.currency, ...CURRENCIES];
    const orders = store.orderCount;

    return (
        <Section title="Checkout">
            <div className="grid gap-2">
                <Label htmlFor="storefront-currency">Currency</Label>
                <div className="flex items-center gap-2.5">
                    {store.currencyLocked || !canEdit ? (
                        <Input
                            id="storefront-currency"
                            value={store.currency}
                            readOnly
                            aria-describedby="storefront-currency-note"
                            className="w-32 font-mono"
                        />
                    ) : (
                        <Select
                            value={store.currency}
                            disabled={pending}
                            onValueChange={(currency) => {
                                const before = store.currency;
                                setStore((s) => ({ ...s, currency }));
                                save(
                                    { currency },
                                    `Currency set to ${currency}`,
                                    () =>
                                        setStore((s) => ({
                                            ...s,
                                            currency: before,
                                        })),
                                );
                            }}
                        >
                            <SelectTrigger
                                id="storefront-currency"
                                aria-describedby="storefront-currency-note"
                                className="w-32 font-mono"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {currencies.map((c) => (
                                    <SelectItem
                                        key={c}
                                        value={c}
                                        className="font-mono"
                                    >
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Badge variant="outline" className="gap-1">
                        {store.currencyLocked ? (
                            <>
                                <Lock aria-hidden className="size-3" />
                                Locked
                            </>
                        ) : (
                            "Editable"
                        )}
                    </Badge>
                </div>
                <Note id="storefront-currency-note">
                    {store.currencyLocked
                        ? `Locked by the ${orders === 1 ? "order" : `${orders} orders`} already taken here. Changing it now would rewrite what every one of them means.`
                        : "No orders yet, so this can still change. After the first one it locks for good."}
                </Note>
            </div>

            <ToggleRow
                id="storefront-tax"
                label="Charge tax"
                note="Added to each new order at this rate. A single order can still be changed by hand."
                checked={store.taxEnabled}
                disabled={!canEdit || pending}
                onChange={(taxEnabled) => {
                    setStore((s) => ({ ...s, taxEnabled }));
                    save(
                        { taxEnabled },
                        taxEnabled ? "Tax turned on" : "Tax turned off",
                        () =>
                            setStore((s) => ({
                                ...s,
                                taxEnabled: !taxEnabled,
                            })),
                    );
                }}
            />
            {store.taxEnabled ? (
                <form
                    className="grid gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (rateDirty) {
                            save(
                                { taxRate: rate.trim() },
                                `Tax rate set to ${Number(rate)}%`,
                            );
                        }
                    }}
                >
                    <Label htmlFor="storefront-tax-rate">Tax rate</Label>
                    <div className="flex items-center gap-2">
                        <div className="relative w-28">
                            <Input
                                id="storefront-tax-rate"
                                inputMode="decimal"
                                value={rate}
                                readOnly={!canEdit}
                                aria-invalid={!rateValid || undefined}
                                aria-describedby="storefront-tax-rate-note"
                                onChange={(e) => setRate(e.target.value)}
                                className="pr-7 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground"
                            >
                                %
                            </span>
                        </div>
                        {canEdit && rateDirty ? (
                            <Button type="submit" disabled={pending}>
                                Save
                            </Button>
                        ) : null}
                    </div>
                    <Note id="storefront-tax-rate-note">
                        {rateValid
                            ? "A percentage of the order's items, before delivery."
                            : "A percentage from 0 to 100, with up to 2 decimals."}
                    </Note>
                </form>
            ) : null}
        </Section>
    );
}

function BehaviourSection({
    store,
    canEdit,
    pending,
    save,
    setStore,
}: {
    store: StorefrontSettings;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: Setter;
}) {
    const [threshold, setThreshold] = useState(
        store.freeShippingThreshold ?? "",
    );
    const next = threshold.trim();
    const valid = next === "" || MONEY_RE.test(next);
    const dirty =
        valid &&
        (next === ""
            ? store.freeShippingThreshold !== null
            : Number(next) !== Number(store.freeShippingThreshold ?? NaN));

    return (
        <Section title="Behaviour">
            <ToggleRow
                id="storefront-delivery"
                label="Delivery"
                note="Orders from here can be sent to the customer. Off means nothing is sent, so there is no shipping to charge."
                checked={store.shippingEnabled}
                disabled={!canEdit || pending}
                onChange={(shippingEnabled) => {
                    setStore((s) => ({ ...s, shippingEnabled }));
                    save(
                        { shippingEnabled },
                        shippingEnabled
                            ? "Delivery turned on"
                            : "Delivery turned off",
                        () =>
                            setStore((s) => ({
                                ...s,
                                shippingEnabled: !shippingEnabled,
                            })),
                    );
                }}
            />
            {store.shippingEnabled ? (
                <form
                    className="grid gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!dirty) return;
                        save(
                            {
                                freeShippingThreshold:
                                    next === "" ? null : next,
                            },
                            next === ""
                                ? "Free delivery removed"
                                : `Free delivery over ${next} ${store.currency}`,
                        );
                    }}
                >
                    <Label htmlFor="storefront-free-over">
                        Free delivery over
                    </Label>
                    <div className="flex items-center gap-2">
                        <div className="relative w-40">
                            <Input
                                id="storefront-free-over"
                                inputMode="decimal"
                                value={threshold}
                                placeholder="Never"
                                readOnly={!canEdit}
                                aria-invalid={!valid || undefined}
                                aria-describedby="storefront-free-over-note"
                                onChange={(e) => setThreshold(e.target.value)}
                                className="pr-12 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-muted-foreground"
                            >
                                {store.currency}
                            </span>
                        </div>
                        {canEdit && dirty ? (
                            <Button type="submit" disabled={pending}>
                                Save
                            </Button>
                        ) : null}
                    </div>
                    <Note id="storefront-free-over-note">
                        {valid
                            ? "An order whose items come to this or more is marked as free to deliver. Leave it empty to always charge."
                            : "A number with up to 2 decimals, or empty."}
                    </Note>
                </form>
            ) : null}
        </Section>
    );
}

function ToggleRow({
    id,
    label,
    note,
    checked,
    disabled,
    onChange,
}: {
    id: string;
    label: string;
    note: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
                <Label htmlFor={id} className="text-[13.5px] font-medium">
                    {label}
                </Label>
                <p
                    id={`${id}-note`}
                    className="mt-0.5 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    {note}
                </p>
            </div>
            <Switch
                id={id}
                checked={checked}
                disabled={disabled}
                aria-describedby={`${id}-note`}
                onCheckedChange={onChange}
                className="mt-0.5 shrink-0"
            />
        </div>
    );
}

/**
 * Closing is irreversible, so it is a confirm and not an Undo toast: the
 * design drew an Undo, but the API keeps no way back from a close, and an
 * Undo that only works for the next eight seconds is a promise the product
 * cannot keep if the tab is closed in between.
 */
function ClosingSection({
    store,
    businessName,
}: {
    store: StorefrontSettings;
    businessName: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const orders = store.orderCount;
    const kept = `${orders} past ${orders === 1 ? "order stays" : "orders stay"}`;

    return (
        <Section title="Closing up">
            <Note>
                {store.unfulfilled > 0
                    ? `${store.unfulfilled === 1 ? "One order here is" : `${store.unfulfilled} orders here are`} still waiting to go out. Fulfil or cancel ${store.unfulfilled === 1 ? "it" : "them"} before closing this storefront.`
                    : orders > 0
                      ? `Closing ${store.name} permanently cannot be undone, and its ${kept} on the business's record.`
                      : "Nothing has been sold here yet, so closing it removes it cleanly."}
            </Note>
            <div>
                <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:border-destructive hover:text-destructive"
                    disabled={pending || store.unfulfilled > 0}
                    onClick={() => setOpen(true)}
                >
                    Close permanently
                </Button>
            </div>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={`Close ${store.name} permanently?`}
                description={`This removes ${store.name} from ${businessName} for good. ${
                    orders > 0
                        ? `Its ${kept} on the business's record, and the catalogue is untouched — it belongs to the business, not to this storefront.`
                        : "Nothing has been sold here, so there is nothing to keep."
                } This cannot be undone.`}
                confirmLabel="Close permanently"
                onConfirm={() =>
                    startTransition(async () => {
                        const res = await closeStorefront(store.id);
                        if (!res.ok) {
                            showError(res.error);
                            return;
                        }
                        showSuccess(`${store.name} is closed`);
                        router.replace("/commerce/storefronts");
                    })
                }
            />
        </Section>
    );
}
