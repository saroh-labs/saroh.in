"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { keepAllSamples, keepService } from "@/lib/services/actions";
import { keptToast } from "@/lib/services/service-cards";

/** Which keep is saving: a service's id, or every sample. */
export const KEEP_ALL = "all";

/**
 * Keep and Keep all on the Services list (DEC-189): a trade starter's
 * samples become the owner's as they are, shown to customers. Acts at
 * once; the list is read again after.
 */
export function useKeepSamples() {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    async function keep(service: { id: string; name: string }) {
        const res = await runAction(() => keepService(service.id), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(keptToast({ name: service.name }));
        router.refresh();
    }

    async function keepAll() {
        const res = await runAction(() => keepAllSamples(), {
            setBusy: (on) => setBusy(on ? KEEP_ALL : null),
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(keptToast({ count: res.data.kept }));
        router.refresh();
    }

    return { busy, keep, keepAll };
}
