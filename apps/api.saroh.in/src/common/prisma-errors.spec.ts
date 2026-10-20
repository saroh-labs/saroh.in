import { isSerializationFailure, prismaErrorCode } from "./prisma-errors";

/** The shape @prisma/driver-adapter-utils throws for Postgres 40001. */
function driverAdapterConflict(): Error {
    const err = new Error("TransactionWriteConflict");
    err.name = "DriverAdapterError";
    (err as Error & { cause: unknown }).cause = {
        kind: "TransactionWriteConflict",
    };
    return err;
}

describe("prisma errors (#106)", () => {
    it("reads a serialization failure from Prisma's P2034", () => {
        expect(isSerializationFailure({ code: "P2034" })).toBe(true);
        expect(prismaErrorCode({ code: "P2034" })).toBe("P2034");
    });

    it("reads one the pg driver adapter raised with no code", () => {
        expect(isSerializationFailure(driverAdapterConflict())).toBe(true);
        expect(prismaErrorCode(driverAdapterConflict())).toBe("P2034");
        expect(
            isSerializationFailure({ cause: { originalCode: "40001" } }),
        ).toBe(true);
    });

    it("reads one a raw query raised as P2010", () => {
        const message =
            "Raw query failed. Code: `40001`. Message: `could not serialize access due to read/write dependencies among transactions`";
        expect(isSerializationFailure({ code: "P2010", message })).toBe(true);
        expect(prismaErrorCode({ code: "P2010", message })).toBe("P2034");
        expect(
            isSerializationFailure({ code: "P2010", meta: { code: "40001" } }),
        ).toBe(true);
        // Any other raw query failure is still its own.
        expect(
            prismaErrorCode({
                code: "P2010",
                message: "Raw query failed. Code: `42P01`.",
            }),
        ).toBe("P2010");
    });

    it("leaves every other error as it was", () => {
        expect(prismaErrorCode({ code: "P2002" })).toBe("P2002");
        expect(isSerializationFailure({ code: "P2002" })).toBe(false);
        expect(isSerializationFailure(new Error("boom"))).toBe(false);
        expect(prismaErrorCode(new Error("boom"))).toBeUndefined();
        expect(prismaErrorCode(null)).toBeUndefined();
        expect(prismaErrorCode("P2034")).toBeUndefined();
    });
});
