"use client";

import { useEffect, useState } from "react";

import { packsFor } from "@/lib/class-packs/actions";
import type { PackPurchase } from "@/lib/class-packs/service";
import { listAvailability } from "@/lib/services/actions";
import type { PickerSlot } from "@/lib/services/time-picker";
import { PICKER_DAYS } from "@/lib/services/time-picker";

/**
 * Who they'll see, each with when they are next free (BKMNewBookingStep3):
 * the service's free times over the picker's two weeks, read once the
 * step is open. Null until read, or for another service.
 */
export function useNextFree(
    serviceId: string | null,
    open: boolean,
    now: number,
): PickerSlot[] | null {
    const [read, setRead] = useState<{
        serviceId: string;
        slots: PickerSlot[];
    } | null>(null);
    useEffect(() => {
        if (!open || !serviceId) return;
        let live = true;
        const to = now + PICKER_DAYS * 24 * 60 * 60 * 1000;
        void listAvailability(
            serviceId,
            new Date(now).toISOString(),
            new Date(to).toISOString(),
        )
            .catch((): PickerSlot[] => [])
            .then((slots) => {
                if (live) setRead({ serviceId, slots });
            });
        return () => {
            live = false;
        };
    }, [open, serviceId, now]);
    return read?.serviceId === serviceId ? read.slots : null;
}

/**
 * The customer's class packs for the service (ADR-007), keyed
 * `contact:service` so a stale read for someone else is never shown;
 * `reload` reads them again (a pack refused at Book). Empty until read.
 */
export function useHeldPacks(
    key: string | null,
    reload: number,
): PackPurchase[] {
    const [held, setHeld] = useState<{
        key: string;
        reload: number;
        packs: PackPurchase[];
    } | null>(null);
    useEffect(() => {
        if (!key) return;
        let live = true;
        const [forContact = "", forService = ""] = key.split(":");
        void packsFor(forContact, forService)
            .catch(() => null)
            .then((found) => {
                if (live) setHeld({ key, reload, packs: found ?? [] });
            });
        return () => {
            live = false;
        };
    }, [key, reload]);
    return held?.key === key && held.reload === reload ? held.packs : [];
}
