// TEMPORARY stub while the catalogue is written.
import type { Db } from "../helpers";
import { ACHAAR_ORG_ID } from "./achaar";
import type { DemoShopContext, DemoShopResult } from "./demo-shop";

export function seedPagdandi(_ctx: DemoShopContext): Promise<DemoShopResult> {
    return Promise.resolve({
        id: ACHAAR_ORG_ID,
        name: "Ammi's Achaar",
        prefix: "seed_sc_aa_",
    });
}
export function checkPagdandi(_prisma: Db, _now: Date) {
    return Promise.resolve({});
}
