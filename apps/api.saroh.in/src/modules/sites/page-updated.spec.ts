import { pageUpdatedAt } from "./page-updated";

const at = (iso: string) => new Date(iso);

describe("pageUpdatedAt (#908)", () => {
    it("reads a section save, which only moves the draft version", () => {
        expect(
            pageUpdatedAt({
                updatedAt: at("2026-10-01T09:00:00Z"),
                versions: [{ updatedAt: at("2026-10-05T12:00:00Z") }],
            }),
        ).toEqual(at("2026-10-05T12:00:00Z"));
    });

    it("reads a rename, which only moves the page", () => {
        expect(
            pageUpdatedAt({
                updatedAt: at("2026-10-07T08:00:00Z"),
                versions: [{ updatedAt: at("2026-10-05T12:00:00Z") }],
            }),
        ).toEqual(at("2026-10-07T08:00:00Z"));
    });

    it("falls back to the page when it has no draft", () => {
        expect(
            pageUpdatedAt({
                updatedAt: at("2026-10-01T09:00:00Z"),
                versions: [],
            }),
        ).toEqual(at("2026-10-01T09:00:00Z"));
        expect(
            pageUpdatedAt({ updatedAt: at("2026-10-01T09:00:00Z") }),
        ).toEqual(at("2026-10-01T09:00:00Z"));
    });
});
