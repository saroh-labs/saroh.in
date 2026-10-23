import { afterEach, describe, expect, it, vi } from "vitest";

import type { Db } from "./helpers";
import { seedStaff } from "./staff";

const SHARED = "postgresql://u:p@db.example.net:5432/saroh-dev";

describe("seedStaff", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("grants no console access on a database that isn't on this machine", async () => {
        // Any write would throw: the stub has no models.
        const prisma = {} as Db;
        await expect(seedStaff(prisma, SHARED)).resolves.toBeNull();
        // With no URL passed it reads DATABASE_URL, which CI points at a
        // local throwaway: say which database this run means.
        vi.stubEnv("DATABASE_URL", SHARED);
        await expect(seedStaff(prisma)).resolves.toBeNull();
    });
});
