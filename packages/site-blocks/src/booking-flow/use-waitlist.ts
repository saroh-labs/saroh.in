"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { WaitlistApi, WaitlistPlace } from "./waitlist";

/**
 * The signed-in customer's places in line for the chosen class (A12): asked
 * of the site's server once someone is signed in and a class is chosen, and
 * again when either changes. A read that fails shows no places — joining
 * still works, and answers with the place they hold — so it never blocks
 * booking.
 *
 * `put` records a place the page just joined or learned of; `drop` one it
 * just left or booked.
 */
export function useWaitlist(
    api: WaitlistApi | undefined,
    who: string | null,
    serviceId: string | null,
): {
    placeOf: (startAt: string) => WaitlistPlace | undefined;
    put: (place: WaitlistPlace) => void;
    drop: (startAt: string) => void;
    reload: () => void;
} {
    const key = api && who && serviceId ? `${who}|${serviceId}` : null;
    const [read, setRead] = useState<{
        key: string;
        places: WaitlistPlace[];
    } | null>(null);
    const [round, setRound] = useState(0);

    useEffect(() => {
        if (!key || !api || !serviceId) return;
        let live = true;
        void api
            .mine({ serviceId })
            .catch(() => null)
            .then((result) => {
                if (!live) return;
                setRead({
                    key,
                    places: result?.ok ? result.value.places : [],
                });
            });
        return () => {
            live = false;
        };
    }, [api, key, serviceId, round]);

    const places = useMemo(
        () => (read?.key === key ? read.places : []),
        [read, key],
    );

    const placeOf = useCallback(
        (startAt: string) => places.find((p) => p.startAt === startAt),
        [places],
    );
    const put = useCallback(
        (place: WaitlistPlace) => {
            if (!key) return;
            setRead((r) => ({
                key,
                places: [
                    ...(r?.key === key ? r.places : []).filter(
                        (p) => p.startAt !== place.startAt,
                    ),
                    place,
                ],
            }));
        },
        [key],
    );
    const drop = useCallback((startAt: string) => {
        setRead((r) =>
            r
                ? {
                      ...r,
                      places: r.places.filter((p) => p.startAt !== startAt),
                  }
                : r,
        );
    }, []);
    return {
        placeOf,
        put,
        drop,
        reload: () => setRound((n) => n + 1),
    };
}
