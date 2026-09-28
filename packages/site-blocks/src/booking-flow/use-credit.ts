"use client";

import { useCallback, useEffect, useState } from "react";

import type { CreditFor } from "./api";
import type { OfferedCredit } from "./model";

/**
 * The class credit the pay step offers (A10): asked of the site's server
 * once someone is signed in and a time is chosen, and asked again when
 * either changes. The API decides what is on offer; the page only shows it
 * and books with it. A read that fails offers nothing — paying now or at
 * the desk still works — so it never blocks booking.
 *
 * `ask` reads it straight away, for the moment sign-in finishes, before the
 * page books: a member who signed in should never pay for a class their
 * credit covers without being shown it.
 */
export function useCredit(
    creditFor: CreditFor | undefined,
    who: string | null,
    serviceId: string | null,
    startAt: string | null,
): {
    credit: OfferedCredit | null;
    reload: () => void;
    ask: (
        who: string,
        serviceId: string,
        startAt: string,
    ) => Promise<OfferedCredit | null>;
} {
    const [read, setRead] = useState<{
        key: string;
        credit: OfferedCredit | null;
    } | null>(null);
    const [round, setRound] = useState(0);

    const key =
        who && serviceId && startAt ? keyOf(who, serviceId, startAt) : null;

    const ask = useCallback(
        async (by: string, service: string, start: string) => {
            if (!creditFor) return null;
            const result = await creditFor({
                serviceId: service,
                startAt: start,
            }).catch(() => null);
            const credit = result?.ok ? result.value.credit : null;
            setRead({ key: keyOf(by, service, start), credit });
            return credit;
        },
        [creditFor],
    );

    useEffect(() => {
        if (!key || !serviceId || !startAt || !who) return;
        let live = true;
        void creditFor?.({ serviceId, startAt })
            .catch(() => null)
            .then((result) => {
                if (!live) return;
                setRead({
                    key,
                    credit: result?.ok ? result.value.credit : null,
                });
            });
        return () => {
            live = false;
        };
    }, [creditFor, key, serviceId, startAt, who, round]);

    return {
        credit: read?.key === key ? read.credit : null,
        // The credit that was refused is gone from the page at once.
        reload: () => {
            setRead(null);
            setRound((n) => n + 1);
        },
        ask,
    };
}

function keyOf(who: string, serviceId: string, startAt: string): string {
    return `${who}|${serviceId}|${startAt}`;
}
