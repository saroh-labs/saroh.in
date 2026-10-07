import { apiFetch, orgBase } from "@/lib/api/http";

import type { EmailMay, EmailSetup } from "./email-setup";

/**
 * Whether the business has its own email provider, and if not whether its
 * plan lets it connect one (`GET …/comms-providers/email-setup`). Asked only
 * of someone who may act on it — the API refuses anyone else — and null
 * when it couldn't be read, or from an API without it: nothing is then
 * said, never a guess.
 */
export async function readEmailSetup(
    may: EmailMay,
): Promise<EmailSetup | null> {
    if (!may.connect && !may.plans) return null;
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/comms-providers/email-setup`).catch(
        () => null,
    );
    if (!res?.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    return isEmailSetup(body) ? body : null;
}

function isEmailSetup(body: unknown): body is EmailSetup {
    if (typeof body !== "object" || body === null) return false;
    const b = body as Record<string, unknown>;
    return (
        typeof b.connected === "boolean" &&
        (b.canConnect === null || typeof b.canConnect === "boolean")
    );
}
