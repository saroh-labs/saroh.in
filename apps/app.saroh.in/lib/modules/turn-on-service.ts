import { apiFetch, orgBase, readError } from "@/lib/api/http";

import type { ModuleBlocker, ModuleView } from "./schema";
import type { FieldErrors } from "./turn-on-errors";
import { fieldErrorsOf, suggestionOf } from "./turn-on-errors";
import type { SetupDefaults } from "./turn-on-schema";
import { decodeSetupDefaults, enableResponseSchema } from "./turn-on-schema";

/**
 * The typed client behind the "Turn on" sheet (DEC-068). Server-only: it
 * forwards the session cookie through `apiFetch`, and the sheet reaches it
 * through the Server Actions in `turn-on-actions.ts`.
 */

/** A module switched on with its setup, or why not. */
export type EnableResult =
    | {
          ok: true;
          /** The module as it is now; null when the API sent no view. */
          module: ModuleView | null;
          alreadyEnabled: boolean;
      }
    | {
          ok: false;
          error: string;
          /** Per field of `setup`, from a 400 (`hours.2.open`, `address`). */
          fields: FieldErrors;
          blockers?: ModuleBlocker[];
          /** A free address, offered when the one asked for is taken. */
          suggestion?: string;
      };

/** What the sheet starts from for one module. Never throws. */
export async function getSetupDefaults(key: string): Promise<SetupDefaults> {
    const base = await orgBase();
    if (!base) return decodeSetupDefaults(key, null);
    const res = await apiFetch(
        `${base}/modules/${encodeURIComponent(key)}/setup-defaults`,
    ).catch(() => null);
    if (!res?.ok) return decodeSetupDefaults(key, null);
    return decodeSetupDefaults(key, await res.json().catch(() => null));
}

/**
 * Switch one module on with its minimum. `setup` is left out for a module
 * that asks for nothing, which the API reads as `{}`.
 */
export async function enableModule(
    key: string,
    setup: object,
): Promise<EnableResult> {
    const base = await orgBase();
    if (!base) {
        return { ok: false, error: "No active organization.", fields: {} };
    }
    const res = await apiFetch(`${base}/modules/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "ENABLED", setup }),
    }).catch(() => null);
    if (!res) {
        return {
            ok: false,
            error: "Saroh couldn't be reached. Nothing was turned on.",
            fields: {},
        };
    }
    const raw = (await res.json().catch(() => null)) as unknown;
    if (res.ok) {
        const parsed = enableResponseSchema.safeParse(raw);
        return {
            ok: true,
            module: parsed.success ? (parsed.data.data ?? null) : null,
            alreadyEnabled: parsed.success
                ? (parsed.data.alreadyEnabled ?? false)
                : false,
        };
    }
    const body = raw as {
        message?: string;
        error?: string | { message?: string };
        blockers?: ModuleBlocker[];
    } | null;
    return {
        ok: false,
        error: readError(body, "That couldn't be turned on. Try again."),
        fields: fieldErrorsOf(raw),
        blockers: body?.blockers,
        suggestion: suggestionOf(raw) ?? undefined,
    };
}
