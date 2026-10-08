"use client";

import { useEffect, useMemo, useState } from "react";

import { readCustomerAttention } from "@/lib/customers/actions";
import type { CustomerPick } from "@/lib/customers/picker";
import { formatMoney } from "@/lib/format/money";
import type {
    AddressDraft,
    CartLine,
    NewOrderPay,
    NewOrderSellable,
    NewOrderWay,
} from "@/lib/orders/new-order";
import {
    bump,
    canHandOver,
    cashChange,
    clashText,
    EMPTY_ADDRESS,
    goesToAddress,
    payOptions,
    reachOf,
    sheetProblem,
} from "@/lib/orders/new-order";
import { loadNewOrder, newOrderLines } from "@/lib/orders/new-order-actions";
import type {
    NewOrderCatalogue,
    NewOrderLines,
} from "@/lib/orders/new-order-service";
import type { PeekAttention } from "@/lib/services/peek";
import { attentionText } from "@/lib/services/peek";

/** A typed amount off ("50", "49.50"); anything else is a code. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * New order's state (B13): the storefront and its products, who it is for
 * and their Needs attention, the lines and the ways they can leave (the
 * API's), and how it is paid. The sheet draws it; the rules are in
 * `lib/orders/new-order.ts`.
 */
export function useNewOrder({
    initialStoreId,
    canLink,
    online = true,
    canSearch,
}: {
    initialStoreId: string;
    /** May make a pay link (`order:create`, B16). */
    canLink: boolean;
    /** The plan takes payment online (R33); else no link is offered. */
    online?: boolean;
    /** Holds `contact:read`: search, and read a picked person's notes. */
    canSearch: boolean;
}) {
    const [storeId, setStoreId] = useState(initialStoreId);
    const [catalogue, setCatalogue] = useState<{
        storeId: string;
        read: NewOrderCatalogue | null;
    } | null>(null);
    const [retry, setRetry] = useState(0);
    const [lines, setLines] = useState<CartLine[]>([]);
    const [pick, setPick] = useState<CustomerPick | null>(null);
    const [attention, setAttention] = useState<{
        id: string;
        read: PeekAttention | null;
    } | null>(null);
    const [linesRead, setLinesRead] = useState<{
        key: string;
        read: NewOrderLines | null;
    } | null>(null);
    const [chosenWay, setWay] = useState<NewOrderWay["type"] | null>(null);
    const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
    const [chosenPay, setPay] = useState<NewOrderPay>("CASH");
    const [given, setGiven] = useState("");
    const [discount, setDiscount] = useState("");
    // A counter sale is handed over on the spot by default (UX-059).
    const [handedOverChoice, setHandedOver] = useState(true);

    // The storefront's products, currency and tax.
    useEffect(() => {
        let live = true;
        void loadNewOrder(storeId).then((read) => {
            if (live) setCatalogue({ storeId, read });
        });
        return () => {
            live = false;
        };
    }, [storeId, retry]);
    const data = catalogue?.storeId === storeId ? catalogue.read : undefined;
    const loading = catalogue?.storeId !== storeId;

    const byKey = useMemo(() => {
        const map = new Map<string, NewOrderSellable>();
        for (const p of data?.products ?? []) {
            for (const s of p.sellables) map.set(s.key, s);
        }
        return map;
    }, [data]);

    // The ways these lines can leave, and their allergens: asked again
    // only when the set of products changes.
    const productIds = Array.from(
        new Set(
            lines.flatMap((l) => {
                const s = byKey.get(l.key);
                return s ? [s.productId] : [];
            }),
        ),
    ).sort();
    const linesKey = `${storeId}|${productIds.join(",")}`;
    useEffect(() => {
        let live = true;
        const [store = "", ids = ""] = linesKey.split("|");
        void newOrderLines(store, ids ? ids.split(",") : []).then((read) => {
            if (live) setLinesRead({ key: linesKey, read });
        });
        return () => {
            live = false;
        };
    }, [linesKey]);
    const linesNow = linesRead?.key === linesKey ? linesRead : null;
    const ways = linesNow?.read?.ways ?? [];
    const way = ways.some((w) => w.type === chosenWay)
        ? chosenWay
        : (ways[0]?.type ?? null);

    // The picked person's Needs attention (C1), as far as the viewer may.
    const contactId = pick?.kind === "contact" ? pick.id : null;
    useEffect(() => {
        if (!contactId || !canSearch) return;
        let live = true;
        void readCustomerAttention(contactId)
            .catch(() => null)
            .then((read) => {
                if (live) setAttention({ id: contactId, read });
            });
        return () => {
            live = false;
        };
    }, [contactId, canSearch]);
    const theirs =
        contactId && attention?.id === contactId ? attention.read : null;
    const allergens = new Set(
        (theirs?.entries ?? [])
            .filter((e) => e.kind === "ALLERGY")
            .flatMap((e) => (e.matchAllergens ?? []).map((a) => a.id)),
    );
    const clashes: Record<string, string> = {};
    for (const line of lines) {
        const s = byKey.get(line.key);
        const text = s
            ? clashText(linesNow?.read?.allergens[s.productId], allergens)
            : "";
        if (text) clashes[line.key] = text;
    }

    const currency = data?.currency ?? null;
    const format = (cents: number) =>
        formatMoney(cents, currency) ?? (cents / 100).toFixed(2);
    const subtotal = lines.reduce(
        (sum, l) => sum + (byKey.get(l.key)?.priceCents ?? 0) * l.quantity,
        0,
    );
    const feeText = ways.find((w) => w.type === way)?.fee ?? null;
    const fee = feeText ? Math.round(Number(feeText) * 100) : 0;
    const tax = Math.round((subtotal * (data?.taxBps ?? 0)) / 10_000);
    const typedOff = discount.trim();
    const off = AMOUNT.test(typedOff) ? Math.round(Number(typedOff) * 100) : 0;
    const code =
        typedOff && !AMOUNT.test(typedOff) ? typedOff.toUpperCase() : "";
    const total = Math.max(0, subtotal + tax + fee - off);

    const options = payOptions({
        pick,
        way,
        canLink: canLink && !!data?.takesPayments,
        online,
    });
    // A chip that went off (a delivery chosen, the phone removed) hands
    // over to one that isn't, as the design does: pay later → card.
    const pay: NewOrderPay = options.find((o) => o.key === chosenPay)?.off
        ? chosenPay === "LATER"
            ? "CARD"
            : "CASH"
        : chosenPay;
    const change = cashChange(given, total);
    // Null where it doesn't apply: a delivery, a link, pay later.
    const handedOver = canHandOver(pay, way) ? handedOverChoice : null;
    const problem = sheetProblem({
        lines: lines.length,
        pick,
        way,
        address,
        pay,
        payOff: options.find((o) => o.key === pay)?.off ?? null,
        cash: change,
        format,
    });

    return {
        storeId,
        setStoreId: (id: string) => {
            setStoreId(id);
            // Products are the storefront's: a new one starts a new list.
            setLines([]);
        },
        retryCatalogue: () => setRetry((n) => n + 1),
        data,
        loading,
        byKey,
        lines,
        bumpLine: (key: string, by: 1 | -1) =>
            setLines((now) => bump(now, key, by)),
        pick,
        setPick,
        attentionNote: theirs ? attentionText(theirs) : null,
        clashes,
        ways,
        waysLoading: !linesNow,
        waysFailed: !!linesNow && linesNow.read === null,
        way,
        setWay,
        address,
        setAddress,
        options,
        pay,
        setPay,
        given,
        setGiven,
        handedOver,
        setHandedOver,
        discount,
        setDiscount,
        change,
        subtotal,
        fee,
        tax,
        off,
        code,
        total,
        format,
        problem,
        reach: reachOf(pick),
        delivers: goesToAddress(way),
        dirty: lines.length > 0 || pick !== null,
    };
}

export type NewOrderState = ReturnType<typeof useNewOrder>;
