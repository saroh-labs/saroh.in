import { env } from "@/env";

export const accountsUrl =
    env.NEXT_PUBLIC_ACCOUNTS_URL ?? "https://accounts.saroh.in";

export const accountsLoginUrl = `${accountsUrl}/login`;

/**
 * Authorization for /admin/* is NOT decided here. api.saroh.in owns it:
 * `PlatformAdminGuard` requires an active, non-revoked PlatformAdmin grant and
 * `PlatformPermissionGuard` fails closed on the specific permission. This app
 * only forwards the session cookie and renders what the API allows.
 *
 * A local `isAdmin(session)` helper used to live here, reading the
 * `ADMIN_ALLOWLIST` env. Nothing ever called it, but its docstring claimed to
 * be "the single authorization seam" — which would send anyone changing admin
 * access to the wrong file. The allowlist survives only as an API-side
 * break-glass bootstrap for the first/recovery platform owner.
 */
