"use client";

import { Input } from "@saroh/ui/input";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { OrdersQuery } from "@/lib/orders/list-query";

/**
 * Search by order number or customer name (and email or phone for a role
 * that reads contacts — the API decides). It covers every order, not the
 * page on screen, so it goes into the address after a pause in typing.
 */
export function SearchField({
    query,
    go,
}: {
    query: OrdersQuery;
    go: (patch: Partial<OrdersQuery>) => void;
}) {
    const [text, setText] = useState(query.q);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const field = useRef<HTMLInputElement | null>(null);
    // The address changed elsewhere (Clear search, the back button): say so
    // — but never over what someone is still typing.
    useEffect(() => {
        if (document.activeElement !== field.current) setText(query.q);
    }, [query.q]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    function search(value: string) {
        setText(value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => go({ q: value.trim() }), 300);
    }

    return (
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
            <Search
                aria-hidden
                className="pointer-events-none absolute left-[11px] top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
                ref={field}
                type="search"
                value={text}
                onChange={(e) => search(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Escape" && text) {
                        e.preventDefault();
                        search("");
                    }
                }}
                placeholder="Search orders"
                aria-label="Search orders"
                className="h-[38px] pl-[34px] text-[13.5px] coarse:h-11"
            />
        </div>
    );
}
