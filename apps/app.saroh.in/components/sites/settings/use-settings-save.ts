"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Which row is open for editing; one at a time. */
export type EditingRow =
    "postsPrefix" | "title" | "description" | "social" | "menu" | "footer";

/**
 * The settings rows' one save loop (#188): one row open at a time, each
 * save PATCHes only its own field, and the row stays open on a refusal so
 * nothing typed is lost. `saving` names the row whose save is in flight,
 * so only its button says "Saving…".
 */
export function useSettingsSave() {
    const router = useRouter();
    const [editing, setEditing] = useState<EditingRow | null>(null);
    const [saving, setSaving] = useState<EditingRow | null>(null);
    const [pending, startTransition] = useTransition();

    function run(
        row: EditingRow,
        call: () => Promise<{ ok: true } | { ok: false; error: string }>,
        said: string,
    ) {
        setSaving(row);
        startTransition(async () => {
            const res = await call();
            setSaving(null);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setEditing(null);
            // Local state already shows the new value; refresh so the server
            // props (and the publish bar's count) agree with it.
            router.refresh();
            showSuccess(said);
        });
    }

    return { editing, setEditing, saving, pending, run };
}

export type SettingsSave = ReturnType<typeof useSettingsSave>;
