"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { keepAllSamples, keepService } from "@/lib/services/actions";
import { keptToast } from "@/lib/services/cards";
import { useServiceSave } from "@/lib/services/use-services";

/** Which keep is saving: a service's id, or every sample. */
export const KEEP_ALL = "all";

/**
 * Keep and Keep all on the Services list (DEC-189): a trade starter's
 * samples become the owner's as they are, shown to customers. Acts at
 * once; the list is read again after (once).
 */
export function useKeepSamples() {
    const { orgId, saved } = useServiceSave();
    const [busy, setBusy] = useState<string | null>(null);

    async function keep(service: { id: string; name: string }) {
        const res = await runAction(() => keepService(service.id, orgId), {
            setBusy: (on) => setBusy(on ? service.id : null),
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        await saved();
        showSuccess(keptToast({ name: service.name }));
    }

    async function keepAll() {
        const res = await runAction(() => keepAllSamples(orgId), {
            setBusy: (on) => setBusy(on ? KEEP_ALL : null),
        });
        if (!res) return;
        if (!res.ok) return showError(res.error);
        await saved();
        showSuccess(keptToast({ count: res.data.kept }));
    }

    return { busy, keep, keepAll };
}
