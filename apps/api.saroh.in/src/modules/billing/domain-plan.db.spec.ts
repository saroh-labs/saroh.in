/**
 * A business's own domain when its plan stops including one (DEC-139),
 * against a real Postgres: the billing sweep tells the business ahead in
 * the plan's own notice, the domain shows the site for 3 days after the
 * plan ends, then it is paused and its host names the Saroh address; a
 * plan with a domain again brings it back at once. Nothing is removed: the
 * `Domain` row is never written.
 *
 * - A plan given until a date: the line rides on the plan-ending notice
 *   and email, the clock starts at that end, and the pause is told once.
 * - A plan that ended at once: told within the hour, paused 3 days later.
 * - Plan enforcement off: nothing changes anywhere.
 * - Another business's domain is never touched.
 *
 * Every catalogue here is made up (`fakeCatalog`: Plan A free, Plan B and
 * Plan C paid); every domain is an example one. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { SarohBillingEmail } from "../../common/email";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { DOMAIN_PAUSED_REASON, domainPausedHere } from "../sites/domain-paused";
import { primaryHostOf } from "../sites/primary-host";
import {
    platformOrigin,
    rendererHost,
    siteOriginOf,
} from "../sites/site-origin";
import { BILLING_EMAIL_TYPE, BillingEmailHandler } from "./billing-email.job";
import { CatalogueAccessService } from "./catalogue-access.service";
import {
    DOMAIN_ENDED_KEY,
    DOMAIN_ENDED_KIND,
    DOMAIN_PAUSED_KIND,
    DOMAIN_TOLD_KIND,
} from "./domain-plan";
import { domainPlan, DomainPlanService } from "./domain-plan.service";
import { MovesApplyHandler } from "./moves-apply.handler";
import { OverLimitService } from "./over-limit.service";
import { PLAN_ENDING_NOTIFICATION_TYPE } from "./plan-ending";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;

const on = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const off = {
    isEnabled: () => Promise.resolve(false),
} as unknown as FeatureFlagService;

const access = new CatalogueAccessService(on);
const paused = new OverLimitService(access, on);
const domains = new DomainPlanService(access, on);
const sweep = new MovesApplyHandler(access, paused, domains);

let sent: SarohBillingEmail[];
let mailer: BillingEmailHandler;

beforeEach(async () => {
    sent = [];
    mailer = new BillingEmailHandler((email) => {
        sent.push(email);
        return Promise.resolve("sent");
    }, domains);
    paused.forget();
    domains.forget();
    domainPlan.forget();
    await prisma.job.deleteMany({});
    // Earlier tests' plans and domains: taken away, so each test's sweep
    // reads only its own businesses.
    await prisma.entitlementOverride.updateMany({
        where: { organization: { slug: { endsWith: tag } }, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    await prisma.domain.deleteMany({});
    await prisma.customerNotice.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = fakeCatalog();
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
});

afterEach(() => {
    // Nothing in this file ever reaches a real mail transport.
    expect(createTransport).not.toHaveBeenCalled();
});

let seq = 0;

/** A business on Free with an owner, a website and its own verified domain. */
async function business() {
    seq += 1;
    const address = `shop-${seq}-${tag}`;
    const org = await prisma.organization.create({
        data: { name: `Domain ${seq}`, slug: address },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const owner = await prisma.user.create({
        data: { email: `owner-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: `Domain ${seq}`,
            slug: `site-${seq}`,
            subdomain: address,
        },
    });
    const hostname = `www.shop-${seq}-${tag}.example.com`;
    const domain = await prisma.domain.create({
        data: {
            organizationId: org.id,
            hostname,
            siteId: site.id,
            status: "VERIFIED",
            verificationToken: `token-${seq}`,
            verifiedAt: new Date(Date.now() - 30 * DAY),
            hostingId: `host-${seq}`,
            hostingStatus: "ACTIVE",
        },
    });
    return {
        organizationId: org.id,
        ownerEmail: owner.email,
        site,
        address,
        hostname,
        domain,
    };
}

async function planUntil(
    organizationId: string,
    planKey: string,
    end: Date | null,
) {
    return prisma.entitlementOverride.create({
        data: {
            organizationId,
            kind: "plan",
            key: "plan",
            planKey,
            reason: "Test plan.",
            grantedByUserId: "test-user",
            expiresAt: end,
        },
    });
}

function notices(organizationId: string) {
    return prisma.notification.findMany({
        where: { organizationId, type: PLAN_ENDING_NOTIFICATION_TYPE },
        orderBy: { createdAt: "asc" },
    });
}

function claims(organizationId: string, kind: string) {
    return prisma.customerNotice.findMany({
        where: { organizationId, kind },
    });
}

/** Run every waiting billing email, as the worker would. */
async function runMail() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_EMAIL_TYPE, status: "PENDING" },
    });
    for (const j of jobs) {
        await mailer.handle(j as Job);
        await prisma.job.update({
            where: { id: j.id },
            data: { status: "COMPLETED" },
        });
    }
}

describe("a business's own domain when its plan stops including one (DEC-139)", () => {
    it("is told ahead in the plan's own notice, shows the site for 3 days after the end, is paused, and comes back at once", async () => {
        const now = new Date();
        const end = new Date(now.getTime() + 7 * DAY - 60_000);
        const b = await business();
        await planUntil(b.organizationId, "b", end);
        // Another business with a domain, on a paid plan with no end.
        const other = await business();
        await planUntil(other.organizationId, "c", null);

        // Before the end: the day it stops is known and named.
        expect(await domains.stateOf(b.organizationId, now)).toEqual({
            state: "ending",
            endsAt: end,
            stopsAt: new Date(end.getTime() + 3 * DAY),
        });

        await sweep.sweep(now);
        const told = await notices(b.organizationId);
        // One notice: the plan's own, carrying the domain's line.
        expect(told).toHaveLength(1);
        expect(told[0].title).toMatch(/^Your Plan B plan ends on /);
        expect(told[0].body).toContain(
            `${b.hostname} stops showing your site on `,
        );
        expect(told[0].body).toContain(
            `visitors are sent to ${b.address}.${rendererHost()}`,
        );
        expect(await claims(b.organizationId, DOMAIN_TOLD_KIND)).toHaveLength(
            1,
        );
        await runMail();
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toEqual([b.ownerEmail]);
        expect(sent[0].html).toContain(
            `${b.hostname} stops showing your site on `,
        );

        // Its end: the domain still shows the site.
        const after = new Date(end.getTime() + 60_000);
        domains.forget();
        expect(await domains.paused(b.organizationId, after)).toBe(false);
        await sweep.sweep(after);
        // The clock starts at the end it was told about, with no second
        // notice about the domain.
        const clock = await claims(b.organizationId, DOMAIN_ENDED_KIND);
        expect(clock).toHaveLength(1);
        expect(clock[0].eventKey).toBe(DOMAIN_ENDED_KEY);
        expect(clock[0].createdAt).toEqual(end);
        expect(await notices(b.organizationId)).toHaveLength(1);

        // A moment short of 3 days: still showing. At 3 days: paused.
        const stops = new Date(end.getTime() + 3 * DAY);
        expect(
            await domains.stateOf(
                b.organizationId,
                new Date(stops.getTime() - 1),
            ),
        ).toMatchObject({ state: "grace", stopsAt: stops });
        expect(await domains.stateOf(b.organizationId, stops)).toEqual({
            state: "paused",
            since: stops,
        });
        domains.forget();
        expect(await domains.paused(b.organizationId, stops)).toBe(true);

        await sweep.sweep(stops);
        const all = await notices(b.organizationId);
        expect(all.map((n) => n.title)).toContain("Your domain is paused");
        expect(await claims(b.organizationId, DOMAIN_PAUSED_KIND)).toHaveLength(
            1,
        );
        // Told once.
        await sweep.sweep(new Date(stops.getTime() + 60 * 60 * 1000));
        expect(
            (await notices(b.organizationId)).filter(
                (n) => n.title === "Your domain is paused",
            ),
        ).toHaveLength(1);

        // Paused is a state, not a deletion: the connection is as it was.
        expect(
            await prisma.domain.findUniqueOrThrow({
                where: { id: b.domain.id },
            }),
        ).toMatchObject({
            status: "VERIFIED",
            siteId: b.site.id,
            hostingId: b.domain.hostingId,
            hostingStatus: "ACTIVE",
            verificationToken: b.domain.verificationToken,
            verifiedAt: b.domain.verifiedAt,
        });

        // The other business heard nothing and is not paused.
        expect(await notices(other.organizationId)).toEqual([]);
        expect(await domains.paused(other.organizationId, stops)).toBe(false);
        expect(
            await prisma.customerNotice.count({
                where: { organizationId: other.organizationId },
            }),
        ).toBe(0);

        // On a plan with a domain again: at once, nothing to reconnect.
        await planUntil(b.organizationId, "b", null);
        domains.forget();
        const later = new Date(stops.getTime() + DAY);
        expect(await domains.stateOf(b.organizationId, later)).toEqual({
            state: "included",
        });
        expect(await domains.paused(b.organizationId, later)).toBe(false);
        // The next sweep clears what the move left behind.
        await sweep.sweep(later);
        for (const kind of [
            DOMAIN_TOLD_KIND,
            DOMAIN_ENDED_KIND,
            DOMAIN_PAUSED_KIND,
        ]) {
            expect(await claims(b.organizationId, kind)).toEqual([]);
        }
    });

    it("a plan that ended at once is told within the hour, by email to the owner, and paused 3 days later", async () => {
        const now = new Date();
        // On Free with a domain connected: its paid plan has just gone.
        const b = await business();

        await sweep.sweep(now);
        const told = await notices(b.organizationId);
        expect(told).toHaveLength(1);
        expect(told[0].title).toMatch(
            /^Your domain stops showing your site on /,
        );
        expect(told[0].body).toContain(
            "Your plan no longer includes your own domain.",
        );
        await runMail();
        expect(sent).toHaveLength(1);
        expect(sent[0].to).toEqual([b.ownerEmail]);
        expect(sent[0].subject).toMatch(/domain stops showing its site on /);

        // The next hour says nothing more.
        await sweep.sweep(new Date(now.getTime() + 60 * 60 * 1000));
        expect(await notices(b.organizationId)).toHaveLength(1);

        // Not paused inside the 3 days.
        expect(
            await domains.stateOf(
                b.organizationId,
                new Date(now.getTime() + 3 * DAY - 1000),
            ),
        ).toMatchObject({ state: "grace" });

        // The 3 days are up (the clock, moved back, so the email's own
        // re-read at the real time agrees).
        await prisma.customerNotice.updateMany({
            where: {
                organizationId: b.organizationId,
                kind: DOMAIN_ENDED_KIND,
            },
            data: { createdAt: new Date(now.getTime() - 3 * DAY - 60_000) },
        });
        domains.forget();
        await sweep.sweep(new Date());
        expect((await notices(b.organizationId)).map((n) => n.title)).toContain(
            "Your domain is paused",
        );
        await runMail();
        expect(sent).toHaveLength(2);
        expect(sent[1].to).toEqual([b.ownerEmail]);
        expect(sent[1].subject).toBe(`Domain ${seq}'s domain is paused`);
        expect(sent[1].html).toContain(
            `visitors are sent to ${b.address}.${rendererHost()}`,
        );
    });

    it("an email queued before the business chose a plan again says nothing", async () => {
        const b = await business();
        await sweep.sweep(new Date());
        // Back on a paid plan before the worker runs the email.
        await planUntil(b.organizationId, "c", null);
        await runMail();
        expect(sent).toEqual([]);
    });

    it("changes nothing while plan enforcement is off", async () => {
        const offAccess = new CatalogueAccessService(off);
        const offDomains = new DomainPlanService(offAccess, off);
        const offSweep = new MovesApplyHandler(
            offAccess,
            new OverLimitService(offAccess, off),
            offDomains,
        );
        const now = new Date();
        const b = await business();
        // Even with a clock left from a time enforcement was on.
        await prisma.customerNotice.create({
            data: {
                organizationId: b.organizationId,
                eventKey: DOMAIN_ENDED_KEY,
                kind: DOMAIN_ENDED_KIND,
                createdAt: new Date(now.getTime() - 30 * DAY),
            },
        });

        expect(await offDomains.stateOf(b.organizationId, now)).toEqual({
            state: "included",
        });
        expect(await offDomains.paused(b.organizationId, now)).toBe(false);
        await offSweep.sweep(now);
        expect(await notices(b.organizationId)).toEqual([]);
        expect(
            await prisma.job.count({ where: { type: BILLING_EMAIL_TYPE } }),
        ).toBe(0);
        // The stale clock goes, so turning enforcement on starts afresh.
        expect(await claims(b.organizationId, DOMAIN_ENDED_KIND)).toEqual([]);
    });
});

describe("what the site reads say while a domain is paused (DEC-139)", () => {
    /** Plan enforcement for one business, as the real switch reads it. */
    async function enforce(organizationId: string, enabled: boolean) {
        await prisma.featureFlag.upsert({
            where: { key: FlagKey.PLAN_ENFORCEMENT },
            create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.upsert({
            where: {
                flagKey_organizationId: {
                    flagKey: FlagKey.PLAN_ENFORCEMENT,
                    organizationId,
                },
            },
            create: {
                flagKey: FlagKey.PLAN_ENFORCEMENT,
                organizationId,
                enabled,
            },
            update: { enabled },
        });
        domainPlan.forget();
    }

    async function pausedBusiness() {
        const b = await business();
        await prisma.customerNotice.create({
            data: {
                organizationId: b.organizationId,
                eventKey: DOMAIN_ENDED_KEY,
                kind: DOMAIN_ENDED_KIND,
                createdAt: new Date(Date.now() - 4 * DAY),
            },
        });
        await prisma.site.update({
            where: { id: b.site.id },
            data: { customDomainId: b.domain.id },
        });
        return b;
    }

    it("names the Saroh address on the domain's host, and as the site's address everywhere", async () => {
        const b = await pausedBusiness();
        await enforce(b.organizationId, true);
        const target = {
            organizationId: b.organizationId,
            siteId: b.site.id,
        };

        const refusal = await domainPausedHere(target);
        expect(refusal?.getStatus()).toBe(404);
        expect(refusal?.getResponse()).toMatchObject({
            details: {
                reason: DOMAIN_PAUSED_REASON,
                to: platformOrigin(b.address),
            },
        });
        expect(
            await primaryHostOf({
                id: b.site.id,
                organizationId: b.organizationId,
                subdomain: b.address,
            }),
        ).toBe(`${b.address}.${rendererHost()}`);

        // On a plan with a domain again: the domain, at once.
        await planUntil(b.organizationId, "c", null);
        domainPlan.forget();
        expect(await domainPausedHere(target)).toBeNull();
        expect(
            await primaryHostOf({
                id: b.site.id,
                organizationId: b.organizationId,
                subdomain: b.address,
            }),
        ).toBe(b.hostname);
    });

    it("says nothing while plan enforcement is off for the business", async () => {
        const b = await pausedBusiness();
        await enforce(b.organizationId, false);
        expect(
            await domainPausedHere({
                organizationId: b.organizationId,
                siteId: b.site.id,
            }),
        ).toBeNull();
        expect(
            await primaryHostOf({
                id: b.site.id,
                organizationId: b.organizationId,
                subdomain: b.address,
            }),
        ).toBe(b.hostname);
        // A site that was never published has no origin either way.
        expect(await siteOriginOf(b.organizationId)).toBeNull();
    });
});
