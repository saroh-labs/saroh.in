"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Switch } from "@saroh/ui/switch";
import { useState } from "react";

import { STOREFRONT_FULFILMENT_TYPES } from "@/lib/stores/fulfilment-types";
import type { LateUnit } from "@/lib/stores/late-after";
import {
    DEFAULT_LATE_AFTER,
    FULFILMENT_LABEL,
    lateAfterField,
    lateAfterMinutes,
    lateAfterWords,
    ORDERS_NOUN,
} from "@/lib/stores/late-after";
import {
    ADDRESS_FIELD_ID,
    LOCATION_SECTIONS,
    savedWays,
} from "@/lib/stores/location-readiness";
import type {
    StorefrontFulfilmentType,
    StorefrontInput,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

import { FreeOverRow } from "./free-over-row";
import { LegacyWays } from "./legacy-ways";
import type { SectionProps } from "./location-save";
import { jumpTo } from "./location-save";
import { Note, Section } from "./storefront-section";

/** Where Orders' notice sends someone to change a threshold. */
export const LATE_AFTER_ANCHOR = "late-after";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

type Way = StorefrontFulfilmentType;
type Paid = "LOCAL_DELIVERY" | "SHIPPING";

/**
 * Delivery: one row per way an order leaves (Pick-up, Local delivery,
 * Shipping), each with its switch, its fee on the website and when its
 * orders count as late, side by side (the 9 Oct audit; B17, G13).
 *
 * A switch saves when flipped; a row's fee and late time save together
 * with its Save, like every other control on the page. Digital products and
 * bookings have no row: Digital is never late, and a booking follows its
 * visits.
 *
 * Pick-up needs a door (UX-025): a location with no counter can't turn it
 * on, and says why beside the switch. One that already has it on (saved
 * before, or set through the API) shows it as it is, says the website
 * doesn't offer it, and can turn it off. Nothing is changed for it here.
 */
export function FulfilmentSection(props: SectionProps) {
    const { store } = props;
    const ways = savedWays(store);
    const delivers = ways.some((w) => w !== "PICKUP");

    return (
        <Section
            title={LOCATION_SECTIONS.delivery.label}
            id={LOCATION_SECTIONS.delivery.id}
        >
            {store.fulfilmentTypes ? (
                <div id={LATE_AFTER_ANCHOR} className="grid scroll-mt-20 gap-3">
                    <ul
                        aria-label="Ways orders leave"
                        className="overflow-hidden rounded-lg border border-border"
                    >
                        {STOREFRONT_FULFILMENT_TYPES.map((type) => (
                            <WayRow
                                // A saved value starts the row afresh.
                                key={`${type}-${String(fee(store, type))}-${store.lateAfterMinutes?.[type] ?? ""}`}
                                {...props}
                                type={type}
                                types={store.fulfilmentTypes ?? []}
                            />
                        ))}
                    </ul>
                    <Note>
                        {store.fulfilmentTypes.length === 0
                            ? "None on: orders from here are only digital products or bookings."
                            : store.siteShop
                              ? "Your website checkout offers these. Bookings and digital products follow the product."
                              : "Bookings and digital products follow the product."}{" "}
                        Late counts from when an order is placed.
                    </Note>
                </div>
            ) : (
                <LegacyWays {...props} />
            )}
            {delivers || (!store.fulfilmentTypes && store.shippingEnabled) ? (
                <FreeOverRow {...props} />
            ) : null}
        </Section>
    );
}

/**
 * One way an order leaves: "Local delivery [on] Fee [60] Late after [24]
 * [hours ▾] Save". On a phone its parts stack; nothing scrolls sideways.
 */
function WayRow({
    store,
    canEdit,
    pending,
    save,
    setStore,
    goTo,
    type,
    types,
}: SectionProps & { type: Way; types: Way[] }) {
    const on = types.includes(type);
    const label = FULFILMENT_LABEL[type];
    const id = `storefront-way-${type.toLowerCase()}`;
    const counter = store.kind === "SHOP";
    // Pick-up needs a place customers visit (UX-025, the API's rule at the
    // site's checkout). Off and with no counter, it can't be turned on.
    const pickup = type === "PICKUP";
    const blocked = pickup && !counter && !on;
    const reason = pickup
        ? !counter
            ? on
                ? "Not on your website: it needs a counter."
                : "Needs a counter"
            : on && !store.address?.trim()
              ? "Not on your website until the address is added."
              : null
        : null;

    // The fee, on the website's checkout (G13): only while its shop is open.
    const paid: Paid | null =
        type === "PICKUP" || !store.siteShop ? null : type;
    const savedFee = paid ? (fee(store, paid) ?? "") : "";
    const [feeText, setFeeText] = useState(savedFee);
    const typedFee = feeText.trim();
    const feeOk = typedFee === "" || MONEY_RE.test(typedFee);
    const feeDirty =
        paid !== null &&
        typedFee !== savedFee &&
        !(typedFee === "0" && savedFee === "");

    const minutes = (store.lateAfterMinutes ?? DEFAULT_LATE_AFTER)[type];
    const initial = lateAfterField(minutes);
    const [amount, setAmount] = useState(initial.amount);
    const [unit, setUnit] = useState<LateUnit>(initial.unit);
    const read = lateAfterMinutes(amount, unit);
    const lateDirty = !read.ok || read.minutes !== minutes;
    const dirty = on && (feeDirty || lateDirty);
    const ok = feeOk && read.ok;

    const toggle = (value: boolean) => {
        const next = STOREFRONT_FULFILMENT_TYPES.filter((t) =>
            t === type ? value : types.includes(t),
        );
        setStore((s) => ({ ...s, fulfilmentTypes: next }));
        save(
            { fulfilmentTypes: next },
            `${label} turned ${value ? "on" : "off"}`,
            () => setStore((s) => ({ ...s, fulfilmentTypes: types })),
        );
    };

    const submit = () => {
        if (!dirty || !feeOk || !read.ok) return;
        const nextFee =
            typedFee === "" || Number(typedFee) === 0 ? null : typedFee;
        const lateChanged = read.minutes !== minutes;
        const input: StorefrontInput = lateChanged
            ? { lateAfterMinutes: { [type]: read.minutes } }
            : {};
        if (feeDirty) {
            if (paid === "LOCAL_DELIVERY") input.localDeliveryFee = nextFee;
            if (paid === "SHIPPING") input.shippingFee = nextFee;
        }
        save(
            input,
            feeDirty && lateChanged
                ? `${label} saved`
                : feeDirty
                  ? nextFee
                      ? `${label} on your website now costs ${store.currency} ${nextFee}`
                      : `${label} on your website is now free`
                  : `${capitalise(ORDERS_NOUN[type])} now count as late after ${lateAfterWords(read.minutes)}`,
        );
    };

    const problem = !feeOk
        ? "A fee is a number with up to 2 decimals, like 60 or 49.50."
        : !read.ok
          ? `${read.error} Between 5 minutes and 30 days.`
          : null;

    return (
        <li className="border-b border-border px-3 py-3 last:border-b-0">
            <form
                className="flex flex-wrap items-end gap-x-4 gap-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <div className="flex min-w-0 flex-[1_1_200px] items-center justify-between gap-3 self-center">
                    <span className="min-w-0">
                        <Label
                            htmlFor={id}
                            className={cn(
                                "text-[13.5px] font-medium",
                                blocked && "text-muted-foreground",
                            )}
                        >
                            {label}
                        </Label>
                        {reason ? (
                            <span
                                id={`${id}-reason`}
                                className="block text-pretty text-[12px] leading-[1.45] text-muted-foreground"
                            >
                                {reason}
                                {pickup && counter && canEdit ? (
                                    <>
                                        {" "}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (goTo) {
                                                    goTo(
                                                        "the-place",
                                                        ADDRESS_FIELD_ID,
                                                    );
                                                } else {
                                                    jumpTo(ADDRESS_FIELD_ID);
                                                }
                                            }}
                                            className="rounded-sm font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground"
                                        >
                                            Add address
                                        </button>
                                    </>
                                ) : null}
                            </span>
                        ) : null}
                    </span>
                    <Switch
                        id={id}
                        checked={on}
                        disabled={!canEdit || pending || blocked}
                        aria-describedby={reason ? `${id}-reason` : undefined}
                        onCheckedChange={toggle}
                        className="shrink-0"
                    />
                </div>

                {on && paid ? (
                    <div className="grid w-32 gap-1">
                        <Label
                            htmlFor={`${id}-fee`}
                            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        >
                            <span className="sr-only">{label} </span>Fee
                            <span className="sr-only">
                                {" "}
                                on your website, {store.currency}
                            </span>
                        </Label>
                        <div className="relative">
                            <Input
                                id={`${id}-fee`}
                                inputMode="decimal"
                                placeholder="Free"
                                value={feeText}
                                readOnly={!canEdit}
                                aria-invalid={!feeOk || undefined}
                                aria-describedby={
                                    problem ? `${id}-problem` : undefined
                                }
                                onChange={(e) => setFeeText(e.target.value)}
                                className="pr-11 tabular-nums"
                            />
                            <span
                                aria-hidden
                                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11.5px] text-muted-foreground"
                            >
                                {store.currency}
                            </span>
                        </div>
                    </div>
                ) : null}

                {on ? (
                    <div className="grid gap-1">
                        <Label
                            htmlFor={`${id}-late`}
                            className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                        >
                            <span className="sr-only">{label} </span>Late after
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <Input
                                id={`${id}-late`}
                                inputMode="numeric"
                                value={amount}
                                readOnly={!canEdit}
                                aria-invalid={!read.ok || undefined}
                                aria-describedby={
                                    problem ? `${id}-problem` : undefined
                                }
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-16 tabular-nums"
                            />
                            <Select
                                value={unit}
                                onValueChange={(v) => setUnit(v as LateUnit)}
                                disabled={!canEdit}
                            >
                                <SelectTrigger
                                    aria-label={`${label} late after, unit`}
                                    className="w-[104px]"
                                >
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="hours">hours</SelectItem>
                                    <SelectItem value="minutes">
                                        minutes
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                ) : null}

                {canEdit && dirty ? (
                    <Button type="submit" disabled={pending || !ok}>
                        Save
                    </Button>
                ) : null}

                {on && problem ? (
                    <p
                        id={`${id}-problem`}
                        role="alert"
                        className="basis-full text-pretty text-[12px] leading-[1.5] text-destructive"
                    >
                        {problem}
                    </p>
                ) : null}
            </form>
        </li>
    );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The website checkout's fee for a way (G13); null is free. */
function fee(store: StorefrontSettings, type: Way): string | null {
    if (type === "LOCAL_DELIVERY") return store.localDeliveryFee ?? null;
    if (type === "SHIPPING") return store.shippingFee ?? null;
    return null;
}
