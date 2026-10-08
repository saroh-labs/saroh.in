/**
 * A business override on a flag nobody has set globally, against a real
 * Postgres. The admin console's Force on answered 500 on a fresh production
 * database: the override's foreign key needs the flag's row, and a flag never
 * set globally has none. A mocked Prisma can't show a foreign key, so this is
 * the test that would have caught it.
 *
 * Runs in the integration project (TEST_DATABASE_URL). Skipped under RLS mode:
 * the admin console writes as the owner role, outside any organization context.
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import { FeatureFlagService } from "./feature-flags.service";
import { FlagKey } from "./flags";

const service = new FeatureFlagService();
const KEY = FlagKey.MODULE_CRM;

let organizationId: string;
let actorUserId: string;

(isRlsTestMode() ? describe.skip : describe)(
    "FeatureFlagService.setOverride on a fresh database",
    () => {
        beforeAll(async () => {
            const organization = await prisma.organization.create({
                data: {
                    name: "Fresh Flags",
                    slug: `fresh-flags-${process.pid}`,
                },
            });
            organizationId = organization.id;
            const actor = await prisma.user.create({
                data: { email: `flags-${process.pid}@saroh.in`, name: "Op" },
            });
            actorUserId = actor.id;
        });

        beforeEach(async () => {
            await prisma.featureFlagAudit.deleteMany({
                where: { flagKey: KEY },
            });
            await prisma.featureFlag.deleteMany({ where: { key: KEY } });
        });

        it("forces a never-configured flag on for one business, registering it off for everyone", async () => {
            await service.setOverride(
                KEY,
                organizationId,
                true,
                actorUserId,
                "test",
            );

            const flag = await prisma.featureFlag.findUnique({
                where: { key: KEY },
            });
            expect(flag?.enabledByDefault).toBe(false);
            await expect(service.isEnabled(KEY, organizationId)).resolves.toBe(
                true,
            );

            const history = await prisma.featureFlagAudit.findMany({
                where: { flagKey: KEY },
                orderBy: { createdAt: "asc" },
            });
            expect(
                history.map((row) => [row.organizationId, row.newValue]),
            ).toEqual([
                [null, false],
                [organizationId, true],
            ]);
        });

        it("leaves a global default that is already on as it is", async () => {
            await prisma.featureFlag.create({
                data: { key: KEY, enabledByDefault: true },
            });

            await service.setOverride(
                KEY,
                organizationId,
                false,
                actorUserId,
                "test",
            );

            const flag = await prisma.featureFlag.findUnique({
                where: { key: KEY },
            });
            expect(flag?.enabledByDefault).toBe(true);
        });

        it("forces two businesses on at once, registering the flag once", async () => {
            const other = await prisma.organization.create({
                data: {
                    name: "Fresh Flags Two",
                    slug: `fresh-flags-two-${process.pid}`,
                },
            });

            // Both find no flag row; neither may fail on its unique key.
            await Promise.all([
                service.setOverride(
                    KEY,
                    organizationId,
                    true,
                    actorUserId,
                    "a",
                ),
                service.setOverride(KEY, other.id, true, actorUserId, "b"),
            ]);

            await expect(service.isEnabled(KEY, organizationId)).resolves.toBe(
                true,
            );
            await expect(service.isEnabled(KEY, other.id)).resolves.toBe(true);
            const registrations = await prisma.featureFlagAudit.count({
                where: { flagKey: KEY, organizationId: null },
            });
            expect(registrations).toBe(1);

            await prisma.featureFlagAudit.deleteMany({
                where: { organizationId: other.id },
            });
            await prisma.featureFlagOverride.deleteMany({
                where: { organizationId: other.id },
            });
            await prisma.organization.delete({ where: { id: other.id } });
        });

        it("answers 404 for an organization that does not exist", async () => {
            await expect(
                service.setOverride(
                    KEY,
                    "org_missing",
                    true,
                    actorUserId,
                    "test",
                ),
            ).rejects.toBeInstanceOf(NotFoundException);
            await expect(
                prisma.featureFlag.findUnique({ where: { key: KEY } }),
            ).resolves.toBeNull();
        });
    },
);
