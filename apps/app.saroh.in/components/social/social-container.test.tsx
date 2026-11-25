// @vitest-environment jsdom
/**
 * Social on React Query (DEC-259, U16), read in the browser: the frame is
 * drawn at once from the page's gate, the lists as skeletons, with one
 * read each; a post `?post=` names that isn't in the list is one read of
 * its own; a tab changes in place with no read; What's worth posting and
 * Your posts are drawn from their queries, a failure said once.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/social",
    };
});
const shown = vi.hoisted(() => ({
    props: null as null | Record<string, unknown>,
}));
vi.mock("./saroh/social-page", () => ({
    SarohSocialPage: (props: Record<string, unknown>) => {
        shown.props = props;
        return null;
    },
}));
vi.mock("./home/social-home", () => ({
    SocialHome: (props: Record<string, unknown>) => {
        shown.props = props;
        return null;
    },
}));

import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";
import {
    ownPostsRead,
    socialPicksRead,
    socialScreenRead,
} from "@/lib/social/queries";

import { SarohSocialContainer, SocialHomeContainer } from "./social-container";

const ORG = "org_1";
const POST = { id: "p1", status: "DRAFT", title: "Rye" };
const GATE = { state: "on", canPost: true, usage: null } as never;
const SCREEN = {
    access: { state: "on", canPost: true, usage: { used: 3 } },
    channels: { ok: true, data: [] },
    posts: { ok: true, data: [POST] },
};

const fetches: string[] = [];
const answer = (body: unknown, status = 200) =>
    Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );

beforeEach(() => {
    fetches.length = 0;
    shown.props = null;
    window.history.replaceState(null, "", "/social");
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetches.push(url);
            if (url.startsWith("/api/social/post")) {
                return answer({ ...POST, id: "p9" });
            }
            if (url === "/api/social") return answer(SCREEN);
            if (url === "/api/social/picks") {
                return answer({ rows: [], failed: ["offers"] });
            }
            return answer({ code: "unavailable" }, 503);
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const settle = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 0));
    });

describe("SarohSocialContainer", () => {
    it("draws the frame from the gate at once, then the screen from one read", async () => {
        const view = renderWithQuery(
            <SarohSocialContainer access={GATE} pages={null} />,
        );
        // First paint: the gate's access, no rows yet.
        expect(shown.props?.access).toBe(GATE);
        expect(shown.props?.channels).toBeNull();
        expect(shown.props?.posts).toBeNull();
        await vi.waitFor(() =>
            expect(shown.props?.posts).toEqual(SCREEN.posts),
        );
        // The read's fresher count takes over.
        expect(shown.props?.access).toEqual(SCREEN.access);
        expect(fetches).toEqual(["/api/social"]);
        view.unmount();
    });

    it("changes tab in place, and opens a listed post with no read", async () => {
        const client = makeTestClient();
        client.setQueryData(
            socialScreenRead.options(ORG, {}).queryKey,
            SCREEN as never,
        );
        const view = renderWithQuery(
            <SarohSocialContainer access={GATE} pages={null} />,
            { client },
        );
        await settle();
        expect(fetches).toEqual([]);
        expect(shown.props?.opened).toBeNull();
        act(() => {
            window.history.pushState(null, "", "/social?tab=channels");
            window.dispatchEvent(new PopStateEvent("popstate"));
        });
        await settle();
        expect((shown.props?.params as { tab: string }).tab).toBe("channels");
        act(() => {
            window.history.pushState(null, "", "/social?post=p1");
            window.dispatchEvent(new PopStateEvent("popstate"));
        });
        await settle();
        expect(fetches).toEqual([]);
        view.unmount();
    });

    it("reads a post that isn't in the list, once", async () => {
        window.history.replaceState(null, "", "/social?post=p9");
        const client = makeTestClient();
        client.setQueryData(
            socialScreenRead.options(ORG, {}).queryKey,
            SCREEN as never,
        );
        const view = renderWithQuery(
            <SarohSocialContainer access={GATE} pages={null} />,
            { client },
        );
        await vi.waitFor(() =>
            expect((shown.props?.opened as { id: string } | null)?.id).toBe(
                "p9",
            ),
        );
        expect(fetches).toEqual(["/api/social/post?id=p9"]);
        view.unmount();
    });
});

describe("SocialHomeContainer", () => {
    const props = { setup: {} as never, canPost: true };

    it("draws the frame at once, then what to post and Your posts, one read each", async () => {
        const view = renderWithQuery(<SocialHomeContainer {...props} />);
        expect(shown.props?.rows).toBeNull();
        expect(shown.props?.posts).toBeNull();
        // Your posts fails here (the fetch stub's 503): said once, not as none.
        await vi.waitFor(() =>
            expect(shown.props?.failed).toEqual(["offers", "your posts"]),
        );
        expect(shown.props?.rows).toEqual([]);
        expect(shown.props?.posts).toEqual([]);
        expect([...fetches].sort()).toEqual([
            "/api/social/own-posts",
            "/api/social/picks",
        ]);
        view.unmount();
    });

    it("draws from what is cached, with no read", async () => {
        const client = makeTestClient();
        client.setQueryData(ownPostsRead.options(ORG, {}).queryKey, [
            { id: "o1" },
        ] as never);
        client.setQueryData(socialPicksRead.options(ORG, {}).queryKey, {
            rows: [],
            failed: [],
        });
        const view = renderWithQuery(<SocialHomeContainer {...props} />, {
            client,
        });
        await settle();
        expect(fetches).toEqual([]);
        expect(shown.props?.posts).toEqual([{ id: "o1" }]);
        expect(shown.props?.failed).toEqual([]);
        view.unmount();
    });
});
