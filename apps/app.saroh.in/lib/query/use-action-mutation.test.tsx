// @vitest-environment jsdom
/**
 * A save from a migrated screen (DEC-259): runAction's behaviour, then the
 * declared reads read again before the promise resolves. A refusal or a
 * throw reads nothing again and undoes an optimistic patch; Next's
 * interrupts go on their way; the action is told the tab's business.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const showError = vi.hoisted(() => vi.fn());
vi.mock("@saroh/ui/toast", () => ({ showError }));
vi.mock("next/navigation", () => ({
    unstable_rethrow: (error: unknown) => {
        if ((error as { digest?: string }).digest === "NEXT_REDIRECT")
            throw error;
    },
}));

import { UNREACHED } from "@/lib/api/unreached";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import { useActionMutation } from "@/lib/query/use-action-mutation";

type Res = { ok: true } | { ok: false; error: string };
const LIST = domainKey("probe", "org_a", "list");
const OTHER = domainKey("other", "org_a", "list");

let client: QueryClient;
let reads: { probe: number; other: number };
let mutate: (v: number) => Promise<Res | undefined>;
let unmount: () => void;

function mount(
    action: (v: number, orgId: string) => Promise<Res>,
    optimistic?: (c: QueryClient, v: number) => () => void,
) {
    function Probe() {
        mutate = useActionMutation(action, {
            invalidates: [LIST],
            optimistic,
        }).mutateAsync;
        return null;
    }
    ({ unmount } = renderWithQuery(<Probe />, { client, orgId: "org_a" }));
}

beforeEach(async () => {
    showError.mockReset();
    client = makeTestClient();
    reads = { probe: 0, other: 0 };
    // Two read queries, observed so an invalidation refetches them.
    for (const [key, name] of [
        [LIST, "probe"],
        [OTHER, "other"],
    ] as const) {
        const queryFn = () => ++reads[name];
        await client.fetchQuery({ queryKey: key, queryFn });
        new QueryObserver(client, { queryKey: key, queryFn }).subscribe(
            () => undefined,
        );
    }
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    reads = { probe: 0, other: 0 };
});
afterEach(() => unmount());

describe("useActionMutation", () => {
    it("ok: the declared read alone is read again, before it resolves", async () => {
        let orgSeen = "";
        mount((_v, orgId) => {
            orgSeen = orgId;
            return Promise.resolve({ ok: true });
        });
        await expect(mutate(1)).resolves.toEqual({ ok: true });
        expect(reads).toEqual({ probe: 1, other: 0 });
        expect(client.getQueryData(LIST)).toBe(1);
        expect(orgSeen).toBe("org_a");
    });

    it("ok:false comes back untouched and reads nothing again", async () => {
        mount(() => Promise.resolve({ ok: false, error: "No." }));
        await expect(mutate(1)).resolves.toEqual({ ok: false, error: "No." });
        expect(reads).toEqual({ probe: 0, other: 0 });
        expect(showError).not.toHaveBeenCalled();
    });

    it("a throw says the one sentence and reads nothing again", async () => {
        mount(() => Promise.reject(new TypeError("Failed to fetch")));
        await expect(mutate(1)).resolves.toBeUndefined();
        expect(showError).toHaveBeenCalledWith(UNREACHED);
        expect(reads).toEqual({ probe: 0, other: 0 });
    });

    it("a redirect after the save goes on its way", async () => {
        const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
            digest: "NEXT_REDIRECT",
        });
        mount(() => Promise.reject(redirect));
        await expect(mutate(1)).rejects.toBe(redirect);
        expect(reads).toEqual({ probe: 0, other: 0 });
    });

    it("an optimistic patch shows at once and is undone when the save fails", async () => {
        const patch = (c: QueryClient, v: number) => {
            const before = c.getQueryData<number>(LIST);
            c.setQueryData(LIST, v);
            return () => c.setQueryData(LIST, before);
        };
        let release!: (r: Res) => void;
        mount(() => new Promise<Res>((r) => (release = r)), patch);
        const held = client.getQueryData(LIST);
        const done = mutate(42);
        await vi.waitFor(() => expect(client.getQueryData(LIST)).toBe(42));
        release({ ok: false, error: "No." });
        await done;
        expect(client.getQueryData(LIST)).toBe(held);
        expect(reads.probe).toBe(0);
    });
});
