/**
 * A billing profile's country (stage 9, U4, KTD7) against a real Postgres:
 * India's rules (GSTIN, GST state, six-digit PIN) stay India's; a payer
 * abroad saves a free postcode and a tax number; and a business pays only
 * through a profile of its own edition. Made-up people and addresses.
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { BillingProfilesService } from "./billing-profiles.service";
import { PROFILE_OTHER_EDITION, profileMoveInTx } from "./profile-switch";

const tag = `${process.pid}-${Date.now()}`;
const profiles = new BillingProfilesService();

let n = 0;
async function user() {
    n += 1;
    return prisma.user.create({
        data: { email: `bpc-${n}-${tag}@example.com`, name: `P ${n}` },
    });
}

const UK = {
    legalName: "Rye Bakes Ltd",
    billingEmail: "accounts@example.com",
    country: "gb",
    addressLine1: "10 Downing Street",
    city: "London",
    postalCode: "SW1A 1AA",
    taxId: "GB123456789",
    phone: "+44 20 7123 4567",
};

const refusalOf = async (p: Promise<unknown>) =>
    p.then(
        () => null,
        (e: { getResponse?: () => { details?: unknown } }) =>
            e.getResponse?.()?.details,
    );

describe("billing profile country (DB, stage 9 U4)", () => {
    it("saves a UK profile with a free postcode and its tax number", async () => {
        const me = await user();
        const made = await profiles.create(me.id, UK);
        expect(made).toMatchObject({
            country: "GB",
            postalCode: "SW1A 1AA",
            taxId: "GB123456789",
            gstin: null,
            gstState: null,
            phone: "+442071234567",
        });
    });

    it("refuses a GSTIN, a GST state or a phone without + outside India", async () => {
        const me = await user();
        expect(
            await refusalOf(
                profiles.create(me.id, { ...UK, gstin: "29ABCDE1234F1Z5" }),
            ),
        ).toMatchObject({ field: "gstin" });
        expect(
            await refusalOf(profiles.create(me.id, { ...UK, gstState: "29" })),
        ).toMatchObject({ field: "gstState" });
        expect(
            await refusalOf(
                profiles.create(me.id, { ...UK, phone: "2071234567" }),
            ),
        ).toMatchObject({ field: "phone" });
    });

    it("keeps India's rules for a profile with no country", async () => {
        const me = await user();
        const made = await profiles.create(me.id, {
            legalName: "Rye Bakes LLP",
            billingEmail: "in@example.com",
            postalCode: "560038",
            gstState: "29",
        });
        expect(made.country).toBe("IN");
        expect(
            await refusalOf(
                profiles.create(me.id, {
                    legalName: "Rye",
                    billingEmail: "in2@example.com",
                    postalCode: "SW1A 1AA",
                }),
            ),
        ).toMatchObject({ field: "postalCode" });
    });

    it("clears GST fields when a profile moves abroad", async () => {
        const me = await user();
        const made = await profiles.create(me.id, {
            legalName: "Rye Bakes LLP",
            billingEmail: "move@example.com",
            gstState: "29",
        });
        const { profile } = await profiles.update(me.id, made.id, {
            country: "GB",
        });
        expect(profile).toMatchObject({ country: "GB", gstState: null });
    });

    it("bills a business only through a profile of its own edition", async () => {
        const me = await user();
        const uk = await profiles.create(me.id, {
            ...UK,
            billingEmail: "edition@example.com",
        });
        const india = await prisma.organization.create({
            data: { name: "Rye", slug: `bpc-in-${tag}`, edition: "INDIA" },
        });
        const global = await prisma.organization.create({
            data: { name: "Rye", slug: `bpc-gl-${tag}`, edition: "GLOBAL" },
        });
        const refused = await prisma
            .$transaction((tx) =>
                profileMoveInTx(tx, india.id, uk.id, new Date()),
            )
            .then(
                () => null,
                (e: unknown) => e,
            );
        expect(refused).toBeInstanceOf(ConflictException);
        expect((refused as ConflictException).getResponse()).toMatchObject({
            details: { code: PROFILE_OTHER_EDITION },
        });
        await expect(
            prisma.$transaction((tx) =>
                profileMoveInTx(tx, global.id, uk.id, new Date()),
            ),
        ).resolves.toBeDefined();
    });
});
