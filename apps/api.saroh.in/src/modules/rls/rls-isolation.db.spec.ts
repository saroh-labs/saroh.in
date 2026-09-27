import { Injectable } from "@nestjs/common";
import { currentOrgContext, prisma, runInOrgContext } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";

/**
 * Row-level security isolation for the tables `20261008100000_rls_remaining_tables`
 * covered (#53), proven the way RLS_ROLLOUT_AND_OPS.md §1 probes it: over a
 * NOBYPASSRLS role with enforcement on, a real organization sees only its own
 * rows, an organization that does not exist sees none, and no context sees
 * every row (jobs, public routes and the admin console depend on that).
 *
 * Runs only in RLS mode (`TEST_RLS=on`): a normal run builds its schema with
 * `db push`, which creates no policies, and connects as the owner.
 */
const describeRls = isRlsTestMode() ? describe : describe.skip;

type Delegate = {
    count: (args?: object) => Promise<number>;
};

interface Org {
    id: string;
    userId: string;
    siteId: string;
    storeId: string;
    projectId: string;
    teamId: string;
}

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const later = () => new Date(Date.now() + 86_400_000);

async function makeOrg(label: string): Promise<Org> {
    const org = await prisma.organization.create({
        data: { name: label, slug: uniq(label) },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq(label)}@example.com` },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: label, slug: uniq("site") },
    });
    const store = await prisma.store.create({
        data: { organizationId: org.id, name: label, slug: uniq("store") },
    });
    const project = await prisma.project.create({
        data: { organizationId: org.id, name: label, slug: uniq("project") },
    });
    const team = await prisma.team.create({
        data: { organizationId: org.id, name: uniq("team") },
    });
    return {
        id: org.id,
        userId: user.id,
        siteId: site.id,
        storeId: store.id,
        projectId: project.id,
        teamId: team.id,
    };
}

/** One row per covered table, for `o`. */
async function seedRows(o: Org): Promise<void> {
    const organizationId = o.id;
    await prisma.siteReviewer.create({
        data: { organizationId, siteId: o.siteId, userId: o.userId },
    });
    await prisma.organizationInvitation.create({
        data: {
            organizationId,
            email: `${uniq("invite")}@example.com`,
            role: "MEMBER",
            tokenHash: uniq("invite-token"),
            expiresAt: later(),
        },
    });
    await prisma.adminAccessSession.create({
        data: {
            organizationId,
            actorUserId: o.userId,
            reason: "support",
            idempotencyKey: uniq("access"),
            expiresAt: later(),
        },
    });
    await prisma.adminAuditEvent.create({
        data: {
            organizationId,
            actorUserId: o.userId,
            permission: "organizations.read",
            action: "read",
            targetType: "organization",
            outcome: "SUCCESS",
        },
    });
    await prisma.adminOrganizationNote.create({
        data: { organizationId, authorUserId: o.userId, body: "note" },
    });
    const module = await prisma.organizationModule.create({
        data: { organizationId, moduleKey: "bookings" },
    });
    await prisma.projectModule.create({
        data: {
            organizationId,
            projectId: o.projectId,
            organizationModuleId: module.id,
        },
    });
    const contact = await prisma.contact.create({
        data: { organizationId, email: `${uniq("c")}@example.com` },
    });
    const customer = await prisma.customer.create({
        data: {
            organizationId,
            storeId: o.storeId,
            email: `${uniq("cu")}@example.com`,
        },
    });
    await prisma.customerIdentityLink.create({
        data: {
            organizationId,
            contactId: contact.id,
            customerId: customer.id,
            linkedByUserId: o.userId,
        },
    });
    await prisma.savedView.create({
        data: {
            organizationId,
            ownerUserId: o.userId,
            resource: "orders",
            name: "mine",
            filters: {},
        },
    });
    await prisma.siteComment.create({
        data: {
            organizationId,
            siteId: o.siteId,
            sectionKey: "hero",
            authorUserId: o.userId,
            body: "hello",
        },
    });
    await prisma.siteApproval.create({
        data: {
            organizationId,
            siteId: o.siteId,
            byUserId: o.userId,
            outcome: "APPROVED",
        },
    });
    await prisma.sitePreviewLink.create({
        data: {
            organizationId,
            siteId: o.siteId,
            tokenHash: uniq("preview"),
            createdByUserId: o.userId,
            expiresAt: later(),
        },
    });
    await prisma.idempotencyRecord.create({
        data: {
            organizationId,
            scope: "test",
            key: uniq("key"),
            actorUserId: o.userId,
            fingerprint: "f",
            expiresAt: later(),
        },
    });
    await prisma.storeApiKey.create({
        data: {
            storeId: o.storeId,
            name: "key",
            key: uniq("api-key"),
            secret: "encrypted",
        },
    });
    await prisma.teamMember.create({
        data: { teamId: o.teamId, userId: o.userId },
    });
    await prisma.projectAccess.create({
        data: { projectId: o.projectId, userId: o.userId, role: "VIEWER" },
    });
}

const TABLES: Array<[string, () => Delegate]> = [
    ["SiteReviewer", () => prisma.siteReviewer],
    ["OrganizationInvitation", () => prisma.organizationInvitation],
    ["AdminAccessSession", () => prisma.adminAccessSession],
    ["AdminAuditEvent", () => prisma.adminAuditEvent],
    ["AdminOrganizationNote", () => prisma.adminOrganizationNote],
    ["OrganizationModule", () => prisma.organizationModule],
    ["ProjectModule", () => prisma.projectModule],
    ["CustomerIdentityLink", () => prisma.customerIdentityLink],
    ["SavedView", () => prisma.savedView],
    ["SiteComment", () => prisma.siteComment],
    ["SiteApproval", () => prisma.siteApproval],
    ["SitePreviewLink", () => prisma.sitePreviewLink],
    ["IdempotencyRecord", () => prisma.idempotencyRecord],
    // Child tables, isolated through their parent.
    ["ApiKey (via Store)", () => prisma.storeApiKey],
    ["TeamMember (via Team)", () => prisma.teamMember],
    ["ProjectAccess (via Project)", () => prisma.projectAccess],
];

/** A stand-in service, to prove the harness wraps what Nest provides. */
@Injectable()
class ProbeService {
    forContext(_ctx: { organizationId: string; userId: string; role: string }) {
        return currentOrgContext();
    }

    forId(organizationId: string) {
        return organizationId && currentOrgContext();
    }

    forOther(siteId: string) {
        return siteId && currentOrgContext();
    }
}

describeRls("the RLS-mode harness", () => {
    it("runs a service call made for an organization inside its context, as OrgRlsInterceptor does", () => {
        const probe = new ProbeService();
        const ctx = { organizationId: "org_a", userId: "u", role: "OWNER" };
        expect(probe.forContext(ctx)).toBe("org_a");
        expect(probe.forId("org_b")).toBe("org_b");
        expect(probe.forOther("site_1")).toBeUndefined();
        expect(process.env.RLS_ENFORCEMENT).toBe("on");
    });
});

describeRls("row-level security on the tables #53 covered", () => {
    let a: Org;
    let b: Org;

    beforeAll(async () => {
        a = await makeOrg("rls-a");
        b = await makeOrg("rls-b");
        await seedRows(a);
        await seedRows(b);
    });

    it("connects as a role row-level security applies to", async () => {
        const [role] = await prisma.$queryRaw<
            Array<{ rolsuper: boolean; rolbypassrls: boolean }>
        >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
        expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
    });

    it.each(TABLES)(
        "%s: own rows in context, none for a bogus org, all without context",
        async (_name, delegate) => {
            const own = await runInOrgContext(a.id, () => delegate().count());
            const other = await runInOrgContext(b.id, () => delegate().count());
            const bogus = await runInOrgContext("org_does_not_exist", () =>
                delegate().count(),
            );
            const all = await delegate().count();

            expect(own).toBe(1);
            expect(other).toBe(1);
            expect(bogus).toBe(0);
            expect(all).toBe(2);
        },
    );

    it("refuses to write another organization's row inside a context", async () => {
        await expect(
            runInOrgContext(a.id, () =>
                prisma.savedView.create({
                    data: {
                        organizationId: b.id,
                        ownerUserId: a.userId,
                        resource: "orders",
                        name: "sneaky",
                        filters: {},
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);

        await expect(
            runInOrgContext(a.id, () =>
                prisma.storeApiKey.create({
                    data: {
                        storeId: b.storeId,
                        name: "sneaky",
                        key: uniq("api-key"),
                        secret: "encrypted",
                    },
                }),
            ),
        ).rejects.toThrow(/row-level security/);
    });

    it("hides a row with no organization from inside a context", async () => {
        await prisma.adminAuditEvent.create({
            data: {
                actorUserId: a.userId,
                permission: "flags.write",
                action: "set",
                targetType: "flag",
                outcome: "SUCCESS",
            },
        });
        expect(
            await runInOrgContext(a.id, () => prisma.adminAuditEvent.count()),
        ).toBe(1);
        expect(await prisma.adminAuditEvent.count()).toBe(3);
    });
});
