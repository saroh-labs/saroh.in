/**
 * A location's logo (DEC-123), with a mocked Prisma: which logo a read
 * says (own, the business's, none), and what a save writes — its own from
 * the library, back to the business's, the old address field left for an
 * older app. The library and the real columns are `location-logo.db.spec.ts`.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        store: { findUnique: jest.fn() },
        businessProfile: { findUnique: jest.fn() },
    },
}));

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { MediaService } from "../media/media.service";

import {
    legacyLogoPatch,
    locationLogos,
    LOGO_ADDRESS_GONE_MESSAGE,
} from "./location-logo";
import { LocationLogoService } from "./location-logo.service";
import type { StoresService } from "./stores.service";

const storeFindUnique = prisma.store.findUnique as jest.Mock;
const profileFindUnique = prisma.businessProfile.findUnique as jest.Mock;

const OWN = "https://media.saroh.test/org/org_1/business-logo/own.png";
const BUSINESS = "https://media.saroh.test/org/org_1/business-logo/rye.png";
const TYPED = "https://example.com/logo.png";

describe("locationLogos — own, then the business's, then none", () => {
    it("its own logo wins, and names its library image", () => {
        expect(
            locationLogos({ logo: OWN, logoMediaId: "media_1" }, BUSINESS),
        ).toEqual({
            ownLogo: { url: OWN, mediaId: "media_1" },
            businessLogo: { url: BUSINESS },
            effectiveLogo: { url: OWN, from: "location" },
        });
    });

    it("an address typed in before uploads is still its own, with no image", () => {
        const logos = locationLogos({ logo: TYPED, logoMediaId: null }, null);
        expect(logos.ownLogo).toEqual({ url: TYPED, mediaId: null });
        expect(logos.effectiveLogo).toEqual({ url: TYPED, from: "location" });
    });

    it("with none of its own it uses the business logo", () => {
        expect(
            locationLogos({ logo: null, logoMediaId: null }, BUSINESS),
        ).toEqual({
            ownLogo: null,
            businessLogo: { url: BUSINESS },
            effectiveLogo: { url: BUSINESS, from: "business" },
        });
    });

    it("with neither there is none", () => {
        expect(locationLogos({ logo: " ", logoMediaId: null }, null)).toEqual({
            ownLogo: null,
            businessLogo: null,
            effectiveLogo: null,
        });
    });
});

describe("legacyLogoPatch — the old address field", () => {
    const typed = { logo: TYPED, logoMediaId: null };
    const uploaded = { logo: OWN, logoMediaId: "media_1" };
    const none = { logo: null, logoMediaId: null };

    it("left out, or repeating what is stored, changes nothing", () => {
        expect(legacyLogoPatch(undefined, typed)).toBeNull();
        expect(legacyLogoPatch(TYPED, typed)).toBeNull();
        expect(legacyLogoPatch("", none)).toBeNull();
        expect(legacyLogoPatch(null, none)).toBeNull();
    });

    it("an empty one takes off a logo that was an address", () => {
        expect(legacyLogoPatch("", typed)).toEqual(none);
        expect(legacyLogoPatch(null, typed)).toEqual(none);
    });

    it("an empty one never takes off an uploaded logo", () => {
        expect(legacyLogoPatch("", uploaded)).toBeNull();
    });

    it("a new address is refused", () => {
        expect(legacyLogoPatch(TYPED, none)).toBe("refused");
        expect(legacyLogoPatch(TYPED, uploaded)).toBe("refused");
    });
});

describe("LocationLogoService", () => {
    const getForUser = jest.fn();
    const writableOrganization = jest.fn();
    const updateForUser = jest.fn();
    const readyObject = jest.fn();
    const service = new LocationLogoService(
        {
            getForUser,
            writableOrganization,
            updateForUser,
        } as unknown as StoresService,
        { readyObject } as unknown as MediaService,
    );
    const png = {
        id: "media_1",
        url: OWN,
        contentType: "image/png",
        sizeBytes: 40_000,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        writableOrganization.mockResolvedValue({ organizationId: "org_1" });
        updateForUser.mockResolvedValue({ id: "store_1" });
        readyObject.mockResolvedValue(png);
    });

    describe("read", () => {
        it("adds the logos to the location, reading its own business's logo", async () => {
            getForUser.mockResolvedValue({
                id: "store_1",
                name: "Hill Road",
                organizationId: "org_1",
                logo: null,
                logoMediaId: null,
            });
            profileFindUnique.mockResolvedValue({ logoUrl: BUSINESS });

            const read = await service.read("user_1", "store_1");

            expect(getForUser).toHaveBeenCalledWith("store_1", "user_1");
            expect(profileFindUnique).toHaveBeenCalledWith({
                where: { organizationId: "org_1" },
                select: { logoUrl: true },
            });
            expect(read).toMatchObject({
                id: "store_1",
                name: "Hill Road",
                ownLogo: null,
                businessLogo: { url: BUSINESS },
                effectiveLogo: { url: BUSINESS, from: "business" },
            });
        });

        it("a business with no profile yet has no logo to lend", async () => {
            getForUser.mockResolvedValue({
                id: "store_1",
                organizationId: "org_1",
                logo: null,
                logoMediaId: null,
            });
            profileFindUnique.mockResolvedValue(null);
            const read = await service.read("user_1", "store_1");
            expect(read.effectiveLogo).toBeNull();
        });

        it("someone the location isn't shown to gets its 404, and no logo is read", async () => {
            getForUser.mockRejectedValue(
                new NotFoundException("Location not found"),
            );
            await expect(
                service.read("user_2", "store_1"),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(profileFindUnique).not.toHaveBeenCalled();
        });
    });

    describe("update", () => {
        const dto = { name: "Hill Road", description: "Sourdough" };

        it("sets its own logo from the location's business's library", async () => {
            await service.update("user_1", "store_1", {
                ...dto,
                logoMediaId: "media_1",
            });
            expect(readyObject).toHaveBeenCalledWith("org_1", "media_1");
            expect(updateForUser).toHaveBeenCalledWith(
                "user_1",
                "store_1",
                expect.objectContaining({ name: "Hill Road" }),
                { logo: OWN, logoMediaId: "media_1" },
            );
        });

        it("null goes back to the business logo", async () => {
            await service.update("user_1", "store_1", {
                ...dto,
                logoMediaId: null,
            });
            expect(readyObject).not.toHaveBeenCalled();
            expect(updateForUser.mock.calls[0][3]).toEqual({
                logo: null,
                logoMediaId: null,
            });
        });

        it("a save that names no logo leaves it as it is", async () => {
            await service.update("user_1", "store_1", dto);
            expect(storeFindUnique).not.toHaveBeenCalled();
            expect(updateForUser.mock.calls[0][3]).toBeNull();
        });

        it("another business's image, or one still uploading, is a 404 and nothing is saved", async () => {
            readyObject.mockRejectedValue(
                new NotFoundException("That photo is not in your library"),
            );
            await expect(
                service.update("user_1", "store_1", {
                    ...dto,
                    logoMediaId: "media_theirs",
                }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(updateForUser).not.toHaveBeenCalled();
        });

        it.each([
            [
                "a type that is not a logo's",
                { ...png, contentType: "image/gif" },
                /PNG, JPG or WebP/,
            ],
            [
                "one over 1 MB",
                { ...png, sizeBytes: 1024 * 1024 + 1 },
                /under 1 MB/,
            ],
            [
                "one storage cannot serve",
                { ...png, url: null },
                /not set up to serve/,
            ],
        ])("refuses %s, naming the logo", async (_what, media, says) => {
            readyObject.mockResolvedValue(media);
            const refused = await service
                .update("user_1", "store_1", { ...dto, logoMediaId: "media_1" })
                .catch((e: unknown) => e);
            expect(refused).toBeInstanceOf(BadRequestException);
            expect((refused as BadRequestException).getResponse()).toEqual({
                message: expect.stringMatching(says),
                details: { field: "logo" },
            });
            expect(updateForUser).not.toHaveBeenCalled();
        });

        it("someone who may not change the location gets a 404 before the library is asked", async () => {
            writableOrganization.mockResolvedValue(null);
            await expect(
                service.update("user_2", "store_1", {
                    ...dto,
                    logoMediaId: "media_1",
                }),
            ).rejects.toBeInstanceOf(NotFoundException);
            expect(readyObject).not.toHaveBeenCalled();
            expect(updateForUser).not.toHaveBeenCalled();
        });

        it("an older app repeating the stored address keeps it", async () => {
            storeFindUnique.mockResolvedValue({
                logo: TYPED,
                logoMediaId: null,
            });
            await service.update("user_1", "store_1", { ...dto, logo: TYPED });
            expect(updateForUser.mock.calls[0][3]).toBeNull();
        });

        it("an older app's new address is refused, naming the logo", async () => {
            storeFindUnique.mockResolvedValue({
                logo: null,
                logoMediaId: null,
            });
            const refused = await service
                .update("user_1", "store_1", { ...dto, logo: TYPED })
                .catch((e: unknown) => e);
            expect((refused as BadRequestException).getResponse()).toEqual({
                message: LOGO_ADDRESS_GONE_MESSAGE,
                details: { field: "logo" },
            });
            expect(updateForUser).not.toHaveBeenCalled();
        });
    });
});
