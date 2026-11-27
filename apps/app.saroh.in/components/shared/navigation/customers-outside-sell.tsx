"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * People › Customers for a business that takes money without Sell
 * (DEC-264): its page lives under `/commerce`, whose layout gates the
 * Commerce module, so on Customers' own pages the layout's gate is
 * stepped round and the page judges `contact:read` itself, as always.
 * Everywhere else in `/commerce` the gate stands. This picks by the
 * address, which the layout can't see.
 */
export function CustomersOutsideSell({
    gated,
    children,
}: {
    gated: ReactNode;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const customers =
        pathname === "/commerce/customers" ||
        pathname.startsWith("/commerce/customers/");
    return <>{customers ? children : gated}</>;
}
