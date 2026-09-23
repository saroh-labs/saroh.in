import type { AdminRole } from "./control-plane";

/**
 * Staff roles in words. Kept apart from `staff.ts`, which is server-only,
 * so client components can name a role too.
 */

/** A role, in words. */
export const ROLE_LABEL: Record<AdminRole, string> = {
    PLATFORM_OWNER: "Platform owner",
    SUPPORT: "Support",
    OPERATIONS: "Operations",
    BILLING: "Billing",
    RELEASE_MANAGER: "Release manager",
    AUDITOR: "Auditor",
};

/** What each role is for, in one line. The permissions list is the source of truth. */
export const ROLE_PURPOSE: Record<AdminRole, string> = {
    PLATFORM_OWNER: "Everything, including who else has access.",
    SUPPORT: "Opens businesses to help them, and fixes their people.",
    OPERATIONS:
        "Keeps the machinery running: jobs, webhooks, providers, modules.",
    BILLING: "Plans, trials and limits.",
    RELEASE_MANAGER: "Turns capabilities on for one business, then everyone.",
    AUDITOR: "Reads everything, changes nothing.",
};
