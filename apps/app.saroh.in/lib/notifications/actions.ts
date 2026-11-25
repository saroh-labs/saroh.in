"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import type { CrmResult } from "@/lib/api/http";

import type { AlertChange, AlertPreferences } from "./preferences";
import { alertUndoRefusal } from "./preferences";
import type { NotificationsResult } from "./service";
import {
    getAlertPreferences,
    markAllNotificationsRead as markAllApi,
    markNotificationRead as markReadApi,
    undoMarkAllNotificationsRead as undoReadAllApi,
    updateAlert,
} from "./service";

/**
 * Server Actions for the notification inbox. Thin wrappers that post to
 * api.saroh.in forwarding the session cookie + active-org header; the API
 * resolves the user from the session (never a client id) and enforces
 * membership + `notification:write`. Kept separate from the read service so the
 * UI is decoupled from where the data lives.
 */

/**
 * Opening a row is reading it. Each takes the tab's business last
 * (DEC-259): refused when another one was opened since (`writeAsOrg`);
 * nothing is revalidated, the inbox reads its query and the shell's live
 * read (the bell's count) again itself (`useNotificationsSave`).
 */
export async function markNotificationRead(
    id: string,
    orgId: string,
): Promise<NotificationsResult<{ id: string }>> {
    return writeAsOrg(orgId, () => markReadApi(id));
}

export async function markAllNotificationsRead(
    orgId: string,
): Promise<NotificationsResult<{ updated: number; readAt: string | null }>> {
    return writeAsOrg(orgId, () => markAllApi());
}

/** Undo of "Mark all as read", for the instant that press answered with. */
export async function undoMarkAllNotificationsRead(
    readAt: string,
    orgId: string,
): Promise<NotificationsResult<{ updated: number }>> {
    return writeAsOrg(orgId, () => undoReadAllApi(readAt));
}

/**
 * Flip one of your own alerts (F14). The API decides what you may choose
 * and which channels can deliver; this never does. The bell's count in the
 * header follows what you hear about, so the shell is refreshed. Your
 * profile on React Query passes the tab's business last (`writeAsOrg`,
 * nothing revalidated); the tab keeps the answer and reads the bell again.
 */
export async function saveAlert(
    change: AlertChange,
    orgId?: string,
): Promise<CrmResult<AlertPreferences>> {
    if (orgId) return writeAsOrg(orgId, () => updateAlert(change));
    const result = await updateAlert(change);
    // rq-revalidate-ok: Your profile (Settings) is server-rendered, not on React Query.
    if (result.ok) revalidatePath("/", "layout");
    return result;
}

/**
 * Undo a switch (F12's pattern): the same save, the other way, refused in
 * words if the switch no longer reads as that save left it.
 */
export async function undoAlert(
    undo: { back: AlertChange; expect: boolean },
    orgId?: string,
): Promise<CrmResult<AlertPreferences>> {
    const run = async (): Promise<CrmResult<AlertPreferences>> => {
        const current = await getAlertPreferences();
        if (current.status !== "ok") {
            return {
                ok: false,
                error: "Couldn't read your alerts to undo that",
            };
        }
        const refusal = alertUndoRefusal(undo, current.prefs);
        if (refusal) return { ok: false, error: refusal };
        return orgId ? updateAlert(undo.back) : saveAlert(undo.back);
    };
    return orgId ? writeAsOrg(orgId, run) : run();
}
