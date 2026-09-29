"use server";

import { revalidatePath } from "next/cache";

import type { CrmResult } from "@/lib/api/http";

import type { AlertChange, AlertPreferences } from "./preferences";
import { alertUndoRefusal } from "./preferences";
import type { NotificationsResult } from "./service";
import {
    getAlertPreferences,
    markAllNotificationsRead as markAllApi,
    markNotificationRead as markReadApi,
    updateAlert,
} from "./service";

/**
 * Server Actions for the notification inbox. Thin wrappers that post to
 * api.saroh.in forwarding the session cookie + active-org header; the API
 * resolves the user from the session (never a client id) and enforces
 * membership + `notification:write`. Kept separate from the read service so the
 * UI is decoupled from where the data lives.
 */

export async function markNotificationRead(
    id: string,
): Promise<NotificationsResult<{ id: string }>> {
    return markReadApi(id);
}

export async function markAllNotificationsRead(): Promise<
    NotificationsResult<{ updated: number }>
> {
    return markAllApi();
}

/**
 * Flip one of your own alerts (F14). The API decides what you may choose
 * and which channels can deliver; this never does. The bell's count in the
 * header follows what you hear about, so the shell is refreshed.
 */
export async function saveAlert(
    change: AlertChange,
): Promise<CrmResult<AlertPreferences>> {
    const result = await updateAlert(change);
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/**
 * Undo a switch (F12's pattern): the same save, the other way, refused in
 * words if the switch no longer reads as that save left it.
 */
export async function undoAlert(undo: {
    back: AlertChange;
    expect: boolean;
}): Promise<CrmResult<AlertPreferences>> {
    const current = await getAlertPreferences();
    if (current.status !== "ok") {
        return { ok: false, error: "Couldn't read your alerts to undo that" };
    }
    const refusal = alertUndoRefusal(undo, current.prefs);
    if (refusal) return { ok: false, error: refusal };
    return saveAlert(undo.back);
}
