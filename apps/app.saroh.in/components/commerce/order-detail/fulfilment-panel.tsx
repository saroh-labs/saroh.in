"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useId, useState } from "react";

import type { PaidHow } from "@/lib/orders/fulfilment-change";
import {
    differenceNote,
    isDeliveryType,
    parseCharge,
    prefillCharge,
    saveLabel,
} from "@/lib/orders/fulfilment-change";
import type { ChangeFulfilmentInput } from "@/lib/orders/kitchen-service";
import type { DeliveryAddress, FulfilmentType } from "@/lib/orders/read";

import { OrderSheet, OrderSheetBody, OrderSheetFoot } from "./order-sheet";
import { FOCUS } from "./parts";

const FIELD =
    "block h-8 w-full rounded-lg border border-border bg-card px-[9px] text-[12.5px] font-normal text-foreground coarse:h-11";

interface AddressDraft {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
}

/**
 * "Change how it's fulfilled" (round-2 B9, the design's option B): a chip
 * per way the API offers, the address a delivery needs, and the delivery
 * charge — typed by staff (decided 2026-09-27), started from the order's
 * own between delivery types and from nothing otherwise. Before the button
 * it says what saving does to the money; the API works it out again.
 *
 * "Tell ‹first›" posts a note in their messages when that reaches them
 * (A13); otherwise it says nothing is sent, so the team tells them.
 *
 * A side sheet over the order: what saving does to the money stays at the
 * foot with Save, and a refusal leaves it open with what was typed.
 */
export function FulfilmentPanel({
    open,
    returnFocus,
    ...draft
}: FulfilmentProps & {
    open: boolean;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
}) {
    return (
        <OrderSheet
            open={open}
            title="Change how it's fulfilled"
            description="It can change until the order is handed over."
            busy={draft.busy}
            onClose={draft.onCancel}
            returnFocus={returnFocus}
        >
            <FulfilmentDraft {...draft} />
        </OrderSheet>
    );
}

interface FulfilmentProps {
    current: FulfilmentType;
    options: { type: FulfilmentType; label: string }[];
    first: string;
    /** The delivery charge now, in major units. */
    shipping: number;
    address: DeliveryAddress | null;
    paid: PaidHow;
    /** Where money handed back goes: "Razorpay", "the till". */
    refundTo: string;
    /** A pay link can be made for more that is owed. */
    linkable: boolean;
    canTell: boolean;
    /** Money in minor units, as the screen says it; null without a money read. */
    format: ((cents: number) => string) | null;
    busy: boolean;
    onCancel: () => void;
    onSave: (input: ChangeFulfilmentInput) => void;
}

/** What is chosen in the sheet: a fresh one each time it opens. */
function FulfilmentDraft({
    current,
    options,
    first,
    shipping,
    address,
    paid,
    refundTo,
    linkable,
    canTell,
    format,
    busy,
    onSave,
}: FulfilmentProps) {
    const ids = useId();
    const [pick, setPick] = useState<FulfilmentType>(current);
    const [charge, setCharge] = useState("");
    const [addr, setAddr] = useState<AddressDraft>({
        line1: address?.line1 ?? "",
        city: address?.city ?? "",
        state: address?.state ?? "",
        postalCode: address?.postalCode ?? "",
    });
    const [tell, setTell] = useState(canTell);

    const choose = (type: FulfilmentType) => {
        setPick(type);
        setCharge(prefillCharge(current, type, shipping));
    };
    const moved = pick !== current;
    const delivery = isDeliveryType(pick);
    const typed = parseCharge(charge);
    const cents = typed.kind === "ok" ? typed.cents : null;
    const difference = cents === null ? 0 : cents - Math.round(shipping * 100);
    const addressMissing =
        delivery &&
        (Object.keys(addr) as (keyof AddressDraft)[]).some(
            (k) => !addr[k].trim(),
        );
    const off =
        !moved || busy || cents === null || (delivery && addressMissing);
    const money = format ?? ((c: number) => (c / 100).toFixed(2));
    const note = !moved
        ? "Pick how it should be fulfilled instead."
        : typed.kind === "bad"
          ? typed.error
          : typed.kind === "empty"
            ? "Type the delivery charge, or 0 for none."
            : delivery && addressMissing
              ? "A delivery needs its first line, town, state and PIN code."
              : `${differenceNote({
                    differenceCents: difference,
                    paid,
                    first,
                    refundTo,
                    linkable,
                    format: money,
                })} The steps already done stay done.`;
    const warn = moved && (typed.kind === "bad" || addressMissing);

    return (
        <>
            <OrderSheetBody>
                <div
                    role="radiogroup"
                    aria-label="Fulfilment"
                    className="flex flex-wrap gap-1.5"
                >
                    {options.map((o) => {
                        const on = pick === o.type;
                        return (
                            <button
                                key={o.type}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => choose(o.type)}
                                className={cn(
                                    FOCUS,
                                    "h-8 cursor-pointer rounded-full border px-3 text-[12.5px] transition-colors active:scale-[0.98] coarse:h-11",
                                    on
                                        ? "border-foreground bg-foreground font-semibold text-background"
                                        : "border-border bg-card font-medium text-neutral-700 hover:bg-muted dark:text-muted-foreground",
                                )}
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
                {moved && delivery ? (
                    <fieldset className="mt-2.5">
                        <legend className="text-[12px] font-medium">
                            Address
                        </legend>
                        <input
                            aria-label="Street and number"
                            value={addr.line1}
                            onChange={(e) =>
                                setAddr((a) => ({
                                    ...a,
                                    line1: e.target.value,
                                }))
                            }
                            className={cn(FOCUS, FIELD, "mt-1")}
                        />
                        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] gap-1.5">
                            <input
                                aria-label="Town or city"
                                placeholder="Town or city"
                                value={addr.city}
                                onChange={(e) =>
                                    setAddr((a) => ({
                                        ...a,
                                        city: e.target.value,
                                    }))
                                }
                                className={cn(FOCUS, FIELD)}
                            />
                            <input
                                aria-label="State"
                                placeholder="State"
                                value={addr.state}
                                onChange={(e) =>
                                    setAddr((a) => ({
                                        ...a,
                                        state: e.target.value,
                                    }))
                                }
                                className={cn(FOCUS, FIELD)}
                            />
                            <input
                                aria-label="PIN code"
                                placeholder="PIN"
                                inputMode="numeric"
                                value={addr.postalCode}
                                onChange={(e) =>
                                    setAddr((a) => ({
                                        ...a,
                                        postalCode: e.target.value,
                                    }))
                                }
                                className={cn(FOCUS, FIELD)}
                            />
                        </div>
                    </fieldset>
                ) : null}
                {moved ? (
                    <label className="mt-2.5 grid w-[140px] gap-1 text-[12px] font-medium">
                        Delivery charge
                        <input
                            type="text"
                            inputMode="decimal"
                            value={charge}
                            onChange={(e) => setCharge(e.target.value)}
                            placeholder="₹"
                            aria-invalid={typed.kind === "bad" || undefined}
                            aria-describedby={`${ids}-note`}
                            className={cn(FOCUS, FIELD, "tabular-nums")}
                        />
                    </label>
                ) : null}
                {moved ? (
                    canTell ? (
                        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12.5px]">
                            <input
                                type="checkbox"
                                checked={tell}
                                onChange={(e) => setTell(e.target.checked)}
                                className={cn(FOCUS, "size-4 cursor-pointer")}
                            />
                            Tell {first} in their messages
                        </label>
                    ) : (
                        <p className="mt-2 text-[12px] text-muted-foreground">
                            Nothing is sent to {first} — let them know by email
                            or phone.
                        </p>
                    )
                ) : null}
            </OrderSheetBody>
            <OrderSheetFoot
                busy={busy}
                note={
                    <p
                        id={`${ids}-note`}
                        aria-live="polite"
                        className={cn(
                            "text-pretty text-[12.5px] leading-[1.5]",
                            warn
                                ? "text-destructive-subtle-foreground"
                                : "text-neutral-700 dark:text-muted-foreground",
                        )}
                    >
                        {note}
                    </p>
                }
            >
                <Button
                    data-ph-unmask=""
                    type="button"
                    disabled={off}
                    onClick={() => {
                        if (cents === null) return;
                        onSave({
                            fulfilment: pick,
                            shipping: typed.kind === "ok" ? typed.money : "0",
                            ...(delivery
                                ? {
                                      address: {
                                          line1: addr.line1.trim(),
                                          city: addr.city.trim(),
                                          state: addr.state.trim(),
                                          postalCode: addr.postalCode.trim(),
                                          line2: address?.line2 ?? null,
                                          name: address?.name ?? null,
                                          phone: address?.phone ?? null,
                                      },
                                  }
                                : {}),
                            ...(canTell ? { tell } : {}),
                        });
                    }}
                >
                    {moved && cents !== null
                        ? saveLabel({
                              differenceCents: difference,
                              paid,
                              linkable,
                              format: money,
                          })
                        : "Save"}
                </Button>
            </OrderSheetFoot>
        </>
    );
}
