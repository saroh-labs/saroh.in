"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useState } from "react";

import type { EditOrderInput } from "@/lib/orders/kitchen-service";
import type { DeliveryAddress, OrderReadLine } from "@/lib/orders/read";

import { actionClass, FOCUS, PanelTitle, WorkPanel } from "./parts";

const FIELD =
    "block h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] font-normal coarse:h-11";

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
 * line) and, for a delivery, the address. It says what the change does to
 * the money before you save it: more is due on the order (nothing is sent to
 * the customer — Saroh sends no messages), less goes back to how they paid.
 * The API reprices it; the figure here is what the lines cost.
 */
export function EditPanel({
    number,
    first,
    lines,
    address,
    delivery,
    refundTo,
    format,
    busy,
    onCancel,
    onSave,
}: {
    number: string;
    first: string;
    lines: OrderReadLine[];
    address: DeliveryAddress | null;
    delivery: boolean;
    /** Where money handed back goes: "Razorpay", "the till". */
    refundTo: string;
    format: ((amount: number) => string) | null;
    busy: boolean;
    onCancel: () => void;
    onSave: (input: EditOrderInput) => void;
}) {
    const [qty, setQty] = useState<Record<string, number>>(() =>
        Object.fromEntries(lines.map((l) => [l.id, l.quantity])),
    );
    const [addr, setAddr] = useState<AddressDraft>(() => draftOf(address));

    const was = draftOf(address);
    const addressChanged =
        delivery &&
        (Object.keys(addr) as (keyof AddressDraft)[]).some(
            (k) => addr[k].trim() !== was[k],
        );
    const changed = lines.filter((l) => qty[l.id] !== l.quantity);
    const diff = lines.reduce(
        (n, l) => n + Number(l.price ?? 0) * ((qty[l.id] ?? 0) - l.quantity),
        0,
    );
    const empty = lines.every((l) => (qty[l.id] ?? 0) === 0);
    const same = changed.length === 0 && !addressChanged;
    const addressMissing =
        addressChanged &&
        (Object.keys(addr) as (keyof AddressDraft)[]).some(
            (k) => !addr[k].trim(),
        );
    const off = same || empty || busy || addressMissing;
    const money = (n: number) => (format ? format(n) : "");

    const note = empty
        ? "Nothing left — cancel the order with a full refund instead."
        : addressMissing
          ? "An address needs its first line, town, state and PIN code."
          : diff > 0
            ? `${first} owes ${money(diff)} more. It shows as due on the order — nothing is sent to ${first}.`
            : diff < 0
              ? `${money(-diff)} goes back to ${refundTo} when you save.`
              : same
                ? "No changes yet."
                : "Same total — nothing to charge or refund.";

    const step = (id: string, by: number) =>
        setQty((q) => ({
            ...q,
            [id]: Math.min(99, Math.max(0, (q[id] ?? 0) + by)),
        }));

    return (
        <WorkPanel label="Edit order">
            <PanelTitle>Edit {number}</PanelTitle>
            <div className="mt-2.5 flex flex-col gap-1.5">
                {lines.map((l) => {
                    const name = `${l.name ?? "A product that no longer exists"}${l.variantTitle ? `, ${l.variantTitle}` : ""}`;
                    return (
                        <div key={l.id} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 text-[13px]">
                                {name}
                            </span>
                            <button
                                type="button"
                                onClick={() => step(l.id, -1)}
                                aria-label={`One fewer ${name}`}
                                className={cn(
                                    FOCUS,
                                    "size-[30px] rounded-[7px] border border-border bg-card text-[15px] coarse:size-11",
                                )}
                            >
                                −
                            </button>
                            <span
                                aria-live="polite"
                                className="min-w-[22px] text-center text-[13.5px] font-semibold tabular-nums"
                            >
                                {qty[l.id]}
                            </span>
                            <button
                                type="button"
                                onClick={() => step(l.id, 1)}
                                aria-label={`One more ${name}`}
                                className={cn(
                                    FOCUS,
                                    "size-[30px] rounded-[7px] border border-border bg-card text-[15px] coarse:size-11",
                                )}
                            >
                                +
                            </button>
                        </div>
                    );
                })}
            </div>
            {delivery ? (
                <fieldset className="mt-3">
                    <legend className="text-[12px] font-medium">
                        Delivery address
                    </legend>
                    <input
                        aria-label="Street and number"
                        value={addr.line1}
                        onChange={(e) =>
                            setAddr((a) => ({ ...a, line1: e.target.value }))
                        }
                        className={cn(FIELD, "mt-[5px]")}
                    />
                    <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px] gap-1.5">
                        <input
                            aria-label="Town or city"
                            placeholder="Town or city"
                            value={addr.city}
                            onChange={(e) =>
                                setAddr((a) => ({ ...a, city: e.target.value }))
                            }
                            className={FIELD}
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
                            className={FIELD}
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
                            className={FIELD}
                        />
                    </div>
                </fieldset>
            ) : null}
            <p
                aria-live="polite"
                className={cn(
                    "mt-2.5 text-pretty text-[12.5px] leading-[1.5]",
                    empty || addressMissing
                        ? "text-destructive-subtle-foreground"
                        : diff !== 0
                          ? "text-brand-subtle-foreground"
                          : "text-muted-foreground",
                )}
            >
                {note}
            </p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    onClick={onCancel}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    className={actionClass("primary")}
                    disabled={off}
                    onClick={() =>
                        onSave({
                            ...(changed.length
                                ? {
                                      lines: changed.map((l) => ({
                                          itemId: l.id,
                                          quantity: qty[l.id] ?? 0,
                                      })),
                                  }
                                : {}),
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
                >
                    {diff > 0
                        ? `Save — ${money(diff)} more due`
                        : diff < 0
                          ? `Save and refund ${money(-diff)}`
                          : "Save"}
                </Button>
            </div>
        </WorkPanel>
    );
}
