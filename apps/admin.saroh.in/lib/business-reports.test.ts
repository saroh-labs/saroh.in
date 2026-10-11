import { describe, expect, it, vi } from "vitest";

const getJson = vi.fn(() => Promise.resolve(null));
vi.mock("./control-plane", () => ({ getJson }));

const { listBusinessReports, reportStatus, reporterDetail } =
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

describe("reporterDetail", () => {
    it("shows the email and the number to staff who may read personal data", () => {
        expect(
            reporterDetail(true, "first.last@example.com", true, "an email"),
        ).toBe("first.last@example.com");
        expect(
            reporterDetail(true, "+91 98450 12345", true, "a mobile number"),
        ).toBe("+91 98450 12345");
    });

    it("says only that one was left to staff who may not", () => {
        expect(reporterDetail(true, null, false, "an email")).toBe(
            "Left an email (needs personal data access)",
        );
        expect(reporterDetail(true, null, false, "a mobile number")).toBe(
            "Left a mobile number (needs personal data access)",
        );
        // The API sends no value without the permission; a value that came
        // anyway is still not drawn.
        expect(
            reporterDetail(true, "+91 98450 12345", false, "a mobile number"),
        ).toBe("Left a mobile number (needs personal data access)");
    });

    it("is nothing for an older report, or an older API, with no number", () => {
        expect(reporterDetail(false, null, true, "a mobile number")).toBeNull();
        expect(
            reporterDetail(undefined, undefined, true, "a mobile number"),
        ).toBeNull();
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
