import { describe, expect, it } from "vitest";

import type { Db } from "./helpers";
import { seedStaff } from "./staff";

const SHARED = "postgresql://u:p@db.example.net:5432/saroh-dev";

describe("seedStaff", () => {
    it("grants no console access on a database that isn't on this machine", async () => {
        // Any write would throw: the stub has no models.
        const prisma = {} as Db;
        await expect(seedStaff(prisma, SHARED)).resolves.toBeNull();
        await expect(seedStaff(prisma, undefined)).resolves.toBeNull();
    });
});
