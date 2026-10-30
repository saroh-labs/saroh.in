/**
 * What a Reviewer's editor reads about their own review (DEC-200, U4),
 * against a real Postgres: who asked and when, their own latest verdict,
 * how many of their notes were settled since they last spoke, and which
 * notes are theirs.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;
/**
 * Each write's time, said explicitly rather than slept for: an hour ago and
 * a second apart, so "after" never rests on two writes landing in
 * different milliseconds.
 */
let clock = Date.now() - 3_600_000;
const at = () => new Date((clock += 1_000));

/** A one-page site, its owner Asha and Meera, a reviewer invited to it. */
async function business() {
    const org = await prisma.organization.create({
        data: { name: "Northwind U4", slug: uniq("u4-org-") },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("u4-owner-")}@example.com`, name: "Asha" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Northwind", slug: uniq("u4-") },
    });
    const home = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const reviewer = await prisma.user.create({
        data: { email: `${uniq("u4-reviewer-")}@example.com`, name: "Meera" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: reviewer.id, role: "REVIEWER" },
    });
    await prisma.siteReviewer.create({
        data: { organizationId: org.id, siteId: site.id, userId: reviewer.id },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    const reviewerCtx: OrganizationContext = {
        organizationId: org.id,
        userId: reviewer.id,
        role: "REVIEWER",
    };
    return { org, site, home, ctx, reviewerCtx };
}

type Business = Awaited<ReturnType<typeof business>>;

const state = (b: Business, ctx = b.reviewerCtx) =>
    sites.getReviewState(ctx, b.site.id);

async function verdict(b: Business, by: OrganizationContext, outcome: string) {
    await prisma.siteApproval.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            byUserId: by.userId,
            outcome,
            reason: outcome === "CHANGES_REQUESTED" ? "Fix the hours" : null,
            createdAt: at(),
        },
    });
}

async function note(b: Business, by: OrganizationContext, body: string) {
    const row = await prisma.siteComment.create({
        data: {
            siteId: b.site.id,
            organizationId: b.org.id,
            pageId: b.home.id,
            sectionKey: "hero",
            authorUserId: by.userId,
            body,
            createdAt: at(),
        },
    });
    return row;
}

async function settle(b: Business, id: string) {
    await prisma.siteComment.update({
        where: { id },
        data: { resolvedAt: at(), resolvedByUserId: b.ctx.userId },
    });
}

describe("a Reviewer's own review state (DEC-200, U4)", () => {
    it("names who asked, and nobody before anyone has", async () => {
        const b = await business();
        expect((await state(b)).request).toBeNull();
        await verdict(b, b.ctx, "REQUESTED");
        const s = await state(b);
        expect(s.request?.by).toBe("Asha");
        expect(s.request?.at).toBeInstanceOf(Date);
        expect(s.pending).toBe(true);
    });

    it("a Reviewer's own approval settles the request, for them as for the owner", async () => {
        const b = await business();
        await sites.requestReview(b.ctx, b.site.id);
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "CHANGES_REQUESTED",
            reason: "Fix the hours",
        });
        await sites.createApproval(b.reviewerCtx, b.site.id, {
            outcome: "APPROVED",
        });
        // They can't publish, so their approval is not "their own work":
        // the editor shows them Change your review, not the choice again.
        expect(await state(b)).toMatchObject({
            pending: false,
            outstanding: false,
            yourVerdict: { outcome: "APPROVED" },
        });
        expect(await state(b, b.ctx)).toMatchObject({
            pending: false,
            outstanding: false,
        });
    });

    it("keeps the reviewer's own latest verdict, not someone else's", async () => {
        const b = await business();
        await verdict(b, b.ctx, "REQUESTED");
        expect((await state(b)).yourVerdict).toBeNull();
        await verdict(b, b.reviewerCtx, "CHANGES_REQUESTED");
        await verdict(b, b.reviewerCtx, "APPROVED");
        expect((await state(b)).yourVerdict?.outcome).toBe("APPROVED");
        expect((await state(b, b.ctx)).yourVerdict).toBeNull();
    });

    it("counts notes settled since the reviewer last spoke, and drops them when they speak again", async () => {
        const b = await business();
        const one = await note(b, b.reviewerCtx, "Say the Saturday cut-off");
        const two = await note(b, b.reviewerCtx, "Browse reads like a shop");
        await verdict(b, b.reviewerCtx, "CHANGES_REQUESTED");
        expect((await state(b)).settledForYou).toBeNull();

        await settle(b, one.id);
        await settle(b, two.id);
        const s = await state(b);
        expect(s.settledForYou?.count).toBe(2);
        expect(s.settledForYou?.at).toBeInstanceOf(Date);
        // The owner settles notes; it isn't news to them.
        expect((await state(b, b.ctx)).settledForYou).toBeNull();

        // A new note is the reviewer looking again.
        await note(b, b.reviewerCtx, "One more thing");
        expect((await state(b)).settledForYou).toBeNull();
    });

    it("doesn't count a settle that came before the reviewer's verdict", async () => {
        const b = await business();
        const one = await note(b, b.reviewerCtx, "Say the Saturday cut-off");
        await settle(b, one.id);
        await verdict(b, b.reviewerCtx, "APPROVED");
        expect((await state(b)).settledForYou).toBeNull();
    });

    it("marks the caller's own notes as theirs", async () => {
        const b = await business();
        await note(b, b.reviewerCtx, "Mine");
        await note(b, b.ctx, "The owner's");
        const notes = await sites.listComments(b.reviewerCtx, b.site.id);
        expect(Object.fromEntries(notes.map((n) => [n.body, n.mine]))).toEqual({
            Mine: true,
            "The owner's": false,
        });
    });
});
