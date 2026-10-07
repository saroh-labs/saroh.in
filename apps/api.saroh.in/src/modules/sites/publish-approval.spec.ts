// DEC-103: "Publishing needs approval" is Pro's. Switched on under a plan
// without the catalogue's `review` row, it stops applying.
jest.mock("@saroh/database", () => ({ prisma: {} }));

import { planMeter } from "../billing/metering.service";
import { approvalApplies } from "./publish-approval";

describe("approvalApplies (DEC-103)", () => {
    afterEach(() => jest.restoreAllMocks());

    it("applies only while switched on and the plan includes review", async () => {
        const included = jest
            .spyOn(planMeter, "isIncluded")
            .mockResolvedValue(true);
        await expect(approvalApplies("org_1", true)).resolves.toBe(true);
        expect(included).toHaveBeenCalledWith("org_1", "review");

        included.mockResolvedValue(false);
        await expect(approvalApplies("org_1", true)).resolves.toBe(false);
    });

    it("never asks the plan about a setting that is off", async () => {
        const included = jest.spyOn(planMeter, "isIncluded");
        await expect(approvalApplies("org_1", false)).resolves.toBe(false);
        expect(included).not.toHaveBeenCalled();
    });
});
