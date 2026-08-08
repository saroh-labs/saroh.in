import { SetMetadata } from "@nestjs/common";

export const IDENTITY_ONLY = "admin:identity-only";

/**
 * Declare that being admitted by `PlatformAdminGuard` is the COMPLETE
 * authorization for a handler — no further permission is required.
 *
 * This exists so that "needs no permission" is something a route says, rather
 * than something it fails to say. `PlatformPermissionGuard` used to read absent
 * metadata as "allow", which meant the default for every newly added route was
 * ungated: forget the decorator and the route ships open. Nothing was exposed,
 * because every route happened to carry one — but the guarantee rested on
 * everyone remembering, forever.
 *
 * Use sparingly, and only where the answer to "which permission?" is genuinely
 * "none, any authenticated staff member may see this". `/admin/me` qualifies:
 * it returns the caller's own identity and permissions, which they must be able
 * to read in order for the console to render at all.
 */
export const IdentityOnly = () => SetMetadata(IDENTITY_ONLY, true);
