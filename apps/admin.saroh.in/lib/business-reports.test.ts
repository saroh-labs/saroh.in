import { describe, expect, it, vi } from "vitest";

const getJson = vi.fn(() => Promise.resolve(null));
vi.mock("./control-plane", () => ({ getJson }));

const { listBusinessReports, reportStatus } =
    await import("./business-reports");

describe("reportStatus", () => {
    it("shows open reports unless the address asks for done or all", () => {
        expect(reportStatus(undefined)).toBe("open");
        expect(reportStatus("open")).toBe("open");
        expect(reportStatus("done")).toBe("done");
        expect(reportStatus("all")).toBe("all");
        expect(reportStatus("DONE")).toBe("open");
        expect(reportStatus("anything")).toBe("open");
    });
});

describe("listBusinessReports", () => {
    it("asks the API for one status and page", async () => {
        await listBusinessReports({ status: "done", cursor: "r 1" });
        expect(getJson).toHaveBeenCalledWith(
            "/business-reports?status=done&cursor=r+1",
        );
    });
});
