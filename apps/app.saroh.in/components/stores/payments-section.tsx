"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { providerName } from "@/lib/payments/providers";
import {
    LOCATION_SECTIONS,
    PROVIDERS_HREF,
} from "@/lib/stores/location-readiness";

import type { SectionProps } from "./location-save";
import { PayOnHandoverRow } from "./pay-on-handover-row";
import { Note, Section, ToggleRow } from "./storefront-section";

/**
 * The currencies offered before a location's first order: the ones Saroh's
 * payment providers settle in. A location already on another code keeps it:
 * it is added to the list rather than hidden.
 */
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"];

const LINK =
    "w-fit rounded-sm text-[12.5px] font-medium underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground";

/**
 * Payments: how customers pay here (the business's providers, and paying
 * on collection or delivery), tax, and the currency, which locks after the
 * first order.
 */
export function PaymentsSection(props: SectionProps) {
    return (
        <Section
            title={LOCATION_SECTIONS.payments.label}
            id={LOCATION_SECTIONS.payments.id}
        >
            <OnlinePayments {...props} />
            <PayOnHandoverRow {...props} />
            <Tax {...props} />
            <Currency {...props} />
        </Section>
    );
}

/**
 * Providers are connected once, for the business: the checks are on the
 * business and the money lands in its account. Each location only picks
 * which of them its checkout uses, so the list shows only when there is a
 * choice to make here.
 */
function OnlinePayments({ store, canEdit, pending, save }: SectionProps) {
    const connected = store.providers.filter((p) => p.status === "CONNECTED");
    const status = store.effectiveProvider
        ? {
              badge: (
                  <Badge variant="success">
                      {providerName(store.effectiveProvider)}
                  </Badge>
              ),
              note: `Checkout here charges through ${providerName(store.effectiveProvider)}.`,
          }
        : connected.length === 0
          ? {
                badge: <Badge variant="neutral">Not connected</Badge>,
                note: "Connect a provider to take payments online.",
            }
          : store.checkoutProvider
            ? {
                  badge: <Badge variant="warning">Choose another</Badge>,
                  note: `${providerName(store.checkoutProvider)} is no longer connected. Choose another below.`,
              }
            : {
                  badge: <Badge variant="warning">Choose one</Badge>,
                  note: "More than one is connected. Choose which one checkout here uses.",
              };
    const inUse = store.providers.find(
        (p) => p.provider === store.effectiveProvider,
    );
    const choice =
        store.providers.length > 1 || (!inUse && store.providers.length > 0);

    return (
        <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                    <span>Online payments</span>
                    {status.badge}
                </div>
                <Link href={PROVIDERS_HREF} className={LINK}>
                    {connected.length === 0
                        ? "Connect a provider"
                        : "Manage providers"}
                </Link>
            </div>
            <Note>{status.note}</Note>
            {choice ? (
                <ul
                    aria-label="Providers for the business"
                    className="overflow-hidden rounded-lg border border-border"
                >
                    {store.providers.map((p) => {
                        const here = store.effectiveProvider === p.provider;
                        const usable = p.status === "CONNECTED";
                        return (
                            <li
                                key={p.provider}
                                className="flex min-h-12 flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13.5px] font-medium">
                                        {providerName(p.provider)}
                                    </span>
                                    <span className="block text-[12px] text-muted-foreground">
                                        {usable
                                            ? "Connected for the business"
                                            : "Turned off for the business"}
                                    </span>
                                </span>
                                {here ? (
                                    <Badge variant="success">In use here</Badge>
                                ) : canEdit && usable ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => {
                                            save(
                                                {
                                                    checkoutProvider:
                                                        p.provider,
                                                },
                                                `Checkout now uses ${providerName(p.provider)}`,
                                            );
                                        }}
                                        aria-label={`Use ${providerName(p.provider)} for this location`}
                                    >
                                        Use here
                                    </Button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}

function Tax({ store, canEdit, pending, save, setStore }: SectionProps) {
    const [rate, setRate] = useState(String(Number(store.taxRate)));
    const rateValid = /^\d{1,2}(\.\d{1,2})?$|^100$/.test(rate.trim());
    const rateDirty = rateValid && Number(rate) !== Number(store.taxRate);

    return (
        <>
            <ToggleRow
                id="storefront-tax"
                label="Charge tax"
                note="Added to each new order at this rate. You can still change one order by hand."
                checked={store.taxEnabled}
                disabled={!canEdit || pending}
                onChange={(taxEnabled) => {
                    setStore((s) => ({ ...s, taxEnabled }));
                    save(
                        { taxEnabled },
                        taxEnabled ? "Tax turned on" : "Tax turned off",
                        () => {
                            setStore((s) => ({
                                ...s,
                                taxEnabled: !taxEnabled,
                            }));
                        },
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
        </>
    );
}

/**
 * A select in every state: once orders lock it, it is the same control shown
 * disabled with "Locked" beside it, so the merchant sees what it is and why
 * it won't move. Before then nothing is said beside it but when it locks.
 */
function Currency({ store, canEdit, pending, save, setStore }: SectionProps) {
    const currencies = CURRENCIES.includes(store.currency)
        ? CURRENCIES
        : [store.currency, ...CURRENCIES];
    const orders = store.orderCount;

    return (
        <div className="grid gap-2">
            <Label htmlFor="storefront-currency">Currency</Label>
            <div className="flex items-center gap-2.5">
                <Select
                    value={store.currency}
                    disabled={store.currencyLocked || !canEdit || pending}
                    onValueChange={(currency) => {
                        const before = store.currency;
                        setStore((s) => ({ ...s, currency }));
                        save(
                            { currency },
                            `Currency set to ${currency}`,
                            () => {
                                setStore((s) => ({ ...s, currency: before }));
                            },
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
                            <SelectItem key={c} value={c} className="font-mono">
                                {c}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {store.currencyLocked ? (
                    <Badge variant="neutral" className="gap-1">
                        <Lock aria-hidden className="size-3" />
                        Locked
                    </Badge>
                ) : null}
            </div>
            <Note id="storefront-currency-note">
                {store.currencyLocked
                    ? `Locked by the ${orders === 1 ? "order" : orders > 1 ? `${orders} orders` : "orders"} taken here, so their totals keep their meaning.`
                    : "Locks after the first order."}
            </Note>
        </div>
    );
}
