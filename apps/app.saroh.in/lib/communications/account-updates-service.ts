import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { AccountUpdates } from "./account-updates";
import { isAccountUpdates } from "./account-updates";

const PATH = "/customer-notices/account-updates";

/**
 * Whether Saroh posts updates to the business's customers' Messages, and
 * whether that choice can have an effect yet
 * (`GET …/customer-notices/account-updates`). Null when it couldn't be
 * read, this person may not (the API refuses anyone without
 * `comms:manage`), or the API predates it: the row is then not drawn,
 * never guessed.
 */
export async function readAccountUpdates(): Promise<AccountUpdates | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}${PATH}`).catch(() => null);
    if (!res?.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    return isAccountUpdates(body) ? body : null;
}

/** Turn them on or off for the business. */
export function setAccountUpdates(
    on: boolean,
): Promise<CrmResult<AccountUpdates>> {
    return mutate<AccountUpdates>(
        PATH,
        "PATCH",
        { on },
        "Couldn't save that. Try again.",
    );
}
