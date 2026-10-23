/**
 * The billing profile table (DEC-167): one email per owner, a business's
 * pointer that outlives its profile, and a provider customer held once.
 */
import { prisma } from "@saroh/database";

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function owner() {
    return prisma.user.create({
        data: { email: `${uniq("owner-")}@example.com`, name: "Asha Rao" },
    });
}

function profileData(ownerUserId: string, billingEmail: string) {
    return {
        ownerUserId,
        legalName: "Asha's Kitchen",
        billingEmail,
        provider: "RAZORPAY",
    };
}

describe("BillingProfile", () => {
    it("holds one profile per owner and billing email", async () => {
        const user = await owner();
        const email = `${uniq("accounts-")}@example.com`;
        await prisma.billingProfile.create({
            data: profileData(user.id, email),
        });

        await expect(
            prisma.billingProfile.create({ data: profileData(user.id, email) }),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("lets two owners use the same billing email", async () => {
        const email = `${uniq("shared-")}@example.com`;
        const [a, b] = [await owner(), await owner()];
        await prisma.billingProfile.create({ data: profileData(a.id, email) });
        await prisma.billingProfile.create({ data: profileData(b.id, email) });

        expect(
            await prisma.billingProfile.count({
                where: { billingEmail: email },
            }),
        ).toBe(2);
    });

    it("gives one provider customer to one profile only", async () => {
        const user = await owner();
        const customer = uniq("cust_");
        await prisma.billingProfile.create({
            data: {
                ...profileData(user.id, `${uniq("a-")}@example.com`),
                providerCustomerId: customer,
            },
        });

        await expect(
            prisma.billingProfile.create({
                data: {
                    ...profileData(user.id, `${uniq("b-")}@example.com`),
                    providerCustomerId: customer,
                },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
    });

    it("leaves a business without a profile when its owner is deleted", async () => {
        const user = await owner();
        const profile = await prisma.billingProfile.create({
            data: profileData(user.id, `${uniq("c-")}@example.com`),
        });
        const org = await prisma.organization.create({
            data: {
                name: "Asha's Kitchen",
                slug: uniq("asha-"),
                billingProfileId: profile.id,
            },
        });

        await prisma.user.delete({ where: { id: user.id } });

        expect(
            await prisma.billingProfile.findUnique({
                where: { id: profile.id },
            }),
        ).toBeNull();
        const after = await prisma.organization.findUniqueOrThrow({
            where: { id: org.id },
        });
        expect(after.billingProfileId).toBeNull();
    });
});
