/**
 * Account ↔ contact linking and "This isn't them" against a real Postgres
 * (round-2 plan A, A4; DEC-049). Who a first sign-in becomes, what staff see
 * on Customer Detail, the pair C2's suggestions show, and what unlinking
 * moves, clears and remembers. Runs in the integration project
 * (TEST_DATABASE_URL). The sign-in route around `linkOrCreate` (the P2002
 * retry, the merged and blocked answers over HTTP) is A2's
 * `sign-in.controller.db.spec.ts`.
 */
import { randomBytes } from "node:crypto";

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { isReservedContactEmail } from "../contacts/contact-email";
import { CustomerDetailService } from "../customer-workspace/customer-detail.service";
import { CustomerWorkspaceService } from "../customer-workspace/customer-workspace.service";
import { AccountLinkingService } from "./account-linking.service";
import { AccountUnlinkService } from "./account-unlink.service";
import { CustomerAccountRepository } from "./customer-account.repository";
import type { UnlinkMover } from "./unlink-plan";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => `${tag}-${++seq}`;
const email = () => `person-${next()}@example.in`;

const availability = {
    listViews: jest.fn().mockResolvedValue(
        ["CRM", "COMMERCE", "APPOINTMENTS", "PAYMENTS"].map((key) => ({
            key,
            readiness: "ACTIVE",
        })),
    ),
} as unknown as ModuleAvailabilityService;

const repo = new CustomerAccountRepository();
const linking = new AccountLinkingService(repo);
const unlinking = new AccountUnlinkService();
const details = new CustomerDetailService(availability);
const workspace = new CustomerWorkspaceService(availability);

let ownerId = "";

async function business(): Promise<{
    ctx: OrganizationContext;
    siteId: string;
}> {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `a4-${next()}` },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Kavi",
            slug: `a4-site-${next()}`,
        },
    });
    return {
        ctx: { organizationId: org.id, userId: ownerId, role: "OWNER" },
        siteId: site.id,
    };
}

function signIn(organizationId: string, who: string, now = new Date()) {
    return prisma.$transaction((tx) =>
        linking.linkOrCreate(tx, organizationId, who, now),
    );
}

async function signedIn(organizationId: string, who: string, now?: Date) {
    const identity = await signIn(organizationId, who, now);
    if (identity.kind !== "signed-in") throw new Error(identity.kind);
    return identity.account;
}

function session(organizationId: string, accountId: string, siteId: string) {
    return prisma.customerSession.create({
        data: {
            organizationId,
            accountId,
            siteId,
            tokenHash: randomBytes(32).toString("hex"),
            expiresAt: new Date(Date.now() + 86_400_000),
        },
    });
}

async function contactSuggestions(ctx: OrganizationContext, contactId: string) {
    const all = await workspace.suggestLinks(ctx, contactId, {
        includeContacts: true,
    });
    return all
        .filter((s) => s.kind === "contact")
        .map((s) => ("contactId" in s ? s.contactId : null));
}

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `a4-owner-${tag}@example.com` },
        })
    ).id;
});

describe("who a first sign-in is (DEC-049)", () => {
    it("links to Farah when her email is verified, restamps it, and shows the badge", async () => {
        const { ctx } = await business();
        const who = email();
        const earlier = new Date("2026-09-01T00:00:00Z");
        const farah = await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: who,
                firstName: "Farah",
                emailVerifiedAt: earlier,
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        const now = new Date("2026-09-27T09:00:00Z");

        const account = await signedIn(ctx.organizationId, who, now);

        expect(account.contactId).toBe(farah.id);
        const after = await prisma.contact.findUniqueOrThrow({
            where: { id: farah.id },
        });
        expect(after.emailVerifiedAt).toEqual(now);
        expect(after.emailVerifiedVia).toBe("SIGN_IN_CODE");

        const detail = await details.detail(ctx, farah.id);
        expect(detail.siteAccount).toEqual(
            expect.objectContaining({
                email: who,
                status: "ACTIVE",
                canUnlink: true,
            }),
        );
        expect(detail.contact.name).toBe("Farah");
    });

    it("makes a new contact with the real email, stamped verified, when nobody holds it", async () => {
        const { ctx } = await business();
        const who = email();

        const account = await signedIn(ctx.organizationId, who);

        const contact = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(contact.email).toBe(who);
        expect(contact.source).toBe("site-account");
        expect(contact.emailVerifiedVia).toBe("SIGN_IN_CODE");
        expect(contact.emailVerifiedAt).not.toBeNull();
        const detail = await details.detail(ctx, contact.id);
        expect(detail.siteAccount?.email).toBe(who);
        // The sign-in made this record: there is nobody to part it from.
        expect(detail.siteAccount?.canUnlink).toBe(false);
    });

    it("keeps an unverified Farah apart: a separate contact, the pair suggested, nothing of hers reachable", async () => {
        const { ctx } = await business();
        const who = email();
        const farah = await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: who,
                firstName: "Farah",
            },
        });
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: farah.id,
                body: "Prefers mornings",
            },
        });

        const account = await signedIn(ctx.organizationId, who);

        expect(account.contactId).not.toBe(farah.id);
        const separate = await prisma.contact.findUniqueOrThrow({
            where: { id: account.contactId },
        });
        expect(isReservedContactEmail(separate.email)).toBe(true);
        expect(separate.firstName).toBeNull();
        expect(separate.emailVerifiedAt).toBeNull();

        const unchanged = await prisma.contact.findUniqueOrThrow({
            where: { id: farah.id },
        });
        expect(unchanged.email).toBe(who);
        expect(unchanged.emailVerifiedAt).toBeNull();
        expect(unchanged.firstName).toBe("Farah");

        // The pair shows from either side (C2 pairs the account's email).
        expect(await contactSuggestions(ctx, separate.id)).toContain(farah.id);
        expect(await contactSuggestions(ctx, farah.id)).toContain(separate.id);

        // Customer Detail shows the account's email, never the placeholder,
        // and nothing of Farah's (her note) is on the account's contact.
        const detail = await details.detail(ctx, separate.id);
        expect(detail.contact.email).toBe(who);
        expect(detail.notes?.rows).toEqual([]);
        expect(JSON.stringify(detail)).not.toContain("account.invalid");
        expect(detail.siteAccount?.canUnlink).toBe(false);
    });

    it("makes a separate contact when the one holding the email already has an account under another email", async () => {
        const { ctx } = await business();
        const who = email();
        const farah = await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: who,
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "SIGN_IN_CODE",
            },
        });
        await repo.create({
            organizationId: ctx.organizationId,
            contactId: farah.id,
            email: email(),
            verifiedAt: new Date(),
        });

        const account = await signedIn(ctx.organizationId, who);

        expect(account.contactId).not.toBe(farah.id);
        const accounts = await prisma.customerAccount.count({
            where: { contactId: farah.id },
        });
        expect(accounts).toBe(1); // never joined by matching
        expect(await contactSuggestions(ctx, account.contactId)).toContain(
            farah.id,
        );
    });

    it("answers a merge-retired email with the survivor, masked, and makes nothing", async () => {
        const { ctx } = await business();
        const survivorEmail = `farah-${next()}@example.in`;
        const retiredEmail = email();
        const a = await prisma.contact.create({
            data: { organizationId: ctx.organizationId, email: survivorEmail },
        });
        const b = await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: `merged+x${next()}@removed.invalid`,
            },
        });
        const survivor = await repo.create({
            organizationId: ctx.organizationId,
            contactId: a.id,
            email: survivorEmail,
            verifiedAt: new Date(),
        });
        const retired = await repo.create({
            organizationId: ctx.organizationId,
            contactId: b.id,
            email: retiredEmail,
            verifiedAt: new Date(),
        });
        await prisma.customerAccount.update({
            where: { id: retired.id },
            data: { status: "MERGED", mergedIntoId: survivor.id },
        });
        const contactsBefore = await prisma.contact.count({
            where: { organizationId: ctx.organizationId },
        });

        const identity = await signIn(ctx.organizationId, retiredEmail);

        expect(identity).toEqual({
            kind: "merged",
            maskedEmail: `f…@example.in`,
        });
        expect(
            await prisma.contact.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(contactsBefore);
    });

    it("opens nothing for a blocked account", async () => {
        const { ctx } = await business();
        const who = email();
        const account = await signedIn(ctx.organizationId, who);
        await prisma.customerAccount.update({
            where: { id: account.id },
            data: { status: "BLOCKED" },
        });

        expect(await signIn(ctx.organizationId, who)).toEqual({
            kind: "blocked",
        });
    });
});

describe("This isn't them (A4)", () => {
    async function linkedFarah() {
        const { ctx, siteId } = await business();
        const who = email();
        const farah = await prisma.contact.create({
            data: {
                organizationId: ctx.organizationId,
                email: who,
                firstName: "Farah",
                emailVerifiedAt: new Date(),
                emailVerifiedVia: "BOOKING_CONFIRMATION",
            },
        });
        const account = await signedIn(ctx.organizationId, who);
        expect(account.contactId).toBe(farah.id);
        return { ctx, siteId, who, farah, account };
    }

    it("previews the account's email and says nothing moves yet", async () => {
        const { ctx, who, farah } = await linkedFarah();

        expect(await unlinking.preview(ctx, farah.id)).toEqual({
            email: who,
            moves: [],
            sentence:
                "Nothing they did online is on this record, so everything here stays.",
        });
    });

    it("moves the account to a new separate contact, ends its sessions, clears Farah's stamp and never pairs them again", async () => {
        const { ctx, siteId, who, farah, account } = await linkedFarah();
        const live = await session(ctx.organizationId, account.id, siteId);
        const now = new Date("2026-09-27T12:00:00Z");

        const result = await unlinking.unlink(ctx, farah.id, now);

        const moved = await prisma.customerAccount.findUniqueOrThrow({
            where: { id: account.id },
            include: { contact: true },
        });
        expect(moved.contactId).toBe(result.contactId);
        expect(moved.contactId).not.toBe(farah.id);
        expect(moved.email).toBe(who);
        expect(moved.unlinkedFromContactId).toBe(farah.id);
        expect(moved.linkedAt).toEqual(now);
        expect(isReservedContactEmail(moved.contact.email)).toBe(true);
        expect(moved.contact.source).toBe("site-account");

        const s = await prisma.customerSession.findUniqueOrThrow({
            where: { id: live.id },
        });
        expect(s.revokedAt).toEqual(now);

        const after = await prisma.contact.findUniqueOrThrow({
            where: { id: farah.id },
        });
        expect(after.emailVerifiedAt).toBeNull();
        expect(after.emailVerifiedVia).toBeNull();
        expect(after.email).toBe(who);

        // Suggestions never pair the two again, from either side.
        expect(await contactSuggestions(ctx, result.contactId)).not.toContain(
            farah.id,
        );
        expect(await contactSuggestions(ctx, farah.id)).not.toContain(
            result.contactId,
        );

        // Farah's page loses the badge; the new contact shows the account.
        expect((await details.detail(ctx, farah.id)).siteAccount).toBeNull();
        const theirs = await details.detail(ctx, result.contactId);
        expect(theirs.contact.email).toBe(who);
        expect(theirs.siteAccount?.canUnlink).toBe(false);

        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                organizationId: ctx.organizationId,
                action: "customer.account.unlink",
            },
        });
        expect(audit).toEqual(
            expect.objectContaining({
                actorUserId: ownerId,
                targetId: farah.id,
                outcome: "SUCCESS",
            }),
        );
        expect(JSON.stringify(audit.metadata)).not.toContain(who);
    });

    it("signs the customer back in to the moved account, not Farah", async () => {
        const { ctx, who, farah } = await linkedFarah();
        const { contactId } = await unlinking.unlink(ctx, farah.id);

        const again = await signedIn(ctx.organizationId, who);

        expect(again.contactId).toBe(contactId);
    });

    it("moves what a mover names, in the same transaction, and names it in the preview", async () => {
        const { ctx, farah, account } = await linkedFarah();
        // Staff wrote one note before the link; "the customer" one after.
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: farah.id,
                body: "Staff note",
                createdAt: new Date(account.linkedAt.getTime() - 60_000),
            },
        });
        await prisma.contactNote.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: farah.id,
                body: "Made online",
                createdAt: new Date(account.linkedAt.getTime() + 60_000),
            },
        });
        // A stand-in for A9's booking mover, over a table that exists today.
        const notes: UnlinkMover = {
            key: "notes",
            model: "ContactNote",
            noun: ["note", "notes"],
            count: (tx, s) =>
                tx.contactNote.count({
                    where: {
                        organizationId: s.organizationId,
                        contactId: s.fromContactId,
                        createdAt: { gte: s.since },
                    },
                }),
            move: async (tx, s) =>
                (
                    await tx.contactNote.updateMany({
                        where: {
                            organizationId: s.organizationId,
                            contactId: s.fromContactId,
                            createdAt: { gte: s.since },
                        },
                        data: { contactId: s.toContactId },
                    })
                ).count,
        };
        const withNotes = new AccountUnlinkService(prisma, [notes]);

        const preview = await withNotes.preview(ctx, farah.id);
        expect(preview.sentence).toBe(
            "1 note they made online move with them.",
        );
        const result = await withNotes.unlink(ctx, farah.id);

        expect(result.moves).toEqual([
            { key: "notes", count: 1, label: "1 note" },
        ]);
        const left = await prisma.contactNote.findMany({
            where: { contactId: farah.id },
        });
        expect(left.map((n) => n.body)).toEqual(["Staff note"]);
        const went = await prisma.contactNote.findMany({
            where: { contactId: result.contactId },
        });
        expect(went.map((n) => n.body)).toEqual(["Made online"]);
    });

    it("is a 404 from another business, and for a contact that doesn't sign in", async () => {
        const { farah } = await linkedFarah();
        const other = await business();

        await expect(
            unlinking.unlink(other.ctx, farah.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        const plain = await prisma.contact.create({
            data: { organizationId: other.ctx.organizationId, email: email() },
        });
        await expect(
            unlinking.preview(other.ctx, plain.id),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a Member, who can't edit customers (403)", async () => {
        const { ctx, farah } = await linkedFarah();

        await expect(
            unlinking.unlink({ ...ctx, role: "MEMBER" }, farah.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
        const still = await prisma.customerAccount.findFirstOrThrow({
            where: { organizationId: ctx.organizationId },
        });
        expect(still.contactId).toBe(farah.id);
    });

    it("refuses on a contact the sign-in made for itself (409)", async () => {
        const { ctx } = await business();
        const account = await signedIn(ctx.organizationId, email());

        await expect(
            unlinking.unlink(ctx, account.contactId),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
