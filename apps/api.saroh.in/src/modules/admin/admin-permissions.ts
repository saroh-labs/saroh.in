/** Fixed Saroh staff roles. These are never Organization membership roles. */
export const AdminRole = {
    PlatformOwner: "PLATFORM_OWNER",
    Support: "SUPPORT",
    Operations: "OPERATIONS",
    Billing: "BILLING",
    ReleaseManager: "RELEASE_MANAGER",
    Auditor: "AUDITOR",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/**
 * Closed permission vocabulary enforced by the `/admin` API.
 *
 * Every permission here is reachable: an endpoint requires it. A permission
 * nothing requires is a promise the console cannot keep, so it is removed
 * rather than kept for later (the incidents pair went this way when
 * incidents were deferred; see the admin console plan).
 */
export const AdminPermission = {
    PlatformRead: "platform:read",
    OrganizationRead: "organization:read",
    OrganizationPiiRead: "organization:pii:read",
    // The waitlist (U30): who is waiting, by kind, city, source and referrer.
    WaitlistRead: "waitlist:read",
    OrganizationPeopleWrite: "organization:people:write",
    OrganizationModulesWrite: "organization:modules:write",
    OrganizationLifecycleWrite: "organization:lifecycle:write",
    OrganizationViewAs: "organization:view-as",
    JobsRead: "jobs:read",
    JobsRetry: "jobs:retry",
    WebhooksRead: "webhooks:read",
    WebhooksReplay: "webhooks:replay",
    ProvidersRead: "providers:read",
    ProvidersRecheck: "providers:recheck",
    SubscriptionRead: "subscription:read",
    SubscriptionOverride: "subscription:override",
    FlagsRead: "flags:read",
    FlagsPublish: "flags:publish",
    StaffRead: "staff:read",
    StaffGrant: "staff:grant",
    AuditRead: "audit:read",
    WaitlistInvite: "waitlist:invite",
    // Plans & modules: the catalogue, its versions and impact (pricing U3).
    PricingRead: "pricing:read",
    // Catalogue writes (pricing U4): save or discard the shared draft.
    PricingEdit: "pricing:edit",
    // Publish, schedule, cancel a scheduled version, roll back.
    PricingPublish: "pricing:publish",
    // Coupons apply the moment they are saved, outside versions.
    CouponsManage: "coupons:manage",
    // One business's catalogue exceptions (pricing U11): grant, remove or
    // limit a row, put it on a plan, move it to the live version. A custom
    // price needs this and pricing:publish.
    PricingOverride: "pricing:override",
    // Switch a site's trackers off, or back on, when a connected tool is
    // misused or a tag breaks the site (#897). Only staff turn them back on.
    OrganizationTrackersWrite: "organization:trackers:write",
    // See and start deploys of the Cloudflare apps, dev and production
    // (#886, DEC-107). Platform Owners only (owner, 8 Oct): no other role
    // carries it.
    DeploymentsRun: "deployments:run",
    // Mark a customer's report about a business done (DEC-118). Its own
    // permission: Support takes the reports and closes them, and must not
    // need the lifecycle write that suspends a business to do it.
    ReportsResolve: "reports:resolve",
} as const;

export type AdminPermission =
    (typeof AdminPermission)[keyof typeof AdminPermission];

export const ALL_ADMIN_PERMISSIONS = Object.freeze(
    Object.values(AdminPermission),
);

const ROLE_PERMISSIONS = {
    [AdminRole.PlatformOwner]: ALL_ADMIN_PERMISSIONS,
    [AdminRole.Support]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.OrganizationPiiRead,
        AdminPermission.WaitlistRead,
        AdminPermission.OrganizationPeopleWrite,
        AdminPermission.OrganizationViewAs,
        AdminPermission.WaitlistInvite,
        // Support takes the misuse report and already opens the business.
        AdminPermission.OrganizationTrackersWrite,
        // Support reads customers' reports and marks them done (DEC-118).
        AdminPermission.ReportsResolve,
    ],
    [AdminRole.Operations]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.OrganizationModulesWrite,
        AdminPermission.JobsRead,
        AdminPermission.JobsRetry,
        AdminPermission.WebhooksRead,
        AdminPermission.WebhooksReplay,
        AdminPermission.ProvidersRead,
        AdminPermission.ProvidersRecheck,
    ],
    [AdminRole.Billing]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.SubscriptionRead,
        AdminPermission.SubscriptionOverride,
        AdminPermission.PricingRead,
        AdminPermission.PricingEdit,
        AdminPermission.PricingOverride,
        // Coupons are the Billing team's to run (owner, 2026-10-03).
        AdminPermission.CouponsManage,
    ],
    [AdminRole.ReleaseManager]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.FlagsRead,
        AdminPermission.FlagsPublish,
    ],
    [AdminRole.Auditor]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.JobsRead,
        AdminPermission.WebhooksRead,
        AdminPermission.ProvidersRead,
        AdminPermission.SubscriptionRead,
        AdminPermission.FlagsRead,
        AdminPermission.StaffRead,
        AdminPermission.AuditRead,
        AdminPermission.PricingRead,
    ],
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

const ADMIN_ROLES = new Set<string>(Object.values(AdminRole));

export function isAdminRole(value: string): value is AdminRole {
    return ADMIN_ROLES.has(value);
}

/** Return the union in vocabulary order so API responses remain deterministic. */
export function permissionsFor(roles: readonly AdminRole[]): AdminPermission[] {
    const granted = new Set<AdminPermission>();
    for (const role of roles) {
        for (const permission of ROLE_PERMISSIONS[role]) {
            granted.add(permission);
        }
    }
    return ALL_ADMIN_PERMISSIONS.filter((permission) =>
        granted.has(permission),
    );
}
