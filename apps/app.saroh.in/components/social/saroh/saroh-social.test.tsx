// @vitest-environment jsdom
/**
 * Saroh Social's screens (plan saroh-social U9 to U12; boards
 * BSocialHomeSocialDesk, BSocialDesk; research S1, S2, S3, S4, S7, S8):
 * locked on Free and on Grow without the add-on, with the plan unknown
 * said as a failure; each channel's state and the way back from Meta;
 * the Page picker; the posts page's empty, chip and failed states; and
 * the composer's channels, Threads warning, story size and limit.
 */
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    SocialAccess,
    SocialChannel,
    SocialPost,
} from "@/lib/social/saroh-social-types";
import type { SocialCompose } from "@/lib/social/use-social-post";
import { useSocialPost } from "@/lib/social/use-social-post";

import { ChannelsView } from "./channels/channels-view";
import { SocialPostPanel } from "./composer/social-post-panel";
import { PostSheet } from "./post-sheet";
import { PostsView } from "./posts-view";
import { SocialLocked } from "./social-locked";
import type { SocialParams } from "./social-page";

const router = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    usePathname: () => "/social",
}));
vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        prefetch: _p,
        scroll: _s,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
        prefetch?: boolean;
        scroll?: boolean;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("@/lib/saroh-billing/plans-shown", () => ({ plansShown: () => true }));
const actions = vi.hoisted(() => ({
    savePost: vi.fn(),
    askForMorePosts: vi.fn(),
    connectChannel: vi.fn(),
    postResults: vi.fn(),
    tryPostAgain: vi.fn(),
    cancelPost: vi.fn(),
    deletePost: vi.fn(),
}));
vi.mock("@/lib/social/saroh-social-actions", () => actions);

const ON: SocialAccess = {
    state: "on",
    canPost: true,
    canBuy: true,
    plan: { id: "pro", name: "Pro" },
    upgradeTo: null,
    usage: {
        used: 12,
        limit: 100,
        resetsAt: "2099-12-31T18:30:00.000Z",
        requested: false,
    },
    goodTimes: ["2099-11-19T14:00:00.000Z"],
};

const channel = (
    kind: SocialChannel["kind"],
    state: SocialChannel["state"],
    more: Partial<SocialChannel> = {},
): SocialChannel => ({
    kind,
    state,
    handle: state === "NOT_CONNECTED" ? null : "@chaiandcrumb",
    avatarUrl: null,
    connectedAt: null,
    attention: null,
    grantEndsAt: null,
    waitingPosts: 0,
    heldPosts: 0,
    canConnect: true,
    ...more,
});

const PARAMS: SocialParams = {
    tab: "channels",
    channel: null,
    result: null,
    choice: null,
    post: null,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of Object.values(actions)) fn.mockReset();
    router.push.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

const draw = (node: ReactNode) => act(() => root.render(node));
const text = () => document.body.textContent;
const q = (sel: string) => document.body.querySelector(sel);

describe("Saroh Social locked (S1)", () => {
    it("points Grow at the add-on, with its price from the catalogue", () => {
        draw(
            <SocialLocked
                access={{
                    ...ON,
                    state: "locked",
                    plan: { id: "grow", name: "Grow" },
                    usage: null,
                }}
                price="₹99"
            />,
        );
        expect(q("[data-social-locked=grow]")).not.toBeNull();
        expect(text()).toContain(
            "Post to Instagram, Facebook and Threads from Saroh",
        );
        expect(text()).toContain("Add Saroh Social · ₹99 a month");
        expect(text()).toContain("Sharing from your phone is free");
    });

    it("points Free at the plan that has it", () => {
        draw(
            <SocialLocked
                access={{
                    ...ON,
                    state: "locked",
                    plan: { id: "free", name: "Free" },
                    upgradeTo: { planId: "pro", name: "Pro" },
                    usage: null,
                }}
                price={null}
            />,
        );
        expect(q("[data-social-locked=plan]")).not.toBeNull();
        expect(q("a[href*='plan=pro']")).not.toBeNull();
    });

    it("never draws it unlocked when the plan couldn't be checked", () => {
        draw(<SocialLocked access={null} price={null} />);
        expect(q("[role=alert]")).not.toBeNull();
        expect(text()).toContain("Couldn't check your plan. Try again.");
    });
});

describe("Channels (S2)", () => {
    const rows = [
        channel("INSTAGRAM", "CONNECTED", { heldPosts: 2 }),
        channel("FACEBOOK", "NEEDS_ATTENTION", {
            attention: { reason: "revoked", since: "2026-11-09T06:00:00.000Z" },
        }),
        channel("THREADS", "NOT_CONNECTED"),
    ];

    it("draws three fixed rows, each with its state and one action", () => {
        draw(
            <ChannelsView
                channels={{ ok: true, data: rows }}
                canPost
                params={PARAMS}
                pages={null}
            />,
        );
        expect(
            Array.from(
                document.querySelectorAll<HTMLElement>("[data-channel]"),
                (r) => r.dataset.channelState,
            ),
        ).toEqual(["CONNECTED", "NEEDS_ATTENTION", "NOT_CONNECTED"]);
        expect(q("[data-channel=FACEBOOK]")?.textContent).toContain(
            "Facebook Page signed Saroh out on 9 Nov. Posts to it won't go out until you reconnect.",
        );
        expect(q("[data-connect=FACEBOOK]")?.textContent).toBe("Reconnect");
        expect(q("[data-connect=THREADS]")?.textContent).toBe(
            "Connect Threads",
        );
        expect(q("[data-connect=INSTAGRAM]")).toBeNull();
        expect(q("[data-post-held=INSTAGRAM]")?.textContent).toBe(
            "Post them now",
        );
    });

    it("offers nothing to press to someone who may only read", () => {
        draw(
            <ChannelsView
                channels={{ ok: true, data: rows }}
                canPost={false}
                params={PARAMS}
                pages={null}
            />,
        );
        expect(q("[data-connect]")).toBeNull();
        expect(q("[data-post-held]")).toBeNull();
    });

    it("says once how a connect came back", () => {
        draw(
            <ChannelsView
                channels={{ ok: true, data: rows }}
                canPost
                params={{ ...PARAMS, channel: "instagram", result: "personal" }}
                pages={null}
            />,
        );
        expect(q("[data-connect-result=personal]")?.textContent).toContain(
            "it's a personal account",
        );
    });

    it("says it couldn't read the channels, never that none are connected", () => {
        draw(
            <ChannelsView
                channels={{ ok: false }}
                canPost
                params={PARAMS}
                pages={null}
            />,
        );
        expect(q("[role=alert]")).not.toBeNull();
        expect(q("[data-channel]")).toBeNull();
    });

    it("asks which Page when the sign-in manages several", () => {
        draw(
            <ChannelsView
                channels={{ ok: true, data: rows }}
                canPost
                params={{
                    ...PARAMS,
                    channel: "facebook",
                    result: "choose",
                    choice: "c1",
                }}
                pages={{
                    ok: true,
                    data: [
                        { id: "page-1", name: "Chai & Crumb", avatarUrl: null },
                        {
                            id: "page-2",
                            name: "Chai & Crumb 2",
                            avatarUrl: null,
                        },
                    ],
                }}
            />,
        );
        expect(text()).toContain("Pick the Page Saroh posts to");
        expect(document.querySelectorAll("[role=radio]")).toHaveLength(2);
    });
});

const post = (
    id: string,
    status: SocialPost["status"],
    publishAt: string | null,
): SocialPost => ({
    id,
    status,
    sourceKind: "product",
    sourceRef: "x",
    title: `Post ${id}`,
    picture: {
        kind: "card",
        cardStyle: "price",
        size: "post",
        headline: null,
        mediaId: null,
        imageUrl: null,
    },
    caption: "",
    captions: {},
    linkPath: "/",
    ref: "social-abcdefghij",
    publishAt,
    zone: "Asia/Kolkata",
    channels: [
        {
            kind: "INSTAGRAM",
            status: status === "DONE" ? "POSTED" : "WAITING",
            reason: null,
            retryAfter: null,
            permalink: null,
            postedAt: null,
        },
    ],
    canEdit: status === "DRAFT",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
});

describe("Posts (S3, S8)", () => {
    it("with no channel, offers the three connects in place", () => {
        draw(
            <PostsView
                access={ON}
                channels={[
                    channel("INSTAGRAM", "NOT_CONNECTED"),
                    channel("FACEBOOK", "NOT_CONNECTED"),
                    channel("THREADS", "NOT_CONNECTED"),
                ]}
                channelsRead
                posts={{ ok: true, data: [] }}
                canPost
                narrow={false}
            />,
        );
        expect(q("[data-social-connect-first]")).not.toBeNull();
        expect(document.querySelectorAll("[data-connect]")).toHaveLength(3);
    });

    it("shows seven days and the posts by chip, a filter's empty in one line", () => {
        draw(
            <PostsView
                access={ON}
                channels={[channel("INSTAGRAM", "CONNECTED")]}
                channelsRead
                posts={{
                    ok: true,
                    data: [
                        post("d1", "DRAFT", null),
                        post("p1", "DONE", "2026-11-10T14:00:00.000Z"),
                    ],
                }}
                canPost
                narrow={false}
            />,
        );
        expect(document.querySelectorAll("[data-week-day]")).toHaveLength(7);
        expect(document.querySelectorAll("[data-social-post]")).toHaveLength(2);
        const failed = q("[data-chip=failed]") as HTMLElement;
        act(() => failed.click());
        expect(q("[data-chip-empty=failed]")?.textContent).toBe(
            "Every post went out.",
        );
    });

    it("says it couldn't read the posts, never that there are none", () => {
        draw(
            <PostsView
                access={ON}
                channels={[channel("INSTAGRAM", "CONNECTED")]}
                channelsRead
                posts={{ ok: false }}
                canPost
                narrow={false}
            />,
        );
        expect(q("[role=alert]")).not.toBeNull();
        expect(q("[data-week-day]")).toBeNull();
    });
});

/** The panel as Create post holds it. */
function Panel({
    social,
    text = "Fresh buns",
    story = false,
}: {
    social: SocialCompose;
    text?: string;
    story?: boolean;
}) {
    const sp = useSocialPost({
        social,
        base: () => ({ sourceKind: "product", sourceRef: "x", caption: text }),
        text,
        link: "https://rye.example.com/shop/x",
        zone: "Asia/Kolkata",
    });
    return (
        <SocialPostPanel
            social={social}
            post={sp}
            text={text}
            storySize={story}
            onShareYourself={() => undefined}
        />
    );
}

const COMPOSE: SocialCompose = {
    access: ON,
    channels: [
        channel("INSTAGRAM", "CONNECTED"),
        channel("FACEBOOK", "NEEDS_ATTENTION"),
        channel("THREADS", "CONNECTED"),
    ],
    channelsFailed: false,
    at: null,
    day: null,
};

describe("the composer's Post to and When (S4, S7)", () => {
    it("switches on the channels that work, and offers Reconnect for one that doesn't", () => {
        draw(<Panel social={COMPOSE} />);
        expect(
            q("[data-post-to=INSTAGRAM] [role=switch]")?.getAttribute(
                "aria-checked",
            ),
        ).toBe("true");
        expect(q("[data-post-to=FACEBOOK] [role=switch]")).toBeNull();
        expect(q("[data-post-to=FACEBOOK] [data-connect]")?.textContent).toBe(
            "Reconnect",
        );
        expect(q("[data-schedule-good]")?.textContent).toContain(
            "Schedule for",
        );
        expect(text()).toContain("12 of 100 posts this month");
    });

    it("warns when Threads would cut the caption", () => {
        draw(<Panel social={COMPOSE} text={"क".repeat(160)} />);
        expect(q("[data-threads-fit=cut]")).not.toBeNull();
    });

    it("won't post a story size", () => {
        draw(<Panel social={COMPOSE} story />);
        expect(text()).toContain("Saroh posts Post and Square sizes");
        expect((q("[data-post-now]") as HTMLButtonElement).disabled).toBe(true);
    });

    it("swaps When for the limit, with Request more, once the month is used", () => {
        draw(
            <Panel
                social={{
                    ...COMPOSE,
                    access: {
                        ...ON,
                        usage: {
                            ...(ON.usage ?? { requested: false, resetsAt: "" }),
                            used: 100,
                            limit: 100,
                        },
                    },
                }}
            />,
        );
        expect(q("[data-social-limit]")).not.toBeNull();
        expect(q("[data-post-now]")).toBeNull();
        expect(q("[data-request-more]")?.textContent).toBe("Request more");
    });
});

describe("a post's sheet (S5, S6)", () => {
    const partly: SocialPost = {
        ...post("x1", "PARTLY_DONE", "2026-11-12T14:00:00.000Z"),
        channels: [
            {
                kind: "INSTAGRAM",
                status: "FAILED",
                reason: "limit",
                retryAfter: "2026-11-13T10:40:00.000Z",
                permalink: null,
                postedAt: null,
            },
            {
                kind: "FACEBOOK",
                status: "POSTED",
                reason: null,
                retryAfter: null,
                permalink: "https://facebook.example.com/p/1",
                postedAt: "2026-11-12T14:00:05.000Z",
            },
        ],
    };

    it("fixes only the channel that didn't post, with its reason, and reads its results", async () => {
        actions.postResults.mockResolvedValue({
            ok: true,
            data: {
                visits: 0,
                paid: 0,
                from: null,
                to: "2026-11-18T00:00:00.000Z",
            },
        });
        await act(async () => {
            await Promise.resolve();
            root.render(
                <PostSheet
                    post={partly}
                    access={ON}
                    channels={[channel("INSTAGRAM", "CONNECTED")]}
                    canPost
                    narrow={false}
                    onClose={() => undefined}
                />,
            );
        });
        expect(q("[data-post-partly]")?.textContent).toBe(
            "Posted to Facebook. Instagram didn't post.",
        );
        expect(
            q("[data-delivery=INSTAGRAM] [data-delivery-reason=limit]")
                ?.textContent,
        ).toContain(
            "Instagram's daily limit for your account was reached. Post it after",
        );
        expect(q("[data-delivery=FACEBOOK] a")?.getAttribute("href")).toBe(
            "https://facebook.example.com/p/1",
        );
        expect(q("[data-post-action=again]")?.textContent).toBe("Try again");
        expect(q("[data-post-action=delete]")?.textContent).toBe(
            "Remove from Saroh",
        );
        expect(q("[data-post-results]")?.textContent).toContain("Nothing yet");
    });

    it("says results couldn't be read, never 0", async () => {
        actions.postResults.mockResolvedValue({ ok: false });
        await act(async () => {
            await Promise.resolve();
            root.render(
                <PostSheet
                    post={partly}
                    access={ON}
                    channels={[]}
                    canPost={false}
                    narrow={false}
                    onClose={() => undefined}
                />,
            );
        });
        expect(q("[data-post-results] [role=alert]")).not.toBeNull();
        expect(q("[data-post-action]")).toBeNull();
    });
});
