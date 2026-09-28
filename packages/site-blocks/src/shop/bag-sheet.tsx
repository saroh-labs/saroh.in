"use client";

import { useEffect, useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing, inputFill, optionClasses } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";
import type {
    CheckoutQuote,
    DeliveryAddress,
    QuoteLine,
    ShopCheckoutApi,
    ShopProblem,
    ShopWay,
    StartCheckout,
} from "./api";
import { checkoutKey, SHOP_OFFLINE } from "./api";
import type { BagItem } from "./bag-store";
import { MAX_ITEM_QUANTITY, setQuantity } from "./bag-store";
import { sheetButton, SheetFrame } from "./sheet-frame";

/**
 * "Your bag" (round-2 G13), as the Customer Site design's cart sheet draws
 * it: each line with − and + and its amount, how it leaves (Pick-up, Local
 * delivery or Shipping, with the fee), the total, and one button — "Place
 * order · ₹560" when signed in, "Continue · ₹560" when the last step is
 * signing in.
 *
 * Every amount is the server's quote, fetched again whenever the bag or the
 * way changes: a price that moved since the item was added shows before
 * paying, and a line that can't be sold now says so and holds the button.
 * There is no "Pay with" choice: the provider's window shows the ways the
 * business takes (DEC-059).
 */

type Load =
    | { kind: "loading" }
    | { kind: "ready"; quote: CheckoutQuote }
    | { kind: "error"; message: string };

const needsAddress = (way: ShopWay | null) =>
    way === "LOCAL_DELIVERY" || way === "SHIPPING";

const EMPTY_ADDRESS: DeliveryAddress = {
    name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
};

function addressReady(a: DeliveryAddress): boolean {
    return (
        a.line1.trim() !== "" &&
        a.city.trim() !== "" &&
        a.state.trim() !== "" &&
        a.postalCode.trim() !== ""
    );
}

function trimmed(a: DeliveryAddress): DeliveryAddress {
    const out: DeliveryAddress = {
        line1: a.line1.trim(),
        city: a.city.trim(),
        state: a.state.trim(),
        postalCode: a.postalCode.trim(),
    };
    if (a.name?.trim()) out.name = a.name.trim();
    if (a.phone?.trim()) out.phone = a.phone.trim();
    if (a.line2?.trim()) out.line2 = a.line2.trim();
    return out;
}

/** What a line says under its name when it can't be sold as asked. */
export function lineNote(line: QuoteLine): string | null {
    if (line.state === "gone") return "No longer sold here — take it out";
    if (line.state === "sold-out") return "Sold out";
    if (line.state === "short") {
        return `Only ${line.available ?? 0} left`;
    }
    return null;
}

const field = cn(
    "border-site-border text-site-fg mt-1 block h-11 w-full rounded-[calc(var(--site-radius)+8px)] border px-3 text-[15px]",
    inputFill,
    focusRing,
);

const stepper = cn(
    "border-site-border bg-site-bg text-site-fg size-[30px] cursor-pointer rounded-lg border text-base leading-none hover:opacity-80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
    focusRing,
);

export function BagSheet({
    site,
    items,
    api,
    signedIn,
    busy,
    problem,
    onPlace,
    onClose,
}: {
    site: string;
    items: readonly BagItem[];
    api: ShopCheckoutApi;
    signedIn: boolean;
    /** A checkout is starting. */
    busy: boolean;
    /** Why the last start didn't go, in the page's words. */
    problem: { reason: ShopProblem; message: string } | null;
    /** Place it: the request, with its key. */
    onPlace: (request: StartCheckout) => void;
    onClose: () => void;
}) {
    const [way, setWay] = useState<ShopWay | null>(null);
    const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [round, setRound] = useState(0);
    // One key per request: the same bag placed twice is one order, and a
    // changed bag is a new one.
    const key = useRef<{ print: string; key: string } | null>(null);

    // The quote, again whenever the bag or the way changes.
    const bagPrint = JSON.stringify(items);
    useEffect(() => {
        if (items.length === 0) return;
        let live = true;
        const timer = setTimeout(() => {
            void api
                .quote({
                    lines: [...items],
                    ...(way ? { fulfilment: way } : {}),
                })
                .catch(() => null)
                .then((result) => {
                    if (!live) return;
                    if (result?.ok) {
                        setLoad({ kind: "ready", quote: result.data });
                        if (!way && result.data.fulfilment) {
                            setWay(result.data.fulfilment);
                        }
                    } else {
                        setLoad({
                            kind: "error",
                            message: result?.message ?? SHOP_OFFLINE,
                        });
                    }
                });
        }, 150);
        return () => {
            live = false;
            clearTimeout(timer);
        };
        // A start refused because the bag changed (`problem`) prices it
        // again too.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- the bag's contents, by value
    }, [bagPrint, way, api, round, problem]);

    if (items.length === 0) {
        return (
            <SheetFrame title="Your bag" onClose={onClose}>
                <p className="text-site-body mt-3 text-sm">
                    Your bag is empty. Add something from the shop.
                </p>
                <button type="button" disabled className={sheetButton(true)}>
                    Your bag is empty
                </button>
            </SheetFrame>
        );
    }

    const quote = load.kind === "ready" ? load.quote : null;
    const chosen = quote?.ways.find((w) => w.type === way) ?? null;
    const addressOk = !needsAddress(way) || addressReady(address);
    const canPlace =
        !!quote &&
        quote.ready &&
        quote.fulfilment === way &&
        addressOk &&
        !busy;
    const total = quote ? formatAmount(quote.total, quote.currency) : "";

    function place() {
        if (!canPlace || !way) return;
        const body: Omit<StartCheckout, "key"> = {
            lines: [...items],
            fulfilment: way,
            ...(needsAddress(way) ? { address: trimmed(address) } : {}),
        };
        const print = JSON.stringify(body);
        if (key.current?.print !== print) {
            key.current = { print, key: checkoutKey() };
        }
        onPlace({ ...body, key: key.current.key });
    }

    const setField = (name: keyof DeliveryAddress) => (value: string) =>
        setAddress((a) => ({ ...a, [name]: value }));

    return (
        <SheetFrame title="Your bag" onClose={onClose}>
            {load.kind === "error" ? (
                <div className="mt-3">
                    <p role="alert" className={destructiveAlertClasses}>
                        {load.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            setLoad({ kind: "loading" });
                            setRound((r) => r + 1);
                        }}
                        className={cn(
                            "text-site-fg mt-2 cursor-pointer text-sm font-semibold underline",
                            focusRing,
                        )}
                    >
                        Try again
                    </button>
                </div>
            ) : null}
            {load.kind === "loading" ? (
                <p role="status" className="text-site-muted mt-3 text-sm">
                    Checking prices…
                </p>
            ) : null}

            {quote ? (
                <div className="mt-3">
                    {quote.lines.map((line) => {
                        const note = lineNote(line);
                        const name = line.variantTitle
                            ? `${line.name} · ${line.variantTitle}`
                            : line.name;
                        const change = (q: number) =>
                            setQuantity(
                                site,
                                {
                                    listingId: line.listingId,
                                    variantId: line.variantId,
                                },
                                q,
                            );
                        return (
                            <div
                                key={`${line.listingId}:${line.variantId ?? ""}`}
                                className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-sm"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">
                                        {name}
                                    </span>
                                    {note ? (
                                        <span className="text-site-fg block text-xs font-semibold">
                                            {note}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            change(line.quantity - 1)
                                        }
                                        aria-label={`One fewer ${name}`}
                                        className={stepper}
                                    >
                                        −
                                    </button>
                                    <span
                                        aria-label={`${line.quantity} of ${name}`}
                                        className="min-w-5 text-center font-semibold tabular-nums"
                                    >
                                        {line.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            change(line.quantity + 1)
                                        }
                                        disabled={
                                            line.state !== "ok" ||
                                            line.quantity >= MAX_ITEM_QUANTITY
                                        }
                                        aria-label={`One more ${name}`}
                                        className={stepper}
                                    >
                                        +
                                    </button>
                                </span>
                                <span className="font-semibold tabular-nums">
                                    {formatAmount(line.amount, quote.currency)}
                                </span>
                            </div>
                        );
                    })}
                    <div className="border-site-border flex gap-2.5 border-t py-2.5 text-sm">
                        <span className="flex-1">
                            {chosen?.label ?? "Pick-up or delivery"}
                        </span>
                        <span className="font-semibold tabular-nums">
                            {chosen
                                ? chosen.fee
                                    ? formatAmount(chosen.fee, quote.currency)
                                    : "Free"
                                : "—"}
                        </span>
                    </div>
                    <div className="border-site-border flex gap-2.5 border-t py-2.5 text-sm">
                        <span className="flex-1 font-semibold">Total</span>
                        <span className="font-semibold tabular-nums">
                            {total}
                        </span>
                    </div>

                    {quote.ways.length > 0 ? (
                        <>
                            <p
                                id={`${site}-how`}
                                className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]"
                            >
                                How
                            </p>
                            <div
                                role="radiogroup"
                                aria-labelledby={`${site}-how`}
                                className="grid gap-1.5"
                            >
                                {quote.ways.map((w) => (
                                    <button
                                        key={w.type}
                                        type="button"
                                        role="radio"
                                        aria-checked={way === w.type}
                                        onClick={() => setWay(w.type)}
                                        className={optionClasses(
                                            way === w.type,
                                        )}
                                    >
                                        <span className="grid gap-0.5 text-left">
                                            <span className="text-[14.5px] font-semibold">
                                                {w.label}
                                            </span>
                                            <span className="text-site-muted text-[12.5px]">
                                                {w.fee
                                                    ? formatAmount(
                                                          w.fee,
                                                          quote.currency,
                                                      )
                                                    : "Free"}
                                            </span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-site-body mt-3 text-sm">
                            These can't be ordered together. Take one out to see
                            how the rest can reach you.
                        </p>
                    )}

                    {needsAddress(way) ? (
                        <fieldset className="mt-3.5">
                            <legend className="text-site-muted mb-1 text-xs font-bold uppercase tracking-[0.08em]">
                                Deliver to
                            </legend>
                            <AddressFields
                                address={address}
                                onChange={setField}
                            />
                        </fieldset>
                    ) : null}
                </div>
            ) : null}

            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem.message}
                </p>
            ) : null}

            <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                You pay online in a secure window. Your order is placed once the
                payment goes through.
            </p>
            <button
                type="button"
                onClick={place}
                disabled={!canPlace}
                className={sheetButton(!canPlace)}
            >
                {busy
                    ? "Starting…"
                    : `${signedIn ? "Place order" : "Continue"}${total ? ` · ${total}` : ""}`}
            </button>
        </SheetFrame>
    );
}

function AddressFields({
    address,
    onChange,
}: {
    address: DeliveryAddress;
    onChange: (name: keyof DeliveryAddress) => (value: string) => void;
}) {
    const input = (
        name: keyof DeliveryAddress,
        label: string,
        auto: string,
        required = false,
    ) => (
        <label className="block text-[13.5px] font-medium">
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
            <input
                type={name === "phone" ? "tel" : "text"}
                autoComplete={auto}
                required={required}
                value={address[name] ?? ""}
                onChange={(e) => onChange(name)(e.target.value)}
                className={field}
            />
        </label>
    );
    return (
        <div className="grid gap-2.5">
            {input("name", "Name", "name")}
            {input("phone", "Phone", "tel")}
            {input("line1", "Address", "address-line1", true)}
            {input("line2", "Flat, floor or landmark", "address-line2")}
            <div className="grid grid-cols-2 gap-2.5">
                {input("city", "Town or city", "address-level2", true)}
                {input("postalCode", "PIN code", "postal-code", true)}
            </div>
            {input("state", "State", "address-level1", true)}
        </div>
    );
}
