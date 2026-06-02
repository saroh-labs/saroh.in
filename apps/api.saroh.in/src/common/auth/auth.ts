import { type Auth, createAuth } from "@saroh/auth";

/**
 * api.saroh.in builds the SAME Better Auth instance as accounts.saroh.in
 * (identical secret, Prisma adapter, plugins) so it can validate sessions by
 * a direct lookup against the shared Postgres. It never issues auth, so no
 * email senders are supplied.
 */
export const auth: Auth = createAuth();
