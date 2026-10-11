// DEC-140: what a visitor who types the bare domain gets. No network: the
// resolver and the transport are stand-ins, so every outcome is driven
// from here.
jest.mock("../../env", () => ({ env: {}, declaredNodeEnv: undefined }));

import type { LookupAddress } from "node:dns";

import type { TransportRequest } from "../link-preview/safe-fetch";
import {
    FakeBareDomainCheck,
    MAX_FORWARD_REDIRECTS,
    NetworkBareDomainCheck,
} from "./bare-forwarding";

const BARE = "example.co.in";
const WWW = "www.example.co.in";
const TARGET = "sites.saroh.example";

/** A public address a forwarding service might answer from. */
const FORWARDER: LookupAddress = { address: "93.184.216.34", family: 4 };
/** The hosting's own address, as the target resolves. */
const HOSTING: LookupAddress = { address: "104.18.0.10", family: 4 };

type Answer = { status: number; location?: string } | "refused" | "hang";

/**
 * A check over a DNS table and a table of answers by URL. `requests`
 * records every URL asked, so a test can say what was never fetched.
 */
function setup(options: {
    dns?: Record<string, LookupAddress[] | "fail">;
    answers?: Record<string, Answer>;
    target?: string | null;
    timeoutMs?: number;
}) {
    const dns: Record<string, LookupAddress[] | "fail"> = {
        [BARE]: [FORWARDER],
        [TARGET]: [HOSTING],
        ...options.dns,
    };
    const requests: string[] = [];
    const maxBytes: number[] = [];
    const check = new NetworkBareDomainCheck({
        target: () => (options.target === undefined ? TARGET : options.target),
        timeoutMs: options.timeoutMs ?? 200,
        resolve: (host) => {
            const found = dns[host];
            if (!found || found === "fail") {
                return Promise.reject(new Error("ENOTFOUND"));
            }
            return Promise.resolve(found);
        },
        transport: (request: TransportRequest) => {
            requests.push(request.url.href);
            maxBytes.push(request.maxBytes);
            const answer = options.answers?.[request.url.href] ?? "refused";
            if (answer === "refused") {
                return Promise.reject(new Error("ECONNREFUSED"));
            }
            if (answer === "hang") return new Promise(() => undefined);
            return Promise.resolve({
                status: answer.status,
                headers: { location: answer.location },
                body: Buffer.alloc(0),
                truncated: false,
            });
        },
    });
    return { check, requests, maxBytes };
}

describe("NetworkBareDomainCheck.forwarding", () => {
    it("says FORWARDS when http and https both send the visitor to www", async () => {
        const { check, requests } = setup({
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: `https://${WWW}/`,
                },
                [`https://${BARE}/`]: {
                    status: 301,
                    location: `https://${WWW}/`,
                },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe("FORWARDS");
        // Being sent to www is the answer: www itself is never asked.
        expect(requests.sort()).toEqual([
            `http://${BARE}/`,
            `https://${BARE}/`,
        ]);
    });

    it("follows a step through https on the bare domain first", async () => {
        const { check } = setup({
            answers: {
                [`http://${BARE}/`]: {
                    status: 302,
                    location: `https://${BARE}/`,
                },
                [`https://${BARE}/`]: { status: 308, location: `//${WWW}/` },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe("FORWARDS");
    });

    it("says FORWARDS_HTTP_ONLY when https on the bare domain doesn't answer", async () => {
        const { check } = setup({
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: `http://${WWW}/`,
                },
                [`https://${BARE}/`]: "refused",
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "FORWARDS_HTTP_ONLY",
        );
    });

    it("says FORWARDS_HTTP_ONLY when https on the bare domain never answers in time", async () => {
        const { check } = setup({
            timeoutMs: 30,
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: `https://${WWW}/`,
                },
                [`https://${BARE}/`]: "hang",
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "FORWARDS_HTTP_ONLY",
        );
    });

    it("says NOT_FORWARDING for a page, a parking page included", async () => {
        const { check } = setup({
            answers: {
                [`http://${BARE}/`]: { status: 200 },
                [`https://${BARE}/`]: { status: 200 },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
    });

    it("says NOT_FORWARDING when it forwards somewhere else", async () => {
        const { check } = setup({
            dns: { "other.example.net": [FORWARDER] },
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: "https://other.example.net/",
                },
                "https://other.example.net/": { status: 200 },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
    });

    it("says NOT_FORWARDING for a bare domain with no DNS, and asks nothing", async () => {
        const { check, requests } = setup({ dns: { [BARE]: "fail" } });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
        expect(requests).toEqual([]);
    });

    it("gives up after a couple of redirects", async () => {
        const hop = (n: number) => `http://${BARE}/hop${n}`;
        const { check, requests } = setup({
            answers: {
                [`http://${BARE}/`]: { status: 302, location: hop(1) },
                [hop(1)]: { status: 302, location: hop(2) },
                [hop(2)]: { status: 302, location: hop(3) },
                [hop(3)]: { status: 302, location: `https://${WWW}/` },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
        expect(requests.filter((u) => u.startsWith("http://"))).toHaveLength(
            MAX_FORWARD_REDIRECTS + 1,
        );
    });

    it("never connects to an address that isn't public", async () => {
        const { check, requests } = setup({
            dns: { [BARE]: [{ address: "10.0.0.5", family: 4 }] },
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: `https://${WWW}/`,
                },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
        expect(requests).toEqual([]);
    });

    it("never follows a redirect to an address that isn't public", async () => {
        const { check, requests } = setup({
            answers: {
                [`http://${BARE}/`]: {
                    status: 301,
                    location: "http://169.254.169.254/latest/meta-data/",
                },
                "http://169.254.169.254/latest/meta-data/": {
                    status: 301,
                    location: `https://${WWW}/`,
                },
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe(
            "NOT_FORWARDING",
        );
        expect(requests).not.toContain(
            "http://169.254.169.254/latest/meta-data/",
        );
    });

    it("asks for no body", async () => {
        const { check, maxBytes } = setup({
            answers: { [`http://${BARE}/`]: { status: 200 } },
        });
        await check.forwarding(BARE, WWW);
        expect(maxBytes.length).toBeGreaterThan(0);
        expect(maxBytes.every((n) => n === 0)).toBe(true);
    });

    it("says POINTS_HERE when the bare domain answers with the hosting's addresses, and asks it nothing", async () => {
        const { check, requests } = setup({
            dns: {
                [BARE]: [HOSTING, { address: "2606:4700::10", family: 6 }],
            },
        });
        await expect(check.forwarding(BARE, WWW)).resolves.toBe("POINTS_HERE");
        expect(requests).toEqual([]);
    });
});

describe("NetworkBareDomainCheck.pointsHere", () => {
    it("is true only when an address is shared with the target", async () => {
        await expect(
            setup({ dns: { [BARE]: [HOSTING] } }).check.pointsHere(BARE),
        ).resolves.toBe(true);
        await expect(setup({}).check.pointsHere(BARE)).resolves.toBe(false);
    });

    it("is false when no target is named here, or DNS doesn't answer", async () => {
        await expect(
            setup({
                dns: { [BARE]: [HOSTING] },
                target: null,
            }).check.pointsHere(BARE),
        ).resolves.toBe(false);
        await expect(
            setup({ dns: { [BARE]: "fail" } }).check.pointsHere(BARE),
        ).resolves.toBe(false);
        await expect(
            setup({
                dns: { [BARE]: [HOSTING], [TARGET]: "fail" },
            }).check.pointsHere(BARE),
        ).resolves.toBe(false);
    });
});

describe("FakeBareDomainCheck", () => {
    it("answers what it was told, NOT_FORWARDING otherwise", async () => {
        const fake = new FakeBareDomainCheck();
        await expect(fake.forwarding("a.in")).resolves.toBe("NOT_FORWARDING");
        fake.setStatus("a.in", "FORWARDS_HTTP_ONLY");
        await expect(fake.forwarding("a.in")).resolves.toBe(
            "FORWARDS_HTTP_ONLY",
        );
        fake.setPointsHere("a.in");
        await expect(fake.pointsHere("a.in")).resolves.toBe(true);
        await expect(fake.forwarding("a.in")).resolves.toBe("POINTS_HERE");
    });
});
