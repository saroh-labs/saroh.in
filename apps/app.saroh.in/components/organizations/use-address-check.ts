"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { checkAddress } from "@/lib/organizations/actions";
import type { AddressAvailability } from "@/lib/organizations/service";

/** An answer about one address, or `unchecked` when the API couldn't be asked. */
export type AddressAnswer =
    AddressAvailability | { address: string; unchecked: true };

/** What the line under the field says: nothing, "Checking…" or the answer. */
export type AddressState = AddressAvailability | "checking" | null;

/** An answer that says somebody else has the address. */
export function isTaken(answer: AddressAnswer): boolean {
    return "available" in answer && !answer.available;
}

/**
 * Setup's live web address check.
 *
 * Typing asks after a pause, and only the newest answer may land: a slow
 * answer for "rye" arriving after a fast one for "ryeandco" must not say the
 * wrong address is taken.
 *
 * `ask` is for Continue. It asks at once, without waiting for the pause, and
 * shares the request typing already started for the same address, so the
 * step never passes on an address nobody has answered for.
 */
export function useAddressCheck(address: string) {
    const [answer, setAnswer] = useState<AddressAnswer | null>(null);
    const flight = useRef<{
        address: string;
        promise: Promise<AddressAnswer>;
    } | null>(null);

    const ask = useCallback((asked: string): Promise<AddressAnswer> => {
        if (flight.current?.address === asked) return flight.current.promise;
        // Could not ask: say nothing rather than guess. The create checks
        // the address again either way.
        const unchecked: AddressAnswer = { address: asked, unchecked: true };
        const promise = checkAddress(asked).then(
            (next) => next ?? unchecked,
            () => unchecked,
        );
        flight.current = { address: asked, promise };
        void promise.then((next) => {
            if (flight.current?.promise === promise) setAnswer(next);
        });
        return promise;
    }, []);

    useEffect(() => {
        if (address.length < 3) return;
        const timer = setTimeout(() => void ask(address), 350);
        return () => clearTimeout(timer);
    }, [address, ask]);

    /*
     * Derived, not stored: the answer is "checking" whenever it is about an
     * address other than the one in the field, so a stale answer can never
     * be shown against a new address.
     */
    const state: AddressState =
        address.length < 3
            ? null
            : answer?.address !== address
              ? "checking"
              : "unchecked" in answer
                ? null
                : answer;

    const taken = state !== null && state !== "checking" && !state.available;

    return { state, taken, ask };
}
