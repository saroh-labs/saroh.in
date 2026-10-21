import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

import type { CustomerEmails } from "./customer-emails";
import { isCustomerEmails } from "./customer-emails";

const PATH = "/customer-notices/settings";

/**
 * The business's automatic emails to its customers, and whether this
 * person may change them (`GET …/customer-notices/settings`). Anyone in
 * the business may read them. Null when they couldn't be read, or from an
 * API without them: the row is then not drawn, never guessed.
 */
export async function readCustomerEmails(): Promise<CustomerEmails | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}${PATH}`).catch(() => null);
    if (!res?.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    return isCustomerEmails(body) ? body : null;
}

/** Turn one on or off for the business (`comms:manage`). */
export function setCustomerEmail(change: {
    kind: string;
    on: boolean;
}): Promise<CrmResult<CustomerEmails>> {
    return mutate<CustomerEmails>(
        PATH,
        "PATCH",
        { kind: change.kind, on: change.on },
        "Couldn't save that. Try again.",
    );
}
