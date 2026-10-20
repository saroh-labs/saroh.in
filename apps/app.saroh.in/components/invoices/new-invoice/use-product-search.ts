"use client";

import { useEffect, useRef, useState } from "react";

import type { PickableProduct } from "@/lib/invoices/new-invoice-lines";
import { findInvoiceProducts } from "@/lib/invoices/product-actions";

/**
 * The catalogue searched as it is typed (U14's "+ Pick from your products",
 * and "Add a line" on the paper, U15): a beat after typing stops, only
 * while the list is open; the last answer wins, and a refusal is said with
 * Try again, never as "no products". `found` is null until the first
 * answer.
 */
export function useProductSearch(open: boolean, q: string) {
    const [found, setFound] = useState<PickableProduct[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const [asks, setAsks] = useState(0);
    const asked = useRef(0);

    useEffect(() => {
        if (!open) return;
        const ticket = ++asked.current;
        const timer = setTimeout(() => {
            setSearching(true);
            void findInvoiceProducts(q).then(
                (res) => {
                    if (ticket !== asked.current) return;
                    setSearching(false);
                    if (!res.ok) {
                        setError(res.error);
                        return;
                    }
                    setError(null);
                    setFound(res.data.items);
                },
                () => {
                    if (ticket !== asked.current) return;
                    setSearching(false);
                    setError(
                        "Your products couldn't be searched just now. Try again.",
                    );
                },
            );
        }, 250);
        return () => clearTimeout(timer);
    }, [q, open, asks]);

    return {
        found,
        error,
        searching,
        retry: () => setAsks((n) => n + 1),
    };
}
