import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/http", () => ({
    apiFetch: (url: string) => apiFetch(url),
    orgBase: async () => "https://api.test/organizations/org_1",
}));
vi.mock("@/lib/contacts/service", () => ({
    getContact: async () => ({ phone: "+910000000000" }),
}));
vi.mock("@/lib/messages/notice-reach-read", () => ({
    readNoticeReach: async () => null,
}));

import { readPeekPerson } from "./peek-person";

afterEach(() => apiFetch.mockReset());

describe("readPeekPerson", () => {
    it("asks the API's booking route for the visit line (DEC-274)", async () => {
        apiFetch.mockImplementation(async (url: string) =>
            url.endsWith("/visits")
                ? new Response(
                      JSON.stringify({ before: 3, lastAt: "2026-09-12" }),
                  )
                : new Response("null"),
        );
        const person = await readPeekPerson("c_1", "b_1");
        // The API serves booking reads under services/ (bookings.controller).
        expect(apiFetch).toHaveBeenCalledWith(
            "https://api.test/organizations/org_1/services/bookings/b_1/visits",
        );
        expect(person?.visits).toEqual({ before: 3, lastAt: "2026-09-12" });
    });
});
