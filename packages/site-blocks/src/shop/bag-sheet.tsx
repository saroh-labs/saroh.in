"use client";

import { useEffect, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { focusRing, inputFill, optionClasses } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import { formatAmount } from "../product/product-page";
import type {
    CheckoutQuote,
    DeliveryAddress,
    QuoteLine,
    ShopCheckoutApi,
    ShopPayment,
    ShopProblem,
    ShopWay,
    StartCheckout,
} from "./api";
import { checkoutKey, SHOP_OFFLINE } from "./api";
import type { BagItem } from "./bag-store";
import { MAX_ITEM_QUANTITY, setQuantity } from "./bag-store";
import { cleanCode, CodeField, codeSettled } from "./code-field";
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
 *
 * How to pay comes with the quote: online, or at the handover — "Pay when
 * you collect", "Pay on delivery" — where the shop takes it (always on a
 * plan without online payments; beside online where the shop turns it on).
 * With both, the customer picks; with one, the sheet says which. Online
 * never names a method: the provider's window shows the ways the business
 * takes (DEC-059).
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

/** A bag line's key: its listing and variant. */
const lineKey = (l: Pick<QuoteLine, "listingId" | "variantId">) =>
    `${l.listingId}:${l.variantId ?? ""}`;

/**
 * The lines asking for more than is left, and how many each can have
 * (UX-058): the bag is set to that, and says so, rather than holding the
 * button with no reason.
 */
export function overStock(
    lines: readonly QuoteLine[],
): { line: QuoteLine; left: number }[] {
    return lines.flatMap((line) =>
        line.state === "short" &&
        typeof line.available === "number" &&
        line.available > 0 &&
        line.quantity > line.available
            ? [{ line, left: line.available }]
            : [],
    );
}

/** "Only 1 left — we've set your bag to 1." */
export function stockNotice(
    capped: readonly { line: QuoteLine; left: number }[],
): string | null {
    if (capped.length === 0) return null;
    if (capped.length === 1) {
        const { left } = capped[0];
        return `Only ${left} left — we've set your bag to ${left}.`;
    }
    const each = capped
        .map(({ line, left }) => {
            const name = line.variantTitle
                ? `${line.name} (${line.variantTitle})`
                : line.name;
            return `${name} to ${left}`;
        })
        .join(", ");
    return `Fewer are left than you asked for — we've set ${each}.`;
}

/**
 * Why the button is held, in a sentence beside it (UX-058): never a grey
 * button with no reason. Null when it can be placed, or while the quote
 * is still on its way.
 */
export function holdReason(input: {
    quote: CheckoutQuote | null;
    way: ShopWay | null;
    addressOk: boolean;
    payable: boolean;
}): string | null {
    const { quote, way } = input;
    if (!quote) return null;
    if (quote.lines.some((l) => l.state === "gone")) {
        return "Take out what's no longer sold to continue.";
    }
    if (quote.lines.some((l) => l.state === "sold-out")) {
        return "Take out what's sold out to continue.";
    }
    if (quote.lines.some((l) => l.state === "short")) {
        return "Fewer are left than you asked for. Lower the amount to continue.";
    }
    if (quote.ways.length === 0) return null; // said above the button already
    if (!way || quote.fulfilment !== way) {
        return "Choose how your order reaches you.";
    }
    if (!input.addressOk) return "Add the address to deliver to.";
    if (!input.payable)
        return "This can't be paid for this way. Choose another.";
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

/**
 * What the customer chose in the bag, kept by the header's bag (`ShopBag`)
 * rather than the sheet: the sheet closes whenever the checkout moves on —
 * to signing in, or to paying — and "Back to your bag", a sign-in closed or
 * a refused start must find the way and the address as they were, and
 * place the same bag under the same key (one order, not a second).
 */
export interface BagDraft {
    way: ShopWay | null;
    /** How they'll pay; null until picked (the first offered then). */
    pay: ShopPayment | null;
    address: DeliveryAddress;
    /**
     * The discount code applied in the bag (DEC-104), as typed and tidied;
     * null for none. The quote judges it every time it prices the bag.
     */
    code: string | null;
    /** One key per request: the same bag placed again is the same order. */
    checkout: { print: string; key: string } | null;
}

/** The bag as the button priced it: "₹1,240", and how many things. */
export interface BagPriced {
    total: string;
    count: number;
}

export const EMPTY_DRAFT: BagDraft = {
    way: null,
    pay: null,
    address: EMPTY_ADDRESS,
    code: null,
    checkout: null,
};

export function BagSheet({
    site,
    items,
    api,
    signedIn,
    busy,
    problem,
    draft,
    onDraft,
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
    /** The way, the address and the checkout key, kept above the sheet. */
    draft: BagDraft;
    onDraft: (change: (draft: BagDraft) => BagDraft) => void;
    /**
     * Place it: the request, with its key, and what the button said it
     * costs (a test release's stop names them, DEC-071).
     */
    onPlace: (request: StartCheckout, priced: BagPriced) => void;
    onClose: () => void;
}) {
    const { way, address } = draft;
    const setWay = (next: ShopWay) => onDraft((d) => ({ ...d, way: next }));
    const setPay = (next: ShopPayment) => onDraft((d) => ({ ...d, pay: next }));
    const setAddress = (change: (a: DeliveryAddress) => DeliveryAddress) =>
        onDraft((d) => ({ ...d, address: change(d.address) }));
    const setCode = (next: string | null) =>
        onDraft((d) => ({ ...d, code: next }));
    // "Have a code?" opens the field; one applied already keeps it open.
    const [codeOpen, setCodeOpen] = useState(draft.code !== null);
    const [codeInput, setCodeInput] = useState(draft.code ?? "");
    const [codeError, setCodeError] = useState<string | null>(null);
    const [load, setLoad] = useState<Load>({ kind: "loading" });
    const [round, setRound] = useState(0);
    // What each line was capped at once the quote said fewer are left
    // (UX-058): "+" stops there, and the bag says why.
    const [caps, setCaps] = useState<Readonly<Record<string, number>>>({});
    const [notice, setNotice] = useState<string | null>(null);

    // Asking for more than is left: set the bag to what is, and say so.
    function capOverStock(lines: readonly QuoteLine[]) {
        const over = overStock(lines);
        if (over.length === 0) return;
        setCaps((c) => {
            const next = { ...c };
            for (const { line, left } of over) next[lineKey(line)] = left;
            return next;
        });
        setNotice(stockNotice(over));
        for (const { line, left } of over) {
            setQuantity(
                site,
                { listingId: line.listingId, variantId: line.variantId },
                left,
            );
        }
    }

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
                    ...(draft.code ? { discountCode: draft.code } : {}),
                })
                .catch(() => null)
                .then((result) => {
                    if (!live) return;
                    if (result?.ok) {
                        setLoad({ kind: "ready", quote: result.data });
                        capOverStock(result.data.lines);
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
    }, [bagPrint, way, api, round, problem, draft.code]);

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
    const discount = quote?.discount ?? null;
    // The code applied and the quote that judged it agree; until then the
    // total on the button is the old one, and the button waits.
    const settled = draft.code === null || codeSettled(quote, draft.code);
    const applied =
        settled && discount?.applied === true ? discount.code : null;
    const chosen = quote?.ways.find((w) => w.type === way) ?? null;
    const addressOk = !needsAddress(way) || addressReady(address);
    const pays = paysOf(quote);
    const pay = payChosen(pays, draft.pay);
    const payNote = payWords(pay);
    const canPlace =
        !!quote &&
        quote.ready &&
        quote.fulfilment === way &&
        addressOk &&
        pay !== null &&
        settled &&
        !busy;
    const total = quote ? formatAmount(quote.total, quote.currency) : "";
    const held = busy
        ? null
        : holdReason({ quote, way, addressOk, payable: pay !== null });
    const pickup = way === "PICKUP" ? (quote?.pickup ?? null) : null;

    function place() {
        if (!canPlace || !way) return;
        const body: Omit<StartCheckout, "key"> = {
            lines: [...items],
            fulfilment: way,
            ...(needsAddress(way) ? { address: trimmed(address) } : {}),
            ...(pay.type === "ON_HANDOVER" ? { payment: pay.type } : {}),
            // Only a code the quote applied: a refused one is never sent.
            ...(applied ? { discountCode: applied } : {}),
        };
        const print = JSON.stringify(body);
        const checkout =
            draft.checkout?.print === print
                ? draft.checkout
                : { print, key: checkoutKey() };
        if (checkout !== draft.checkout) {
            onDraft((d) => ({ ...d, checkout }));
        }
        onPlace(
            { ...body, key: checkout.key },
            {
                total,
                count: items.reduce((sum, item) => sum + item.quantity, 0),
            },
        );
    }

    const setField = (name: keyof DeliveryAddress) => (value: string) =>
        setAddress((a) => ({ ...a, [name]: value }));

    function applyCode() {
        const next = cleanCode(codeInput);
        if (!next) {
            setCodeError(
                codeInput.trim()
                    ? "That isn't a code this shop has. Check it and try again."
                    : "Type your code first.",
            );
            return;
        }
        setCodeError(null);
        setCodeInput(next);
        setCode(next);
    }

    function removeCode() {
        setCode(null);
        setCodeInput("");
        setCodeError(null);
    }

    // What the field says under it: the shop's refusal for the applied
    // code, or a code that couldn't be one.
    const codeNote =
        codeError ??
        (settled && discount && !discount.applied ? discount.message : null);

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
                                            line.quantity >=
                                                MAX_ITEM_QUANTITY ||
                                            line.quantity >=
                                                (caps[lineKey(line)] ??
                                                    Infinity)
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
                    {applied && discount?.applied ? (
                        <div className="border-site-border flex items-center gap-2.5 border-t py-2.5 text-sm">
                            <span className="min-w-0 flex-1">
                                Code {discount.code}
                            </span>
                            <button
                                type="button"
                                onClick={removeCode}
                                aria-label={`Remove code ${discount.code}`}
                                className={cn(
                                    "text-site-muted cursor-pointer text-[12.5px] underline",
                                    focusRing,
                                )}
                            >
                                Remove
                            </button>
                            <span className="font-semibold tabular-nums">
                                −{formatAmount(discount.amount, quote.currency)}
                            </span>
                        </div>
                    ) : null}
                    <div className="border-site-border flex gap-2.5 border-t py-2.5 text-sm">
                        <span className="flex-1 font-semibold">Total</span>
                        <span className="font-semibold tabular-nums">
                            {total}
                        </span>
                    </div>

                    <CodeField
                        site={site}
                        open={codeOpen}
                        onOpen={() => setCodeOpen(true)}
                        value={codeInput}
                        onChange={(v) => {
                            setCodeInput(v);
                            setCodeError(null);
                        }}
                        onApply={applyCode}
                        checking={!settled}
                        applied={applied}
                        note={codeNote}
                    />

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

                    {pays.length > 1 ? (
                        <>
                            <p
                                id={`${site}-pay`}
                                className="text-site-muted mb-1.5 mt-3.5 text-xs font-bold uppercase tracking-[0.08em]"
                            >
                                Pay
                            </p>
                            <div
                                role="radiogroup"
                                aria-labelledby={`${site}-pay`}
                                className="grid gap-1.5"
                            >
                                {pays.map((p) => (
                                    <button
                                        key={p.type}
                                        type="button"
                                        role="radio"
                                        aria-checked={pay?.type === p.type}
                                        onClick={() => setPay(p.type)}
                                        className={optionClasses(
                                            pay?.type === p.type,
                                        )}
                                    >
                                        <span className="text-[14.5px] font-semibold">
                                            {p.label}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : null}

                    {pickup ? (
                        <p className="text-site-body mt-2.5 text-[13.5px] leading-normal">
                            <span className="font-semibold">Collect from</span>{" "}
                            {pickup.address}
                            {pickup.hours ? (
                                <span className="text-site-muted block text-[12.5px]">
                                    {pickup.hours}
                                </span>
                            ) : null}
                        </p>
                    ) : null}

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

            {notice ? (
                <p
                    role="status"
                    className="text-site-fg mt-3 text-[13.5px] font-semibold"
                >
                    {notice}
                </p>
            ) : null}
            {held && !problem ? (
                <p
                    id={`${site}-held`}
                    className="text-site-body mt-2.5 text-[13px] leading-normal"
                >
                    {held}
                </p>
            ) : null}
            {payNote ? (
                <p className="text-site-muted mt-2.5 text-[12.5px] leading-normal">
                    {payNote}
                </p>
            ) : null}
            <button
                type="button"
                onClick={place}
                disabled={!canPlace}
                aria-describedby={held && !problem ? `${site}-held` : undefined}
                className={sheetButton(!canPlace)}
            >
                {busy
                    ? "Starting…"
                    : `${signedIn ? "Place order" : "Continue"}${total ? ` · ${total}` : ""}`}
            </button>
        </SheetFrame>
    );
}

/** How the quote's chosen way can be paid; online for an older API. */
function paysOf(
    quote: CheckoutQuote | null,
): { type: ShopPayment; label: string }[] {
    if (!quote) return [];
    return quote.payments ?? [{ type: "ONLINE", label: "Pay online" }];
}

/** The way to pay picked, if still offered; else the first offered. */
export function payChosen(
    pays: readonly { type: ShopPayment; label: string }[],
    picked: ShopPayment | null,
): { type: ShopPayment; label: string } | null {
    return pays.find((p) => p.type === picked) ?? pays.at(0) ?? null;
}

/**
 * What the customer is told about paying, above the button. Nothing until
 * the quote is back: how to pay comes with it, and a shop that only takes
 * money at the handover must not first claim "You pay online" (#837).
 */
export function payWords(
    pay: { type: ShopPayment; label: string } | null,
): string | null {
    if (!pay) return null;
    if (pay.type === "ON_HANDOVER") {
        return pay.label === "Pay on delivery"
            ? "You'll pay when your order is delivered. Your order is placed now."
            : "You'll pay when you collect your order. Your order is placed now.";
    }
    return "You pay online in a secure window. Your order is placed once the payment goes through.";
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
