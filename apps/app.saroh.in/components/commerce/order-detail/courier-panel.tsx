"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { useEffect, useId, useRef, useState } from "react";

import type { CourierFields, Shipment } from "@/lib/orders/courier";
import {
    COURIER_FIELD_MAX,
    courierChoices,
    courierFields,
    courierName,
    COURIERS,
    isTrackingLink,
    OTHER_COURIER,
    OWN_DRIVER,
} from "@/lib/orders/courier";

import { OrderSheet, OrderSheetBody, OrderSheetFoot } from "./order-sheet";
import { FOCUS } from "./parts";

const FIELD =
    "mt-[5px] block h-9 w-full rounded-lg border border-border bg-card px-2.5 font-mono text-[13px] font-normal coarse:h-11";

/**
 * The courier's details (B10, DEC-045): who took it, their tracking number
 * and, if they gave one, the tracking link — every one optional, since the
 * number often comes after the parcel goes. Saroh books no pickup and sends
 * no message: what is typed stays on the order, where the team can see it.
 *
 * `handover` is the "Hand to courier" step itself (the design's panel);
 * `change` fills them in or corrects them afterwards — "No tracking number
 * yet · Add" on the customer card opens it. Either way it is a side sheet
 * over the order: a refusal leaves it open with what was typed.
 */
export function CourierPanel({
    open,
    returnFocus,
    ...draft
}: CourierProps & {
    open: boolean;
    /** Put the keyboard back on the button that opened it. */
    returnFocus?: () => void;
}) {
    const handover = draft.mode === "handover";
    return (
        <OrderSheet
            open={open}
            title={handover ? "Hand to courier" : "Tracking"}
            description={
                handover
                    ? `To ${draft.to}`
                    : `Add or correct what the courier gave you. It stays on the order; nothing is sent to ${draft.first}.`
            }
            busy={draft.busy}
            onClose={draft.onCancel}
            returnFocus={returnFocus}
        >
            <CourierDraft {...draft} />
        </OrderSheet>
    );
}

interface CourierProps {
    mode: "handover" | "change";
    /** Where it is going, one line. */
    to: string;
    first: string;
    busy: boolean;
    /** What the order already has — `change` only. */
    before?: Pick<Shipment, "courier" | "number" | "url">;
    /** The packing slip — `handover` only. */
    onPrint?: () => void;
    onCancel: () => void;
    onSave: (fields: CourierFields) => void;
}

/** What is typed in the sheet: a fresh one each time it opens. */
function CourierDraft({
    mode,
    first,
    busy,
    before,
    onPrint,
    onSave,
}: CourierProps) {
    const ids = useId();
    const choices = courierChoices(before?.courier ?? null);
    const [courier, setCourier] = useState<string>(
        before?.courier ?? COURIERS[0],
    );
    const [otherName, setOtherName] = useState("");
    const [number, setNumber] = useState(before?.number ?? "");
    const [link, setLink] = useState(before?.url ?? "");
    const numberRef = useRef<HTMLInputElement>(null);
    const otherRef = useRef<HTMLInputElement>(null);
    const own = courier === OWN_DRIVER;
    const other = courier === OTHER_COURIER;
    const name = courierName(courier, otherName);
    const unnamed = other && !name;
    const bad = !own && link.trim() !== "" && !isTrackingLink(link.trim());
    const handover = mode === "handover";
    const pickChip = (c: string) => {
        setCourier(c);
        // Other asks for the name next.
        if (c === OTHER_COURIER) {
            requestAnimationFrame(() => otherRef.current?.focus());
        }
    };

    // Opened from the card to add the number: start there.
    useEffect(() => {
        if (!handover) numberRef.current?.focus();
    }, [handover]);

    return (
        <>
            <OrderSheetBody>
                <div
                    className="mb-1.5 text-[12px] font-medium"
                    id={`${ids}-courier`}
                >
                    Courier
                </div>
                <div
                    role="radiogroup"
                    aria-labelledby={`${ids}-courier`}
                    className="flex flex-wrap gap-1.5"
                >
                    {choices.map((c) => {
                        const on = c === courier;
                        return (
                            <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => pickChip(c)}
                                className={cn(
                                    FOCUS,
                                    "h-[30px] rounded-full border px-[11px] text-[12.5px] coarse:h-11",
                                    on
                                        ? "border-foreground bg-primary font-semibold text-primary-foreground"
                                        : "border-border bg-card font-medium text-neutral-700 hover:border-border-strong hover:bg-accent active:bg-accent-active dark:text-muted-foreground",
                                )}
                            >
                                {c}
                            </button>
                        );
                    })}
                </div>
                {other ? (
                    <label className="mt-3 block text-[12px] font-medium">
                        Courier&apos;s name
                        <input
                            ref={otherRef}
                            type="text"
                            value={otherName}
                            maxLength={COURIER_FIELD_MAX}
                            autoComplete="off"
                            onChange={(e) => setOtherName(e.target.value)}
                            placeholder="DTDC, India Post…"
                            aria-describedby={`${ids}-other-help`}
                            className={cn(FIELD, "font-sans")}
                        />
                        <span
                            id={`${ids}-other-help`}
                            className="mt-[5px] block text-[11.5px] font-normal text-muted-foreground"
                        >
                            As the order will name it.
                        </span>
                    </label>
                ) : null}
                {!own ? (
                    <>
                        <label className="mt-3 block text-[12px] font-medium">
                            Tracking number
                            <input
                                ref={numberRef}
                                type="text"
                                value={number}
                                maxLength={COURIER_FIELD_MAX}
                                autoComplete="off"
                                spellCheck={false}
                                onChange={(e) => setNumber(e.target.value)}
                                placeholder="Leave empty if you don't have it yet"
                                aria-describedby={`${ids}-number-help`}
                                className={FIELD}
                            />
                        </label>
                        <p
                            id={`${ids}-number-help`}
                            className="mt-[5px] text-[11.5px] text-muted-foreground"
                        >
                            {handover
                                ? "You can add it later, once the courier sends it."
                                : `As ${name || "the courier"} gave it to you.`}
                        </p>
                        <label className="mt-3 block text-[12px] font-medium">
                            Tracking link
                            <input
                                type="url"
                                inputMode="url"
                                value={link}
                                onChange={(e) => setLink(e.target.value)}
                                placeholder="https://"
                                aria-invalid={bad || undefined}
                                aria-describedby={`${ids}-link-help`}
                                className={FIELD}
                            />
                        </label>
                        <p
                            id={`${ids}-link-help`}
                            className={cn(
                                "mt-[5px] text-[11.5px]",
                                bad
                                    ? "text-destructive-subtle-foreground"
                                    : "text-muted-foreground",
                            )}
                        >
                            {bad
                                ? "That isn't a web address — paste the whole link, starting https://."
                                : `Optional. Paste the link ${name || "the courier"} gave you. It stays on the order; nothing is sent to ${first}.`}
                        </p>
                    </>
                ) : null}
            </OrderSheetBody>
            <OrderSheetFoot busy={busy}>
                {handover && onPrint ? (
                    <Button type="button" variant="outline" onClick={onPrint}>
                        Packing slip
                    </Button>
                ) : null}
                <Button
                    type="button"
                    disabled={bad || unnamed || busy}
                    onClick={() =>
                        onSave(
                            courierFields(
                                { courier: name, number, link },
                                handover ? undefined : before,
                            ),
                        )
                    }
                >
                    {handover ? "Handed over" : "Save"}
                </Button>
            </OrderSheetFoot>
        </>
    );
}
