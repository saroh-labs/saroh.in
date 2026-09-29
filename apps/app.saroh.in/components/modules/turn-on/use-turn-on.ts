"use client";

import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { blockerSentence } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import type { TurnOnDraft } from "@/lib/modules/turn-on";
import {
    CONNECT_KEYS,
    draftFrom,
    drawnField,
    finishSetupItems,
    landingHref,
    moduleName,
    problemsOf,
    sellsOnline,
    setupFor,
    turnedOnToast,
    turnOnPlan,
} from "@/lib/modules/turn-on";
import {
    enableModuleAction,
    readSetupDefaultsAction,
} from "@/lib/modules/turn-on-actions";
import type { FieldErrors } from "@/lib/modules/turn-on-errors";
import type { SetupDefaults } from "@/lib/modules/turn-on-schema";
import { decodeSetupDefaults } from "@/lib/modules/turn-on-schema";

/**
 * The sheet's state: what it starts from (read from `setup-defaults` when it
 * opens), the draft, the plan that follows from both, and the save — each
 * module turned on in order, the first refusal put on its fields and the
 * sheet kept open, and on success the merchant taken to the module's first
 * screen with what is left to finish.
 */
export function useTurnOn({
    picked,
    modules,
    onClose,
}: {
    picked: readonly string[];
    modules: readonly ModuleView[];
    onClose: () => void;
}) {
    const router = useRouter();
    const [loaded, setLoaded] = useState<SetupDefaults[] | null>(null);
    const [draft, setDraft] = useState<TurnOnDraft | null>(null);
    const [errors, setErrors] = useState<Partial<Record<string, FieldErrors>>>(
        {},
    );
    const [failure, setFailure] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // What is on already from an earlier press that stopped part-way: a
    // retry doesn't send it again.
    const done = useRef<{ key: string; view: ModuleView | null }[]>([]);

    const pickedKey = picked.join(",");
    useEffect(() => {
        let live = true;
        // Everything the sheet may ask about: the picks, what they need,
        // and Website, which selling online brings (DEC-069).
        const wide = turnOnPlan({ picked, modules, sellsOnline: true }).order;
        const keys = Array.from(new Set([...picked, ...wide]));
        readSetupDefaultsAction(keys).then(
            (defaults) => {
                if (!live) return;
                setLoaded(defaults);
                setDraft(draftFrom(defaults));
            },
            () => {
                if (!live) return;
                // Not read: start from the sheet's own defaults. The API
                // still judges what is saved.
                const fallback = keys.map((k) => decodeSetupDefaults(k, null));
                setLoaded(fallback);
                setDraft(draftFrom(fallback));
            },
        );
        return () => {
            live = false;
        };
        // The picks are the sheet's identity; it remounts for new ones.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickedKey]);

    const apiDeps = useMemo(
        () =>
            Object.fromEntries(
                (loaded ?? []).map((d) => [d.key, d.dependencies]),
            ),
        [loaded],
    );
    const plan = turnOnPlan({
        picked,
        modules,
        apiDeps,
        sellsOnline: draft ? sellsOnline(draft) : false,
    });
    const hidden = (loaded ?? []).filter(
        (d) => d.hidden && plan.order.includes(d.key),
    );

    const update = (change: (d: TurnOnDraft) => TurnOnDraft) => {
        setDraft((d) => (d ? change(d) : d));
        setFailure(null);
    };

    /**
     * Turn everything in the plan on. `connect` is the answer of the
     * "Connect now" / "Later" buttons, when the sheet asks it that way.
     */
    const submit = async (connect?: boolean) => {
        if (!draft || saving || hidden.length > 0) return;
        const sent: TurnOnDraft =
            connect === undefined
                ? draft
                : {
                      ...draft,
                      connect: Object.fromEntries(
                          Array.from(CONNECT_KEYS).map((k) => [k, connect]),
                      ),
                  };
        const problems = problemsOf(sent, plan.order);
        setErrors(problems);
        setFailure(null);
        if (Object.keys(problems).length > 0) return;

        setSaving(true);
        for (const key of plan.order) {
            if (done.current.some((d) => d.key === key)) continue;
            const res = await enableModuleAction(
                key,
                setupFor(key, sent),
            ).catch(() => ({
                ok: false as const,
                error: "Saroh couldn't be reached. Try again.",
                fields: {},
                blockers: undefined,
            }));
            if (!res.ok) {
                setSaving(false);
                const drawn = Object.fromEntries(
                    Object.entries(res.fields).filter(([p]) =>
                        drawnField(key, p),
                    ),
                );
                const loose = Object.entries(res.fields)
                    .filter(([p]) => !drawnField(key, p))
                    .map(([, said]) => said);
                setErrors({ [key]: drawn });
                const refused = res.blockers?.[0];
                const why =
                    Object.keys(drawn).length > 0 && loose.length === 0
                        ? null
                        : refused
                          ? blockerSentence(refused)
                          : [res.error, ...loose].join(" ");
                const onAlready = done.current.map((d) =>
                    moduleName(d.key, modules),
                );
                setFailure(
                    onAlready.length > 0
                        ? `${listWords(onAlready)} ${onAlready.length === 1 ? "is" : "are"} on, but ${moduleName(key, modules)} isn't yet.${why ? ` ${why}` : ""}`
                        : why,
                );
                // What did turn on shows behind the sheet.
                if (onAlready.length > 0) router.refresh();
                return;
            }
            done.current.push({ key, view: res.module });
        }
        setSaving(false);
        onClose();
        const names = plan.order.map((k) => moduleName(k, modules));
        showSuccess(
            turnedOnToast(
                names,
                finishSetupItems(done.current.map((d) => d.view)),
            ),
        );
        const href = landingHref(picked, plan, sent);
        if (href) router.push(href);
        else router.refresh();
    };

    return {
        ready: draft !== null,
        draft,
        plan,
        apiDeps,
        hidden,
        errors,
        failure,
        saving,
        update,
        submit,
    };
}
