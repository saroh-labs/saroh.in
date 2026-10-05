import { describe, expect, it } from "vitest";

import { gaMeasurementId } from "./ga";

describe("gaMeasurementId", () => {
    it("loads GA only on a production deployment with an id", () => {
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "production" }),
        ).toBe("G-TEST123");
    });

    it("never loads it locally, on a preview or without an id", () => {
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: undefined }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "preview" }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "development" }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: undefined, vercelEnv: "production" }),
        ).toBeUndefined();
    });
});
