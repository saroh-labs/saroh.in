import { useEffect, useState } from "react";

import { listServicesForPicker } from "@/lib/services/actions";

import type { ServiceOption, ServicesLoad } from "./section-fields";

/**
 * The org's services for the booking and services-list pickers. Loaded on
 * mount, and again on "Try again"; Services are authored in the service
 * editor, never inline in the site editor. A failed read is kept distinct
 * from an empty one, so a picker never says "No services yet" or calls a
 * chosen service deleted because the read failed (review of #255).
 */
export function useServicesForPicker(): ServicesLoad {
    const [read, setRead] = useState<
        | "loading"
        | { ok: true; services: ServiceOption[] }
        | { ok: false; forbidden: boolean }
    >("loading");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        listServicesForPicker()
            .then((next) => {
                if (active) setRead(next);
            })
            .catch(() => {
                if (active) setRead({ ok: false, forbidden: false });
            });
        return () => {
            active = false;
        };
    }, [attempt]);

    if (read === "loading") return { status: "loading" };
    if (read.ok) return { status: "ready", services: read.services };
    return {
        status: "failed",
        forbidden: read.forbidden,
        retry: () => {
            setRead("loading");
            setAttempt((n) => n + 1);
        },
    };
}
