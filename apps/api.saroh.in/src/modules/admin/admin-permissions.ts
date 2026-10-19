/** Fixed Saroh staff roles. These are never Organization membership roles. */
export const AdminRole = {
    PlatformOwner: "PLATFORM_OWNER",
    Support: "SUPPORT",
    Operations: "OPERATIONS",
    Billing: "BILLING",
    ReleaseManager: "RELEASE_MANAGER",
    Auditor: "AUDITOR",
    // Looks after the businesses they brought in or were given, and works
    // Saroh's own sales leads (DEC-169). Sees only their own: every read it
    // makes goes through `scopeForStaff` (`staff-scope.ts`).
    AccountManager: "ACCOUNT_MANAGER",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/**
 * Closed permission vocabulary enforced by the `/admin` API.
 *
 * Every permission here is reachable: an endpoint requires it. A permission
 * nothing requires is a promise the console cannot keep, so it is removed
 * rather than kept for later (the incidents pair went this way when
 * incidents were deferred; see the admin console plan).
 *
 * One planned exception: the Team permissions (DEC-169, admin console
 * redesign plan 2026-10-18-002) were added together in U18 so the role table
 * is reviewed once. Those no endpoint requires yet are listed in
 * `AWAITING_ENDPOINT` with the unit that wires them, and
 * `admin-permissions.spec.ts` fails if one is still listed once a route
 * requires it, or if any other permission is unused.
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
    // Mark a customer's report about a business done (DEC-121). Its own
    // permission: Support takes the reports and closes them, and must not
    // need the lifecycle write that suspends a business to do it.
    ReportsResolve: "reports:resolve",
    // Lift a legal hold on a business (DEC-122). Platform Owners only
    // (owner, 10 Oct): no other role carries it. Placing one needs the
    // lifecycle write that suspends.
    OrganizationLegalHoldLift: "organization:legal-hold:lift",
    // Saroh's own billing across every business (DEC-163): every invoice
    // Saroh issued (buyer name, GSTIN and address), its PDF and the month's
    // GST export, and every business's Saroh subscription with its
    // checkouts and provider events. Platform Owners and Billing only
    // (owner, 17 Oct): never Support, Operations, Release manager or the
    // read-only Auditor.
    SarohBillingRead: "saroh-billing:read",
    // Act on Saroh's own billing (DEC-166): mark a billing action resolved,
    // end a business's autopay keeping its paid period, re-check a double
    // charge's refund, sync the provider's customer again, record a refund
    // the owner made by hand. Platform Owners and Billing only, like the
    // read; every write asks a reason and is on the ledger.
    SarohBillingAct: "saroh-billing:act",
    // Team (DEC-169). See the team and each teammate's profile.
    TeamRead: "team:read",
    // Change a teammate's profile: job, contact, reporting, capacity,
    // commission flag, tax id. Platform Owners only.
    TeamWrite: "team:write",
    // Which manager looks after which business. Account managers hold it
    // scoped to their own (`scopeForStaff`); everyone else sees all.
    AccountsRead: "accounts:read",
    // Give a business a manager, move it, end the link, share out.
    AccountsAssign: "accounts:assign",
    // Saroh's own sales leads (not a business's Leads). Account managers
    // hold both scoped to the leads they own.
    SarohLeadsRead: "saroh-leads:read",
    SarohLeadsWrite: "saroh-leads:write",
    // Money owed to the team: earnings, statements, Mark paid, and a
    // teammate's tax id (last 4 characters only). Platform Owners and Billing.
    TeamPay: "team:pay",
    // Set the commission rates. Platform Owners only. The rates live in the
    // database, never in code.
    CommissionRates: "commission:rates",
    // Help a person sign in (U9): send a code, mark an email verified,
    // change a sign-in email or confirm another's change. Platform owners
    // and Support.
    PeopleSignInHelp: "people:sign-in-help",
} as const;

export type AdminPermission =
    (typeof AdminPermission)[keyof typeof AdminPermission];

export const ALL_ADMIN_PERMISSIONS = Object.freeze(
    Object.values(AdminPermission),
);

/**
 * Permissions in the vocabulary that no endpoint requires yet, each with the
 * unit of plan 2026-10-18-002 that wires it. Remove a row in the unit that
 * adds its first route; `admin-permissions.spec.ts` enforces both directions.
 */
export const AWAITING_ENDPOINT: Readonly<
    Partial<Record<AdminPermission, string>>
> = Object.freeze({
    [AdminPermission.CommissionRates]: "U22/U24: the rates sheet",
    // Checked inside the profile read for the tax id (U18) until the
    // earnings and statements routes require it.
    [AdminPermission.TeamPay]: "U22/U24: earnings, statements, Mark paid",
});

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
        // Support reads customers' reports and marks them done (DEC-121).
        AdminPermission.ReportsResolve,
        // Team (DEC-169): sees the team and who looks after which business,
        // assigns managers and unowned leads, and helps people sign in.
        AdminPermission.TeamRead,
        AdminPermission.AccountsRead,
        AdminPermission.AccountsAssign,
        AdminPermission.SarohLeadsRead,
        AdminPermission.SarohLeadsWrite,
        AdminPermission.PeopleSignInHelp,
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
        // Saroh's invoices and subscriptions (DEC-163).
        AdminPermission.SarohBillingRead,
        // Acting on them: Needs action, autopay, refunds (DEC-166).
        AdminPermission.SarohBillingAct,
        // Team (DEC-169): who looks after whom, and what the team is owed.
        AdminPermission.TeamRead,
        AdminPermission.AccountsRead,
        AdminPermission.TeamPay,
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
        // Team (DEC-169), read-only.
        AdminPermission.TeamRead,
        AdminPermission.AccountsRead,
    ],
    // DEC-169. Only their own businesses and leads, through `scopeForStaff`.
    // Never organization:read (every business), accounts:assign, team:write
    // or staff:grant; `admin-permissions.spec.ts` pins the whole set.
    [AdminRole.AccountManager]: [
        AdminPermission.AccountsRead,
        AdminPermission.SarohLeadsRead,
        AdminPermission.SarohLeadsWrite,
    ],
} as const satisfies Record<AdminRole, readonly AdminPermission[]>;

const ADMIN_ROLES = new Set<string>(Object.values(AdminRole));

/**
 * Roles whose holders see every business and lead (no owner filter). The
 * Account manager is the one role scoped to its own (`staff-scope.ts`).
 */
export const OWN_SCOPED_ROLES: readonly AdminRole[] = Object.freeze([
    AdminRole.AccountManager,
]);

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
