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

    it("leaves every other error as it was", () => {
        expect(prismaErrorCode({ code: "P2002" })).toBe("P2002");
        expect(isSerializationFailure({ code: "P2002" })).toBe(false);
        expect(isSerializationFailure(new Error("boom"))).toBe(false);
        expect(prismaErrorCode(new Error("boom"))).toBeUndefined();
        expect(prismaErrorCode(null)).toBeUndefined();
        expect(prismaErrorCode("P2034")).toBeUndefined();
    });
});
