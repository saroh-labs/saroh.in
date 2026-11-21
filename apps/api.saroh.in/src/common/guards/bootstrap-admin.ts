import { env } from "../../env";

/** True when `email` is listed in the break-glass `ADMIN_ALLOWLIST`. */
export function isBootstrapAdmin(email: string | null | undefined): boolean {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) return false;

    const allow = (env.ADMIN_ALLOWLIST ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    return allow.includes(normalized);
}
