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

/** Closed permission vocabulary enforced by the `/admin` API. */
export const AdminPermission = {
    PlatformRead: "platform:read",
    OrganizationRead: "organization:read",
    OrganizationPiiRead: "organization:pii:read",
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
    IncidentsRead: "incidents:read",
    IncidentsWrite: "incidents:write",
    SubscriptionRead: "subscription:read",
    SubscriptionOverride: "subscription:override",
    FlagsRead: "flags:read",
    FlagsPublish: "flags:publish",
    StaffRead: "staff:read",
    StaffGrant: "staff:grant",
    AuditRead: "audit:read",
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
        AdminPermission.OrganizationPeopleWrite,
        AdminPermission.OrganizationViewAs,
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
        AdminPermission.IncidentsRead,
        AdminPermission.IncidentsWrite,
    ],
    [AdminRole.Billing]: [
        AdminPermission.PlatformRead,
        AdminPermission.OrganizationRead,
        AdminPermission.SubscriptionRead,
        AdminPermission.SubscriptionOverride,
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
        AdminPermission.IncidentsRead,
        AdminPermission.SubscriptionRead,
        AdminPermission.FlagsRead,
        AdminPermission.StaffRead,
        AdminPermission.AuditRead,
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
