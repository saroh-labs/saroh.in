/**
 * A team member's photo and "About them" against a real Postgres (23 Nov
 * 2026): the person sets their own; an owner or admin sets it for them and
 * the person is told once, in their own alerts and nobody else's; someone
 * else is refused; a photo from another business is not found; taking the
 * photo's library image away leaves the person without one.
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { MediaService } from "../media/media.service";
import { StaffService } from "./staff.service";

const tag = `${process.pid}-${Date.now()}`;

/** The library, as far as a profile reads it: READY images by business. */
const library = new Map<string, string>();
const media = {
    readyObject: async (organizationId: string, id: string) => {
        if (library.get(id) !== organizationId) throw new NotFoundException();
        return {
            id,
            url: `https://m.example/${id}.webp`,
            contentType: "image/webp",
        };
    },
    urlOf: () => "https://m.example/x.webp",
} as unknown as MediaService;
const staff = new StaffService(media);

let orgId = "";
let owner: OrganizationContext;
let asha: OrganizationContext;
let farah: OrganizationContext;
let ashaStaff = "";
let photoId = "";
let otherPhotoId = "";

async function onDiary(name: string) {
    const user = await prisma.user.create({
        data: { email: `profile-${name}-${tag}@example.com`, name },
    });
    const membership = await prisma.membership.create({
        data: { organizationId: orgId, userId: user.id, role: "MEMBER" },
    });
    const person = await prisma.staffMember.create({
        data: { organizationId: orgId, name, membershipId: membership.id },
    });
    return { userId: user.id, staffId: person.id };
}

async function mediaRow(organizationId: string, key: string) {
    const m = await prisma.media.create({
        data: {
            organizationId,
            key: `${key}-${tag}`,
            contentType: "image/webp",
            sizeBytes: 10,
            filename: "a.webp",
            purpose: "staff-photo",
            status: "READY",
        },
    });
    library.set(m.id, organizationId);
    return m.id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Northwind", slug: `profile-${tag}` },
    });
    orgId = org.id;
    const other = await prisma.organization.create({
        data: { name: "Elsewhere", slug: `profile-other-${tag}` },
    });
    const ownerUser = await prisma.user.create({
        data: { email: `profile-owner-${tag}@example.com`, name: "Kiran" },
    });
    owner = { organizationId: orgId, userId: ownerUser.id, role: "OWNER" };
    const a = await onDiary("Asha");
    ashaStaff = a.staffId;
    asha = { organizationId: orgId, userId: a.userId, role: "MEMBER" };
    const f = await onDiary("Farah");
    farah = { organizationId: orgId, userId: f.userId, role: "MEMBER" };
    photoId = await mediaRow(orgId, "photo");
    otherPhotoId = await mediaRow(other.id, "other");
});

const notices = (userId: string) =>
    prisma.notification.findMany({
        where: { organizationId: orgId, userId, type: "staff.photo" },
    });

describe("a team member's photo and About them", () => {
    it("lets the person set their own, and nobody is told", async () => {
        const view = await staff.updateProfile(asha, ashaStaff, {
            photoMediaId: photoId,
            about: "Ten years on the dock.",
        });
        expect(view.photo?.id).toBe(photoId);
        expect(view.about).toBe("Ten years on the dock.");
        expect(await notices(asha.userId)).toHaveLength(0);
    });

    it("tells the person once when an owner changes it, in their alerts only", async () => {
        const second = await mediaRow(orgId, "photo2");
        await staff.updateProfile(owner, ashaStaff, { photoMediaId: second });
        const told = await notices(asha.userId);
        expect(told).toHaveLength(1);
        expect(told[0]?.body).toContain("Kiran set your photo");
        expect(await notices(farah.userId)).toHaveLength(0);
        // The same photo again is no change: nobody is told twice.
        await staff.updateProfile(owner, ashaStaff, { photoMediaId: second });
        expect(await notices(asha.userId)).toHaveLength(1);
    });

    it("refuses another member, and a photo from another business", async () => {
        await expect(
            staff.updateProfile(farah, ashaStaff, { about: "Hi" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            staff.updateProfile(owner, ashaStaff, {
                photoMediaId: otherPhotoId,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("clears both with null, and the person has no photo again", async () => {
        const view = await staff.updateProfile(asha, ashaStaff, {
            photoMediaId: null,
            about: null,
        });
        expect(view).toMatchObject({ photo: null, about: null });
    });

    it("loses the photo, not the person, when its library image is deleted", async () => {
        await staff.updateProfile(asha, ashaStaff, { photoMediaId: photoId });
        await prisma.media.delete({ where: { id: photoId } });
        const row = await prisma.staffMember.findUniqueOrThrow({
            where: { id: ashaStaff },
        });
        expect(row.photoMediaId).toBeNull();
    });

    it("reads a person's own place on the diary, and null for someone not on it", async () => {
        expect((await staff.mine(asha))?.id).toBe(ashaStaff);
        expect(await staff.mine(owner)).toBeNull();
    });
});
