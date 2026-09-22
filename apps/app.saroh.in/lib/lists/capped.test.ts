import { describe, expect, it } from "vitest";

import { LIST_LIMIT, withLive } from "./capped";

const row = (id: string) => ({ id });

describe("withLive", () => {
    it("adds the live rows the newest read missed, once each", () => {
        expect(
            withLive([row("a"), row("b")], [row("b"), row("c")], [row("c")]),
        ).toEqual({ rows: [row("a"), row("b"), row("c")], truncated: false });
    });

    it("says the history was cut off when the newest read hit the cap", () => {
        const newest = Array.from({ length: LIST_LIMIT }, (_, i) =>
            row(`r${i}`),
        );
        expect(withLive(newest, [row("old-unpaid")])).toMatchObject({
            truncated: true,
        });
        expect(withLive(newest, [row("old-unpaid")]).rows.at(-1)).toEqual(
            row("old-unpaid"),
        );
    });
});
