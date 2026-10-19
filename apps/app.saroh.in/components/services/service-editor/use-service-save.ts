"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import {
    createService,
    replaceRules,
    updateService,
} from "@/lib/services/actions";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    changedParts,
    serviceInput,
    serviceUpdate,
    TREATMENT_NEEDS_STOREFRONT,
} from "@/lib/services/service-editor";
import { hoursNotSaved, rulesOf } from "@/lib/services/service-hours-draft";
import { setStaffServices } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

/** How a Save went: all of it, or the service and not all the rest. */
export type SaveOutcome = "saved" | "partly" | "refused";

/**
 * The Service Editor's one Save, which goes in up to three calls: the
 * service, who does it (a call per person whose list changes), and its own
 * weekly hours (`PUT …/rules`, which replaces the set). `saved` is moved
 * forward one call at a time, so after a Save that got part of the way the
 * next one sends only what is left (`changedParts`).
 *
 * A new service's Save that adds it and not its hours stays on the page,
 * says exactly that (`hoursFailed`), and editing goes on against the
 * service now added (`createdId`). An edit's panel stays open with what
 * was typed and says the same in a toast.
 */
export function useServiceSave({
    serviceId: savedServiceId,
    initial,
    people,
    staffRead,
    hoursRead,
    currency,
}: {
    /** Null for a new service. */
    serviceId: string | null;
    initial: ServiceDraft;
    /** The active people on the diary. */
    people: readonly StaffView[];
    /** Who does it could be read: it is written only then. */
    staffRead: boolean;
    /** Its own hours could be read: they are written only then. */
    hoursRead: boolean;
    currency: string;
}) {
    const router = useRouter();
    const [createdId, setCreatedId] = useState<string | null>(null);
    const serviceId = savedServiceId ?? createdId;
    const [saved, setSaved] = useState(initial);
    const [saving, setSaving] = useState(false);
    // The API said there is no storefront to sell a treatment from (E10).
    const [refusedStorefront, setRefusedStorefront] = useState(false);
    // The service was saved and its hours were not.
    const [hoursFailed, setHoursFailed] = useState<{
        created: boolean;
        reason: string;
    } | null>(null);

    /** Who does it, written to each person whose list changes. */
    async function setWho(id: string, want: readonly string[]) {
        for (const p of people) {
            const has = p.serviceIds.includes(id);
            const should = want.includes(p.id);
            if (has === should) continue;
            const next = should
                ? [...p.serviceIds, id]
                : p.serviceIds.filter((x) => x !== id);
            const res = await setStaffServices(p.id, next);
            if (!res.ok) return res.error;
        }
        return null;
    }

    /** A refused save: said where the visits are when it is the storefront. */
    function refused(error: string) {
        if (error === TREATMENT_NEEDS_STOREFRONT) {
            setRefusedStorefront(true);
            return;
        }
        showError(error);
    }

    /**
     * Send `draft`. `message` is the toast once all of it is saved. A new
     * service goes to its own page then; a saved one is read again.
     */
    async function save(
        draft: ServiceDraft,
        message: string,
    ): Promise<SaveOutcome> {
        if (saving) return "refused";
        setSaving(true);
        const parts = changedParts(saved, draft);
        const creating = serviceId === null;
        const added = creating || createdId !== null;

        // 1. The service itself.
        let id = serviceId;
        if (id === null) {
            const res = await runAction(() =>
                createService(serviceInput(draft, currency)),
            );
            if (!res?.ok) {
                setSaving(false);
                if (res) refused(res.error);
                return "refused";
            }
            id = res.data.id;
            setCreatedId(id);
        } else if (parts.fields) {
            const target = id;
            const res = await runAction(() =>
                updateService(target, serviceUpdate(draft, currency)),
            );
            if (!res?.ok) {
                setSaving(false);
                if (res) refused(res.error);
                return "refused";
            }
        }
        const savedId = id;
        let nowSaved: ServiceDraft = {
            ...draft,
            staffIds: saved.staffIds,
            hours: saved.hours,
        };

        // 2. Who does it.
        let whoError: string | null = null;
        if (staffRead && (creating ? draft.staffIds.length > 0 : parts.who)) {
            const who = await runAction(
                async () => ({ error: await setWho(savedId, draft.staffIds) }),
                { quiet: true },
            );
            whoError = who ? who.error : UNREACHED;
        }
        if (!whoError) nowSaved = { ...nowSaved, staffIds: draft.staffIds };

        // 3. Its own weekly hours.
        let hoursError: string | null = null;
        const sendHours =
            hoursRead && (creating ? draft.hours.length > 0 : parts.hours);
        if (sendHours) {
            const toSend = rulesOf(draft.hours) ?? [];
            const res = await runAction(() => replaceRules(savedId, toSend), {
                quiet: true,
            });
            hoursError = res ? (res.ok ? null : res.error) : UNREACHED;
        }
        if (!hoursError) nowSaved = { ...nowSaved, hours: draft.hours };

        // A new service's draft started with these in it, so what is not
        // saved has to differ from `saved` for the next Save to send it.
        if (creating) {
            if (whoError) nowSaved = { ...nowSaved, staffIds: [] };
            if (hoursError) nowSaved = { ...nowSaved, hours: [] };
        }
        setSaved(nowSaved);
        setSaving(false);
        setHoursFailed(
            hoursError ? { created: added, reason: hoursError } : null,
        );

        if (whoError) {
            showError(
                added
                    ? "Added, but who does it wasn't saved."
                    : "Saved, but who does it didn't change.",
                whoError,
            );
        }
        if (hoursError) {
            // A new service says it on the page, with Try again; an edit's
            // panel stays open with the hours typed, and Save sends them.
            if (!added) {
                const said = hoursNotSaved({
                    created: false,
                    name: draft.name.trim() || "The service",
                    reason: hoursError,
                });
                showError(said.title, said.body);
            }
            if (!creating) router.refresh();
            return "partly";
        }
        // Who does it is said above; a service just added still goes to its
        // own page, where it is picked again.
        if (!whoError) showSuccess(message);
        if (added) router.replace(`/services/${savedId}`);
        else router.refresh();
        return whoError ? "partly" : "saved";
    }

    return {
        serviceId,
        createdId,
        saved,
        saving,
        refusedStorefront,
        hoursFailed,
        save,
    };
}
