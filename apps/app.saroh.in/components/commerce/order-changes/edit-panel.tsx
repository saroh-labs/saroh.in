"use client";

import { FailedRead } from "@/components/shared/states/failed-read";
import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { useState } from "react";

import { sentenceStart } from "@/lib/format/sentence";
import type { EditOrderInput } from "@/lib/orders/kitchen-service";
import type { DeliveryAddress, OrderReadLine } from "@/lib/orders/read";
import type { Sellable } from "@/lib/orders/sellables";
import { addedLines } from "@/lib/orders/sellables";

import { Field } from "@saroh/ui/field";
import {
    OrderSheet,
    OrderSheetBody,
    OrderSheetFoot,
    useOrderSheetDraft,
} from "./order-sheet";
interface AddressDraft {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
}

const draftOf = (a: DeliveryAddress | null): AddressDraft => ({
    line1: a?.line1 ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    postalCode: a?.postalCode ?? "",
});

/**
 * "Edit #1063" — before preparing only: quantities (down to nothing drops a
 * line), "Add an item" from the order's storefront (B8; the API holds its
 * stock there, DEC-032) and, for a delivery, the address. It says what the
 * change does to the money before you save it: more is due on the order
 * (nothing is sent to the customer — Saroh sends no messages), less goes
 * back to how they paid. The API reprices it; the figure here is what the
 * lines cost. An item added is counted at its amount to pay, with its GST
 * on top where GST is added to the price (`sellablesOf`, 12 Oct 2026), so
 * "owes ₹1,180 more" is what the order will ask for.
 *
 * A side sheet over the order: the lines scroll, and what the change does
 * to the money stays at the foot with Save.
 */
export function EditPanel({
    open,
    returnFocus,
    ...draft
}: EditProps & {
    open: boolean;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
}) {
    return (
        <OrderSheet
            open={open}
            title={`Edit ${draft.number}`}
            description="Quantities, items and the address can change until preparing starts."
            busy={draft.busy}
            wide
            onClose={draft.onCancel}
            returnFocus={returnFocus}
        >
            <EditDraft {...draft} />
        </OrderSheet>
    );
}

interface EditProps {
    number: string;
    first: string;
    lines: OrderReadLine[];
    address: DeliveryAddress | null;
    delivery: boolean;
    /** Where money handed back goes: "Razorpay", "the till". */
    refundTo: string;
    format: ((amount: number) => string) | null;
    /**
     * What "Add an item" offers — the order's storefront's catalogue (B8);
     * "unavailable" when it couldn't be read, null when it isn't offered.
     */
    addable?: Sellable[] | "unavailable" | null;
    busy: boolean;
    onCancel: () => void;
    onSave: (input: EditOrderInput) => void;
}

/** What is changed in the sheet: a fresh one each time it opens. */
function EditDraft({
    first,
    lines,
    address,
    delivery,
    refundTo,
    format,
    addable = null,
    busy,
    onSave,
}: EditProps) {
    const [qty, setQty] = useState<Record<string, number>>(() =>
        Object.fromEntries(lines.map((l) => [l.id, l.quantity])),
    );
    const [addr, setAddr] = useState<AddressDraft>(() => draftOf(address));
    const [added, setAdded] = useState<Sellable[]>([]);
    useOrderSheetDraft([qty, addr, added.map((a) => a.key)]);

    const was = draftOf(address);
    const addressChanged =
        delivery &&
        (Object.keys(addr) as (keyof AddressDraft)[]).some(
            (k) => addr[k].trim() !== was[k],
        );
    const changed = lines.filter((l) => qty[l.id] !== l.quantity);
    const diff =
        lines.reduce(
            (n, l) =>
                n + Number(l.price ?? 0) * ((qty[l.id] ?? 0) - l.quantity),
            0,
        ) + added.reduce((n, s) => n + Number(s.price), 0);
    const empty =
        added.length === 0 && lines.every((l) => (qty[l.id] ?? 0) === 0);
    const same = changed.length === 0 && added.length === 0 && !addressChanged;
    const pick = (key: string) => {
        const found =
            addable && addable !== "unavailable"
                ? addable.find((s) => s.key === key && !s.soldOut)
                : undefined;
        if (found) setAdded((a) => [...a, found]);
    };
    const addressMissing =
        addressChanged &&
        (Object.keys(addr) as (keyof AddressDraft)[]).some(
            (k) => !addr[k].trim(),
        );
    const off = same || empty || busy || addressMissing;
    const money = (n: number) => (format ? format(n) : "");

    const note = empty
        ? "Nothing left. Cancel the order with a full refund instead."
        : addressMissing
          ? "An address needs its first line, town, state and PIN code."
          : diff > 0
            ? `${sentenceStart(first)} owes ${money(diff)} more. It shows as due on the order. Nothing is sent to ${first}.`
            : diff < 0
              ? `${money(-diff)} goes back to ${refundTo} when you save.`
              : same
                ? "No changes yet."
                : "Same total. Nothing to charge or refund.";

    const step = (id: string, by: number) =>
        setQty((q) => ({
            ...q,
            [id]: Math.min(99, Math.max(0, (q[id] ?? 0) + by)),
        }));

    return (
        <>
            <OrderSheetBody>
                <div className="flex flex-col gap-1.5">
                    {lines.map((l) => {
                        const name = `${l.name ?? "A product that no longer exists"}${l.variantTitle ? `, ${l.variantTitle}` : ""}`;
                        return (
                            <div key={l.id} className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 text-[13px]">
                                    {name}
                                </span>
                                <IconButton
                                    label={`One fewer ${name}`}
                                    icon={<span>−</span>}
                                    variant="outline"
                                    onClick={() => step(l.id, -1)}
                                />
                                <span
                                    aria-live="polite"
                                    className="min-w-[22px] text-center text-[13.5px] font-semibold tabular-nums"
                                >
                                    {qty[l.id]}
                                </span>
                                <IconButton
                                    label={`One more ${name}`}
                                    icon={<span>+</span>}
                                    variant="outline"
                                    onClick={() => step(l.id, 1)}
                                />
                            </div>
                        );
                    })}
                </div>
                {added.map((s, i) => {
                    const name = `${s.name}${s.variantTitle ? `, ${s.variantTitle}` : ""}`;
                    return (
                        <div
                            // A pick has no id of its own; its place is its key.
                            key={`${s.key}-${i}`}
                            className="mt-1.5 flex items-center gap-2 border-t border-border py-[7px] text-[13px]"
                        >
                            <span className="min-w-0 flex-1">
                                {name}{" "}
                                <span className="text-muted-foreground">
                                    · added
                                </span>
                            </span>
                            <span className="tabular-nums">
                                {money(Number(s.price))}
                            </span>
                            <Button
                                variant="link"
                                size="inline"
                                type="button"
                                onClick={() =>
                                    setAdded((a) => a.filter((_, j) => j !== i))
                                }
                                aria-label={`Remove ${name}`}
                                className="text-destructive hover:text-destructive"
                            >
                                Remove
                            </Button>
                        </div>
                    );
                })}
                {addable === "unavailable" ? (
                    <FailedRead
                        className="mt-2.5"
                        things="the products"
                        reassurance="Nothing can be added until they load. Quantities and the address still change."
                    />
                ) : addable && addable.length > 0 ? (
                    <Field label="Add an item" className="mt-2.5">
                        <OptionSelect
                            size="sm"
                            // Picking adds a line and the box empties again.
                            value=""
                            onValueChange={pick}
                            placeholder="Choose a product…"
                            className="w-full min-w-[150px]"
                            options={addable.map((s) => ({
                                value: s.key,
                                label: `${s.name}${s.variantTitle ? `, ${s.variantTitle}` : ""}${format ? ` · ${format(Number(s.price))}` : ""}${s.soldOut ? " · sold out here" : ""}`,
                                disabled: s.soldOut,
                            }))}
                        />
                    </Field>
                ) : null}
                {delivery ? (
                    <fieldset className="mt-3">
                        <legend className="text-[12px] font-medium">
                            Delivery address
                        </legend>
                        <Input
                            aria-label="Street and number"
                            value={addr.line1}
                            onChange={(e) =>
                                setAddr((a) => ({
                                    ...a,
                                    line1: e.target.value,
                                }))
                            }
                            className="mt-[5px] w-full"
                        />
                        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] gap-1.5">
                            <Input
                                aria-label="Town or city"
                                placeholder="Town or city"
                                value={addr.city}
                                onChange={(e) =>
                                    setAddr((a) => ({
                                        ...a,
                                        city: e.target.value,
                                    }))
                                }
                                className="w-full"
                            />
                            <Input
                                aria-label="State"
                                placeholder="State"
                                value={addr.state}
                                onChange={(e) =>
                                    setAddr((a) => ({
                                        ...a,
                                        state: e.target.value,
                                    }))
                                }
                                className="w-full"
                            />
                            <Input
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
                                className="w-full"
                            />
                        </div>
                    </fieldset>
                ) : null}
            </OrderSheetBody>
            <OrderSheetFoot
                saveLabel={
                    diff > 0
                        ? `Save (${money(diff)} more due)`
                        : diff < 0
                          ? `Save and refund ${money(-diff)}`
                          : "Save"
                }
                saveOff={off}
                onSubmit={() =>
                    onSave({
                        ...(changed.length
                            ? {
                                  lines: changed.map((l) => ({
                                      itemId: l.id,
                                      quantity: qty[l.id] ?? 0,
                                  })),
                              }
                            : {}),
                        ...(added.length ? { add: addedLines(added) } : {}),
                        ...(addressChanged
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
                    })
                }
                note={
                    <p
                        aria-live="polite"
                        className={cn(
                            "text-pretty text-[12.5px] leading-[1.5]",
                            empty || addressMissing
                                ? "text-destructive-subtle-foreground"
                                : diff !== 0
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                        )}
                    >
                        {note}
                    </p>
                }
            />
        </>
    );
}
