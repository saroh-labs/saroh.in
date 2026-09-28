"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ordersPlace } from "@/lib/orders/access";

/**
 * What a role Sell is closed to sees (DEC-056): on Orders, Orders' own
 * locked card — the list's, or one order's — and anywhere else in Sell the
 * gate's generic denial. The server draws all three; this picks by the
 * address, which Sell's layout can't see.
 */
export function SellDenied({
    standard,
    orders,
    order,
}: {
    standard: ReactNode;
    orders: ReactNode;
    order: ReactNode;
}) {
    const place = ordersPlace(usePathname());
    return (
        <>{place === "list" ? orders : place === "order" ? order : standard}</>
    );
}
