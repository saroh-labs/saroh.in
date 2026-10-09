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
import { pickupNotOffered } from "@/lib/stores/pickup-place";
import type {
    StorefrontFulfilmentType,
    StorefrontInput,
    StorefrontSettings,
} from "@/lib/stores/storefronts";

import { DeliveryFeeRow } from "./delivery-fee-row";
import { Note, Section } from "./storefront-section";

/** Where Orders' notice sends someone to change a threshold. */
export const LATE_AFTER_ANCHOR = "late-after";

type Saver = (
    input: StorefrontInput,
    said: string,
    onFail?: () => void,
) => void;

/**
 * How a storefront's orders leave, and when they count as late (plan B,
 * B17): a chip per way — Pick-up, Local delivery, Shipping — and, for each
 * way it offers, "Mark ‹type› orders late after [N] [hours ▾]".
 *
 * The chips replace the collection and delivery switches; the API keeps
 * those in step. A chip saves when pressed, a threshold when its Save is
 * pressed, like every other control on this screen. Digital and
 * appointments have no chip and no row: Digital is never late, and an
 * appointment follows its visits.
 */
export function FulfilmentSection({
    store,
    types,
    canEdit,
    pending,
    save,
    setStore,
}: {
    store: StorefrontSettings;
    types: StorefrontFulfilmentType[];
    canEdit: boolean;
    pending: boolean;
    save: Saver;
    setStore: (fn: (s: StorefrontSettings) => StorefrontSettings) => void;
}) {
    // Pick-up needs a door: an online store is offered it only while it
    // already has it on, so it can turn it off.
    const offered = STOREFRONT_FULFILMENT_TYPES.filter(
        (t) => t !== "PICKUP" || store.kind === "SHOP" || types.includes(t),
    );
    const late = store.lateAfterMinutes ?? DEFAULT_LATE_AFTER;
    // Pick-up on, but nowhere to collect from (UX-025): said here, inline.
    const noPlace = pickupNotOffered({ ...store, fulfilmentTypes: types });

    const toggle = (type: StorefrontFulfilmentType) => {
        const on = types.includes(type);
        const next = STOREFRONT_FULFILMENT_TYPES.filter((t) =>
            t === type ? !on : types.includes(t),
        );
        setStore((s) => ({ ...s, fulfilmentTypes: next }));
        save(
            { fulfilmentTypes: next },
            `${FULFILMENT_LABEL[type]} turned ${on ? "off" : "on"}`,
            () => setStore((s) => ({ ...s, fulfilmentTypes: types })),
        );
    };

    return (
        <Section title="How orders leave" id={LATE_AFTER_ANCHOR}>
            <div className="grid gap-2">
                <div
                    role="group"
                    aria-label="How orders from here reach the customer"
                    aria-describedby="storefront-ways-note"
                    className="flex flex-wrap gap-1.5"
                >
                    {offered.map((type) => {
                        const on = types.includes(type);
                        return (
                            <button
                                key={type}
                                type="button"
                                aria-pressed={on}
                                disabled={!canEdit || pending}
                                onClick={() => toggle(type)}
                                className={cn(
                                    "h-[30px] rounded-full border px-3 text-[12.5px] disabled:cursor-not-allowed disabled:opacity-60 coarse:h-11",
                                    on
                                        ? "border-foreground bg-foreground font-semibold text-background"
                                        : "border-border bg-card font-medium text-foreground/75 hover:bg-muted/50",
                                )}
                            >
                                {FULFILMENT_LABEL[type]}
                            </button>
                        );
                    })}
                </div>
                {noPlace ? (
                    <p
                        role="note"
                        className="text-pretty rounded-lg bg-warning-subtle px-3 py-2 text-[12.5px] leading-[1.5] text-warning-subtle-foreground"
                    >
                        {noPlace}
                    </p>
                ) : null}
                <Note id="storefront-ways-note">
                    {types.length === 0
                        ? "None chosen: orders from here are only ever digital or booked visits."
                        : "The ways an order from here can reach the customer. Digital products and bookings follow the product, so they need no chip."}
                </Note>
            </div>

            {store.siteShop
                ? (["LOCAL_DELIVERY", "SHIPPING"] as const)
                      .filter((type) => types.includes(type))
                      .map((type) => (
                          <DeliveryFeeRow
                              key={`${type}-${String(fee(store, type))}`}
                              type={type}
                              fee={fee(store, type)}
                              currency={store.currency}
                              canEdit={canEdit}
                              pending={pending}
                              save={save}
                          />
                      ))
                : null}

            <div className="grid gap-3">
                <div>
                    <p className="text-[13.5px] font-medium">
                        When is an order late?
                    </p>
                    <Note>
                        Counted from when the order is placed. Past this, it
                        shows as Late on Home, in Orders and on the order
                        itself, until it is handed over.
                    </Note>
                </div>
                {types.length === 0 ? (
                    <Note>
                        Choose how orders leave to set when they count as late.
                    </Note>
                ) : (
                    types.map((type) => (
                        <LateAfterRow
                            key={`${type}-${late[type]}`}
                            type={type}
                            minutes={late[type]}
                            canEdit={canEdit}
                            pending={pending}
                            save={save}
                        />
                    ))
                )}
            </div>
        </Section>
    );
}

/** "Mark pick-up orders late after [2] [hours ▾]", and its Save. */
function LateAfterRow({
    type,
    minutes,
    canEdit,
    pending,
    save,
}: {
    type: StorefrontFulfilmentType;
    minutes: number;
    canEdit: boolean;
    pending: boolean;
    save: Saver;
}) {
    const initial = lateAfterField(minutes);
    const [amount, setAmount] = useState(initial.amount);
    const [unit, setUnit] = useState<LateUnit>(initial.unit);
    const read = lateAfterMinutes(amount, unit);
    const dirty = !read.ok || read.minutes !== minutes;
    const id = `storefront-late-${type.toLowerCase()}`;
    const noun = ORDERS_NOUN[type];

    return (
        <form
            className="grid gap-1.5"
            onSubmit={(e) => {
                e.preventDefault();
                if (!read.ok || read.minutes === minutes) return;
                save(
                    { lateAfterMinutes: { [type]: read.minutes } },
                    `${capitalise(noun)} now count as late after ${lateAfterWords(read.minutes)}`,
                );
            }}
        >
            <Label htmlFor={id} className="text-[12.5px] font-medium">
                Mark {noun} late after
            </Label>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    id={id}
                    inputMode="numeric"
                    value={amount}
                    readOnly={!canEdit}
                    aria-invalid={!read.ok || undefined}
                    aria-describedby={`${id}-note`}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-20 tabular-nums"
                />
                <Select
                    value={unit}
                    onValueChange={(v) => setUnit(v as LateUnit)}
                    disabled={!canEdit}
                >
                    <SelectTrigger
                        aria-label={`Unit for ${noun}`}
                        className="w-[120px]"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="hours">hours</SelectItem>
                        <SelectItem value="minutes">minutes</SelectItem>
                    </SelectContent>
                </Select>
                {canEdit && dirty ? (
                    <Button type="submit" disabled={pending || !read.ok}>
                        Save
                    </Button>
                ) : null}
            </div>
            <p
                id={`${id}-note`}
                role={read.ok ? undefined : "alert"}
                className={cn(
                    "text-pretty text-[12px] leading-[1.5]",
                    read.ok ? "text-muted-foreground" : "text-destructive",
                )}
            >
                {read.ok
                    ? helpFor(type)
                    : `${read.error} Between 5 minutes and 30 days.`}
            </p>
        </form>
    );
}

function helpFor(type: StorefrontFulfilmentType): string {
    // No business type's figure is suggested (UX-082): a counter sets its own.
    const start = `Starts at ${lateAfterWords(DEFAULT_LATE_AFTER[type])}.`;
    return type === "PICKUP" ? `${start} Set what suits your counter.` : start;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The website checkout's fee for a way (G13); null is free. */
function fee(
    store: StorefrontSettings,
    type: "LOCAL_DELIVERY" | "SHIPPING",
): string | null {
    return (
        (type === "LOCAL_DELIVERY"
            ? store.localDeliveryFee
            : store.shippingFee) ?? null
    );
}
