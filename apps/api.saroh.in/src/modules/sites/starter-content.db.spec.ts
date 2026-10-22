/**
 * "Use this look with its starter content" (DEC-182), against a real
 * Postgres: the look set and its showcase template copied into the draft
 * with the gallery's sample words, in one transaction with a snapshot and
 * an Activity entry; Undo putting the previous draft back; Undo refused
 * once it has been used or the draft has moved on; a MEMBER refused; and a
 * paid look refused on a plan without "Themes, fonts and templates", with
 * nothing written.
 *
 * The catalogue is made up (`fakeMeteredCatalog`, every price zero). Runs
 * in the integration project (TEST_DATABASE_URL), plain and RLS.
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
    prisma,
    runInOrgContext,
    writeCatalogueVersion,
} from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { planRows } from "@saroh/pricing-catalog";
import { GYM_GALLERY_SAMPLE } from "@saroh/templates";

import { fakeMeteredCatalog } from "../../../test/fixtures/pricing-catalog";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FlagKey } from "../feature-flags/flags";
import { roleDenial } from "../organizations/organization-policy";
import {
    bringInSection,
    copyStarterContent,
    FILL_DETAILS,
    fillDetails,
    listDraftVersions,
    ROLLBACK,
    rollbackDraft,
    STARTER_CONTENT,
    undoStarterContent,
} from "./starter-content";

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const V = 1;

/** Made up, with no price; Classic is the only free look. */
function catalogue(): Catalog {
    return fakeMeteredCatalog((c) => {
        for (const p of c.plans) p.pricePaise = 0;
        c.freeStyles = { looks: [], fontPairs: [], colourways: [] };
    });
}

async function flagOn(key: string, organizationId: string) {
    await prisma.featureFlag.upsert({
        where: { key },
        create: { key, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: key, organizationId, enabled: true },
    });
}

const OWN_TEXT = "<p>Our own words about the gym.</p>";

/**
 * A business on `planId`, enforced, with looks on, and a site made by
 * hand: a home page with one text block of its own, and an About page.
 */
async function business(planId: "free" | "pro") {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: uniq("starter") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: `catalog.${planId}`,
                version: V,
                interval: "month",
            },
        },
    });
    await prisma.subscription.create({
        data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
    });
    await flagOn(FlagKey.PLAN_ENFORCEMENT, org.id);
    await flagOn(FlagKey.SITE_LOOKS, org.id);
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Pulse", slug: uniq("site") },
        select: { id: true },
    });
    const page = (path: string, isHome: boolean, title: string) =>
        prisma.page.create({
            data: {
                siteId: site.id,
                organizationId: org.id,
                path,
                title,
                isHome,
                versions: {
                    create: {
                        organizationId: org.id,
                        status: "DRAFT",
                        revision: 3,
                        sections: {
                            create: [
                                {
                                    organizationId: org.id,
                                    type: "richText",
                                    contractVersion: 1,
                                    order: 0,
                                    key: `own-${path}`,
                                    content: {
                                        format: "html",
                                        value: OWN_TEXT,
                                    },
                                },
                            ],
                        },
                    },
                },
            },
            select: { id: true },
        });
    const home = await page("/", true, "Welcome");
    const about = await page("/about", false, "About us");
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    return { owner, siteId: site.id, homeId: home.id, aboutId: about.id };
}

async function draftOf(pageId: string) {
    return prisma.pageVersion.findFirstOrThrow({
        where: { pageId, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
        select: {
            revision: true,
            sections: {
                orderBy: { order: "asc" },
                select: { key: true, type: true, content: true },
            },
        },
    });
}

async function styleOf(siteId: string) {
    const row = await prisma.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { style: true },
    });
    return row.style as { look?: string } | null;
}

/** As the API runs it: inside the business's RLS context. */
const asOrg = <T>(ctx: OrganizationContext, run: () => Promise<T>) =>
    runInOrgContext(ctx.organizationId, run);

beforeAll(async () => {
    const c = catalogue();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog: c,
        goLiveAt: new Date(Date.now() - 60 * 60 * 1000),
        policy: "keep",
        planRows: planRows(c, V),
    });
    await prisma.pricingProviderPlan.updateMany({
        data: { status: "SYNCED", syncedAt: new Date() },
    });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("starter content (DEC-182)", () => {
    it("sets the look and copies Live's Gym into the draft, sample words and all, leaving other pages alone", async () => {
        const { owner, siteId, homeId, aboutId } = await business("pro");
        const result = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live"),
        );

        expect(result.templateId).toBe("gym");
        expect(result.look).toBe("live");
        expect(result.replaced).toEqual(["Welcome"]);
        expect((await styleOf(siteId))?.look).toBe("live");

        const home = await draftOf(homeId);
        // Its revision moved on, so an open editor reloads (#285).
        expect(home.revision).toBe(4);
        const text = JSON.stringify(home.sections);
        expect(text).not.toContain("Our own words");
        expect(text).toContain(GYM_GALLERY_SAMPLE.coaches[0].name);
        // About is not the template's: untouched.
        const about = await draftOf(aboutId);
        expect(about.revision).toBe(3);
        expect(about.sections.map((s) => s.key)).toEqual(["own-/about"]);
        // The template's other pages are made.
        for (const title of result.created) {
            expect(await prisma.page.count({ where: { siteId, title } })).toBe(
                1,
            );
        }

        const snapshot = await prisma.siteDraftSnapshot.findUniqueOrThrow({
            where: { id: result.snapshotId },
        });
        expect(snapshot).toMatchObject({
            siteId,
            reason: STARTER_CONTENT,
            look: "live",
            undoneAt: null,
        });
        const activity = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                action: "site.starter_content.copied",
            },
        });
        expect(activity).toMatchObject({
            actorUserId: owner.userId,
            targetType: "site",
            targetId: siteId,
            outcome: "SUCCESS",
        });
        expect(activity.metadata).toMatchObject({
            template: "gym",
            look: "live",
            pagesReplaced: 1,
            pagesCreated: result.created.length,
        });
        // Counts only: never a line of the site's words.
        expect(JSON.stringify(activity.metadata)).not.toContain(
            GYM_GALLERY_SAMPLE.coaches[0].name,
        );
    });

    it("puts the previous draft back on Undo, once", async () => {
        const { owner, siteId, homeId } = await business("pro");
        const before = await draftOf(homeId);
        const pagesBefore = await prisma.page.count({ where: { siteId } });
        const { snapshotId } = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live"),
        );
        await asOrg(owner, () => undoStarterContent(owner, siteId, snapshotId));

        const home = await draftOf(homeId);
        expect(home.sections).toEqual(before.sections);
        expect(await prisma.page.count({ where: { siteId } })).toBe(
            pagesBefore,
        );
        expect(await styleOf(siteId)).toBeNull();
        expect(
            (
                await prisma.siteDraftSnapshot.findUniqueOrThrow({
                    where: { id: snapshotId },
                })
            ).undoneAt,
        ).not.toBeNull();
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: owner.organizationId,
                    action: "site.starter_content.undone",
                },
            }),
        ).toBe(1);

        const again = asOrg(owner, () =>
            undoStarterContent(owner, siteId, snapshotId),
        );
        await expect(again).rejects.toBeInstanceOf(ConflictException);
        // The app tells the two refusals apart by `details.code`.
        await expect(again).rejects.toMatchObject({
            response: { details: { code: "STARTER_UNDONE" } },
        });
    });

    it("refuses Undo once the draft has been saved over", async () => {
        const { owner, siteId, homeId } = await business("pro");
        const { snapshotId } = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live"),
        );
        await prisma.pageVersion.updateMany({
            where: { pageId: homeId, status: "DRAFT" },
            data: { revision: { increment: 1 } },
        });
        await expect(
            asOrg(owner, () => undoStarterContent(owner, siteId, snapshotId)),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "STARTER_CHANGED" } },
        });
        // Nothing was put back.
        expect(JSON.stringify((await draftOf(homeId)).sections)).toContain(
            GYM_GALLERY_SAMPLE.coaches[0].name,
        );
    });

    it("refuses Undo once the menu has been changed since", async () => {
        const { owner, siteId } = await business("pro");
        const { snapshotId } = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live"),
        );
        await prisma.site.update({
            where: { id: siteId },
            data: { navigation: { items: [] } },
        });
        await expect(
            asOrg(owner, () => undoStarterContent(owner, siteId, snapshotId)),
        ).rejects.toMatchObject({
            status: 409,
            response: { details: { code: "STARTER_CHANGED" } },
        });
    });

    it("refuses a MEMBER, and another business's Undo is not found", async () => {
        const { owner, siteId } = await business("pro");
        const member: OrganizationContext = { ...owner, role: "MEMBER" };
        await expect(
            asOrg(member, () => copyStarterContent(member, siteId, "live")),
        ).rejects.toMatchObject({ response: roleDenial("site:update") });

        const { snapshotId } = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live"),
        );
        const other = await business("pro");
        await expect(
            asOrg(other.owner, () =>
                undoStarterContent(other.owner, other.siteId, snapshotId),
            ),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            asOrg(member, () => undoStarterContent(member, siteId, snapshotId)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a paid look on a plan without themes, writing nothing, and lets Classic's Bakery in", async () => {
        const { owner, siteId, homeId } = await business("free");
        const before = await draftOf(homeId);
        const err = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "quiet"),
        ).then(
            () => null,
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ForbiddenException);
        expect(
            (
                (err as ForbiddenException).getResponse() as {
                    details: Record<string, unknown>;
                }
            ).details,
        ).toMatchObject({ code: "MODULE_LOCKED", moduleId: "themes" });
        expect(await draftOf(homeId)).toEqual(before);
        expect(await styleOf(siteId)).toBeNull();
        expect(
            await prisma.siteDraftSnapshot.count({ where: { siteId } }),
        ).toBe(0);

        const classic = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "classic"),
        );
        expect(classic.templateId).toBe("bakery");
        expect(classic.look).toBeNull();
        expect((await styleOf(siteId))?.look).toBeUndefined();
    });
});

/** Two coaches on the diary, the second without a title. */
async function staff(organizationId: string) {
    await prisma.staffMember.create({
        data: { organizationId, name: "Asha Rao", title: "Head coach" },
    });
    await prisma.staffMember.create({
        data: { organizationId, name: "Vikram" },
    });
}

describe("filling in the business's details (DEC-182, 22 Oct)", () => {
    it("fills the sample coaches with the business's staff as the starter copies, and says so", async () => {
        const { owner, siteId, homeId } = await business("pro");
        await staff(owner.organizationId);
        const result = await asOrg(owner, () =>
            copyStarterContent(owner, siteId, "live", true),
        );
        expect(result.filled).toEqual(["team"]);
        const text = JSON.stringify((await draftOf(homeId)).sections);
        expect(text).toContain("Asha Rao");
        expect(text).toContain("Vikram");
        expect(text).not.toContain(GYM_GALLERY_SAMPLE.coaches[0].name);
        // Past the staff, the sample coaches stay for the check to name.
        expect(text).toContain(GYM_GALLERY_SAMPLE.coaches[2].name);
    });

    it("brings the details in later, only over sample words, with an Undo", async () => {
        const { owner, siteId, homeId } = await business("pro");
        await asOrg(owner, () => copyStarterContent(owner, siteId, "live"));
        // Nothing to fill yet: nothing written.
        const none = await asOrg(owner, () => fillDetails(owner, siteId));
        expect(none).toEqual({ snapshotId: null, filled: [], pages: [] });

        await staff(owner.organizationId);
        const before = await draftOf(homeId);
        const done = await asOrg(owner, () => fillDetails(owner, siteId));
        expect(done.filled).toEqual(["team"]);
        expect(done.pages).toContain("Welcome");
        const home = await draftOf(homeId);
        expect(home.revision).toBe(before.revision + 1);
        // Keys kept: notes still find their sections.
        expect(home.sections.map((s) => s.key)).toEqual(
            before.sections.map((s) => s.key),
        );
        expect(JSON.stringify(home.sections)).toContain("Asha Rao");
        expect(
            await prisma.siteDraftSnapshot.count({
                where: { siteId, reason: FILL_DETAILS },
            }),
        ).toBe(1);

        // A second time finds nothing left it may fill.
        const again = await asOrg(owner, () => fillDetails(owner, siteId));
        expect(again.snapshotId).toBeNull();

        await asOrg(owner, () =>
            undoStarterContent(owner, siteId, done.snapshotId ?? ""),
        );
        expect((await draftOf(homeId)).sections).toEqual(before.sections);
    });

    it("refuses a MEMBER", async () => {
        const { owner, siteId } = await business("pro");
        const member: OrganizationContext = { ...owner, role: "MEMBER" };
        await expect(
            asOrg(member, () => fillDetails(member, siteId)),
        ).rejects.toMatchObject({ response: roleDenial("site:update") });
    });
});

describe("previous versions of the draft (DEC-182, 22 Oct)", () => {
    it("lists the draft before the starter copy, and rolls back to it even after later saves, with its own Undo", async () => {
        const { owner, siteId, homeId } = await business("pro");
        const original = await draftOf(homeId);
        await asOrg(owner, () => copyStarterContent(owner, siteId, "live"));
        // Saved over since: Undo would refuse, a roll back still works.
        await prisma.pageVersion.updateMany({
            where: { pageId: homeId, status: "DRAFT" },
            data: { revision: { increment: 1 } },
        });

        const versions = await asOrg(owner, () =>
            listDraftVersions(owner, siteId),
        );
        expect(versions).toHaveLength(1);
        expect(versions[0]).toMatchObject({
            reason: STARTER_CONTENT,
            look: null,
            pages: [
                {
                    pageId: homeId,
                    title: "Welcome",
                    sections: [{ key: "own-/", type: "richText" }],
                },
            ],
        });

        const copied = await draftOf(homeId);
        const back = await asOrg(owner, () =>
            rollbackDraft(owner, siteId, versions[0]?.id ?? ""),
        );
        expect(back.restored).toBe(1);
        const home = await draftOf(homeId);
        expect(home.sections).toEqual(original.sections);
        expect(await styleOf(siteId)).toBeNull();

        // The draft before the roll back is a version of its own, newest.
        const after = await asOrg(owner, () =>
            listDraftVersions(owner, siteId),
        );
        expect(after.map((v) => v.reason)).toEqual([ROLLBACK, STARTER_CONTENT]);
        await asOrg(owner, () =>
            undoStarterContent(owner, siteId, back.snapshotId),
        );
        expect((await draftOf(homeId)).sections).toEqual(copied.sections);
        expect((await styleOf(siteId))?.look).toBe("live");
    });

    it("brings one section of a previous version into the draft, under a new key", async () => {
        const { owner, siteId, homeId } = await business("pro");
        await asOrg(owner, () => copyStarterContent(owner, siteId, "live"));
        const [version] = await asOrg(owner, () =>
            listDraftVersions(owner, siteId),
        );
        const before = await draftOf(homeId);
        const brought = await asOrg(owner, () =>
            bringInSection(owner, siteId, version?.id ?? "", homeId, "own-/"),
        );
        expect(brought).toMatchObject({ pageId: homeId, title: "Welcome" });
        const home = await draftOf(homeId);
        expect(home.sections).toHaveLength(before.sections.length + 1);
        const last = home.sections.at(-1);
        expect(JSON.stringify(last?.content)).toContain("Our own words");
        expect(last?.key).not.toBe("own-/");

        await expect(
            asOrg(owner, () =>
                bringInSection(
                    owner,
                    siteId,
                    version?.id ?? "",
                    homeId,
                    "nope",
                ),
            ),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("never shows or restores another business's versions", async () => {
        const { owner, siteId } = await business("pro");
        await asOrg(owner, () => copyStarterContent(owner, siteId, "live"));
        const [version] = await asOrg(owner, () =>
            listDraftVersions(owner, siteId),
        );
        const other = await business("pro");
        expect(
            await asOrg(other.owner, () =>
                listDraftVersions(other.owner, other.siteId),
            ),
        ).toEqual([]);
        await expect(
            asOrg(other.owner, () =>
                rollbackDraft(other.owner, other.siteId, version?.id ?? ""),
            ),
        ).rejects.toMatchObject({ status: 404 });
        const member: OrganizationContext = { ...owner, role: "MEMBER" };
        await expect(
            asOrg(member, () => listDraftVersions(member, siteId)),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
