"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
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

import {
    CellLabel,
    deliveryGrid,
    LateAfterField,
    MoneyField,
} from "./delivery-fields";
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
 * Delivery: one list, a row per way an order leaves (Pick-up, Local
 * delivery, Shipping), then Free delivery over; the owner's layout of
 * 9 Oct:
 *
 *                       Fee            Late after
 *     ○  Pick-up        needs a counter
 *     ●  Local delivery [ Free ₹ ]     [ 24 hours ▾ ]
 *     ─────────────────────────────────────────────
 *        Free delivery over [ Never ₹ ]
 *
 * No card and no frame: hairlines between rows, and the inputs the only
 * boxes. The switch leads each row and is named by it; the column headers
 * are said once, and on a phone, where a row stacks, each field carries its
 * own small label instead.
 *
 * A switch saves when flipped; a row's fee and late time save together with
 * its Save, like every other control on the page. Digital products and
 * bookings have no row: Digital is never late, and a booking follows its
 * visits.
 *
 * Pick-up needs a door (UX-025): a location with no counter can't turn it
 * on, and says so where its fields would be. One that already has it on
 * (saved before, or set through the API) shows it as it is, says the
 * website doesn't offer it, and can turn it off. Nothing changes on render.
 */
export function FulfilmentSection(props: SectionProps) {
    const { store } = props;
    const ways = savedWays(store);
    const delivers = ways.some((w) => w !== "PICKUP");
    // The fee is the website checkout's (G13): a column only while the
    // business's online shop is open.
    const withFee = Boolean(store.siteShop);
    const grid = deliveryGrid(withFee);

    return (
        <Section
            title={LOCATION_SECTIONS.delivery.label}
            id={LOCATION_SECTIONS.delivery.id}
        >
            {store.fulfilmentTypes ? (
                <div id={LATE_AFTER_ANCHOR} className="grid scroll-mt-20 gap-3">
                    {/* Says what the list is for, before it: the free-delivery row
                        under the ways is a rule of its own. */}
                    {store.fulfilmentTypes.length === 0 ? (
                        <Note>
                            None on: orders from here are only digital products
                            or bookings.
                        </Note>
                    ) : store.siteShop ? (
                        <Note>Your website checkout offers these.</Note>
                    ) : null}
                    <div>
                        <div
                            aria-hidden
                            className={cn(
                                "hidden gap-x-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:grid",
                                grid,
                            )}
                        >
                            <span />
                            {withFee ? <span>Fee</span> : null}
                            <span>Late after</span>
                            <span />
                        </div>
                        <ul
                            aria-label="Ways orders leave"
                            className="divide-y divide-border border-t border-border"
                        >
                            {STOREFRONT_FULFILMENT_TYPES.map((type) => (
                                <WayRow
                                    // A saved value starts the row afresh.
                                    key={`${type}-${String(fee(store, type))}-${store.lateAfterMinutes?.[type] ?? ""}`}
                                    {...props}
                                    type={type}
                                    types={store.fulfilmentTypes ?? []}
                                    withFee={withFee}
                                />
                            ))}
                            {delivers ? (
                                <li>
                                    <FreeOverRow {...props} withFee={withFee} />
                                </li>
                            ) : null}
                        </ul>
                    </div>
                </div>
            ) : (
                <>
                    <LegacyWays {...props} />
                    {store.shippingEnabled ? (
                        <FreeOverRow {...props} withFee={withFee} />
                    ) : null}
                </>
            )}
        </Section>
    );
}

/**
 * One way an order leaves: "● Local delivery  [ Free ₹ ]  [ 24 hours ▾ ]
 * Save". On a phone the switch and name come first, then the two fields
 * side by side; nothing scrolls sideways.
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
    withFee,
}: SectionProps & { type: Way; types: Way[]; withFee: boolean }) {
    const on = types.includes(type);
    const label = FULFILMENT_LABEL[type];
    const id = `storefront-way-${type.toLowerCase()}`;
    const counter = store.kind === "SHOP";
    // Pick-up needs a place customers visit (UX-025, the API's rule at the
    // site's checkout). Off and with no counter, it can't be turned on.
    const pickup = type === "PICKUP";
    const blocked = pickup && !counter && !on;
    const reason = !pickup
        ? null
        : !counter
          ? on
              ? "Not on your website: it needs a counter."
              : null
          : on && !store.address?.trim()
            ? "Not on your website until the address is added."
            : null;

    const paid: Paid | null = type === "PICKUP" || !withFee ? null : type;
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
    const problemId = problem ? `${id}-problem` : undefined;

    return (
        <li>
            <form
                className={cn(
                    "grid gap-x-4 gap-y-2.5 py-3 sm:items-center",
                    deliveryGrid(withFee),
                )}
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <div className="flex min-w-0 items-start gap-3">
                    <Switch
                        id={id}
                        checked={on}
                        disabled={!canEdit || pending || blocked}
                        aria-describedby={
                            blocked
                                ? `${id}-blocked`
                                : reason
                                  ? `${id}-reason`
                                  : undefined
                        }
                        onCheckedChange={toggle}
                        className="mt-px shrink-0"
                    />
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
                                {counter && canEdit ? (
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
                </div>

                {blocked ? (
                    // Where its fields would be: why there are none.
                    <p
                        id={`${id}-blocked`}
                        className={cn(
                            "pl-14 text-[12.5px] text-muted-foreground sm:pl-0",
                            withFee ? "sm:col-span-3" : "sm:col-span-2",
                        )}
                    >
                        Needs a counter
                    </p>
                ) : on ? (
                    <>
                        {/* On a phone the two fields sit side by side
                            under the way; at the desk they are its
                            columns. */}
                        <div className="grid grid-cols-2 gap-3 sm:contents">
                            {withFee ? (
                                <div
                                    className={cn(
                                        "grid min-w-0 gap-1",
                                        // Pick-up has no fee: nothing to
                                        // show on a phone.
                                        !paid && "max-sm:hidden",
                                    )}
                                >
                                    {paid ? (
                                        <>
                                            <CellLabel
                                                htmlFor={`${id}-fee`}
                                                way={label}
                                            >
                                                Fee
                                            </CellLabel>
                                            <MoneyField
                                                id={`${id}-fee`}
                                                value={feeText}
                                                placeholder="Free"
                                                currency={store.currency}
                                                readOnly={!canEdit}
                                                invalid={!feeOk}
                                                describedBy={problemId}
                                                onChange={setFeeText}
                                            />
                                        </>
                                    ) : (
                                        <span className="text-[12.5px] text-muted-foreground">
                                            No fee
                                        </span>
                                    )}
                                </div>
                            ) : null}
                            <div className="grid min-w-0 gap-1">
                                <CellLabel htmlFor={`${id}-late`} way={label}>
                                    Late after
                                </CellLabel>
                                <LateAfterField
                                    id={`${id}-late`}
                                    way={label}
                                    amount={amount}
                                    unit={unit}
                                    readOnly={!canEdit}
                                    invalid={!read.ok}
                                    describedBy={problemId}
                                    onAmount={setAmount}
                                    onUnit={setUnit}
                                />
                            </div>
                        </div>
                        <div className="max-sm:empty:hidden sm:justify-self-end">
                            {canEdit && dirty ? (
                                <Button type="submit" disabled={pending || !ok}>
                                    Save
                                </Button>
                            ) : null}
                        </div>
                    </>
                ) : null}

                {on && problem ? (
                    <p
                        id={problemId}
                        role="alert"
                        className="text-pretty text-[12px] leading-[1.5] text-destructive sm:col-span-full sm:pl-14"
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
