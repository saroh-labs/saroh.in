/**
 * Where a business came from (#1190) against a real Postgres: setup stores
 * the carried `src` and utm on the business, drops a malformed value and
 * still makes the business, and a business's source is never changed by
 * the next one its owner makes.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { plainToInstance } from "class-transformer";

import { prisma } from "@saroh/database";

import { AuditService } from "../audit/audit.service";
import { OnboardOrganizationDto } from "./dto";
import { OrganizationOnboardingService } from "./organization-onboarding.service";

const onboarding = new OrganizationOnboardingService(new AuditService());

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

async function person(): Promise<string> {
    const user = await prisma.user.create({
        data: { email: `${uniq("src-")}@example.com`, emailVerified: true },
        select: { id: true },
    });
    return user.id;
}

/** The create request as the API's validation pipe hands it over. */
const request = (body: Record<string, unknown>) =>
    plainToInstance(OnboardOrganizationDto, body);

const sourceOf = async (id: string) =>
    (
        await prisma.organization.findUniqueOrThrow({
            where: { id },
            select: { signupSource: true },
        })
    ).signupSource;

describe("a business's signup source (#1190)", () => {
    it("is stored as carried", async () => {
        const org = await onboarding.onboard(
            await person(),
            request({
                name: "Rye and Co",
                address: uniq("rye-"),
                signupSource: {
                    src: "solutions-salons-hero",
                    utmSource: "google",
                },
            }),
        );

        expect(await sourceOf(org.id)).toEqual({
            src: "solutions-salons-hero",
            utmSource: "google",
        });
    });

    it("drops a malformed value and still makes the business", async () => {
        const org = await onboarding.onboard(
            await person(),
            request({
                name: "Pulse Studio",
                address: uniq("pulse-"),
                signupSource: { src: "<script>", utmMedium: "cpc" },
            }),
        );

        expect(await sourceOf(org.id)).toEqual({ utmMedium: "cpc" });

        const none = await onboarding.onboard(
            await person(),
            request({
                name: "Northwind",
                address: uniq("north-"),
                signupSource: { src: "a b" },
            }),
        );
        expect(await sourceOf(none.id)).toBeNull();
    });

    it("is never changed by the next business its owner makes", async () => {
        const owner = await person();
        const first = await onboarding.onboard(
            owner,
            request({
                name: "Rye and Co",
                address: uniq("rye-"),
                signupSource: { src: "first" },
            }),
        );
        const profile = await prisma.billingProfile.findFirstOrThrow({
            where: { ownerUserId: owner },
            select: { id: true },
        });
        const second = await onboarding.onboard(
            owner,
            request({
                name: "Rye Two",
                billingProfileId: profile.id,
                address: uniq("rye-"),
                signupSource: { src: "second" },
            }),
        );

        expect(await sourceOf(first.id)).toEqual({ src: "first" });
        expect(await sourceOf(second.id)).toEqual({ src: "second" });
    });
});
