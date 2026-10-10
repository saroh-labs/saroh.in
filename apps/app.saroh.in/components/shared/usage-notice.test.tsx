// @vitest-environment jsdom
/**
 * Nobody is recorded before they have been told (DEC-125, owner 10 Oct):
 * the recorder waits until the one-time notice is on screen, or was
 * dismissed on an earlier visit.
 *
 * The tracker is the real one from `@saroh/error-tracking/browser`, with
 * the SDK and the recorder replaced by spies, so "nothing was loaded" is
 * what is checked, not only "nothing was started".
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetUsageNoticeOnScreen } from "@/lib/usage-sharing/notice-on-screen";
import { USAGE_NOTICE } from "@/lib/usage-sharing/sharing";

const spies = vi.hoisted(() => ({
    load: vi.fn(),
    loadRecorder: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dismiss: vi.fn(),
    showError: vi.fn(),
    /** Whether the notice was on screen each time the recorder was fetched. */
    noticeOnScreenAtLoad: [] as boolean[],
}));

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
vi.mock("@saroh/ui/toast", () => ({ showError: spies.showError }));
vi.mock("@/lib/usage-sharing/actions", () => ({
    dismissUsageNotice: spies.dismiss,
}));
vi.mock("@/lib/error-tracking-browser", async () => {
    const { createBrowserTracking } =
        await import("@saroh/error-tracking/browser");
    const sdk = {
        init: () => ({
            captureException: vi.fn(),
            startSessionRecording: spies.start,
            stopSessionRecording: spies.stop,
        }),
    };
    return {
        browserTracking: createBrowserTracking({
            key: "phc_test",
            app: "application",
            environment: "production",
            load: spies.load.mockImplementation(() =>
                Promise.resolve({ default: sdk }),
            ),
            loadRecorder: spies.loadRecorder.mockImplementation(() => {
                spies.noticeOnScreenAtLoad.push(
                    document.querySelector("[data-testid='usage-notice']") !==
                        null,
                );
                return Promise.resolve({});
            }),
            replay: "on",
        }),
    };
});

import { UsageNotice } from "./usage-notice";
import { WorkspaceTracking } from "./workspace-tracking";

let root: Root;
let host: HTMLDivElement;

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const notice = () => document.querySelector("[data-testid='usage-notice']");

function Page({
    noticeDue,
    noticeSeen,
    sharesUsage = true,
}: {
    noticeDue: boolean;
    noticeSeen: boolean;
    sharesUsage?: boolean;
}) {
    return (
        <>
            {noticeDue ? <UsageNotice /> : null}
            <WorkspaceTracking
                userId="user_1"
                organizationId="org_1"
                sharesUsage={sharesUsage}
                noticeSeen={noticeSeen}
            />
        </>
    );
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resetUsageNoticeOnScreen();
    for (const spy of [
        spies.load,
        spies.loadRecorder,
        spies.start,
        spies.stop,
        spies.dismiss,
        spies.showError,
    ])
        spy.mockClear();
    spies.noticeOnScreenAtLoad.length = 0;
    spies.dismiss.mockResolvedValue({ ok: true, data: {} });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    act(() => root.unmount());
    await settle();
    document.body.innerHTML = "";
});

describe("the notice comes before the recording", () => {
    it("records nothing, and loads nothing, while the notice has not been shown", async () => {
        // Not seen before, and (a failed read, say) not on screen either.
        act(() => root.render(<Page noticeDue={false} noticeSeen={false} />));
        await settle();
        expect(notice()).toBeNull();
        expect(spies.load).not.toHaveBeenCalled();
        expect(spies.loadRecorder).not.toHaveBeenCalled();
        expect(spies.start).not.toHaveBeenCalled();
    });

    it("starts once the notice is on screen, never before it", async () => {
        act(() => root.render(<Page noticeDue noticeSeen={false} />));
        await settle();
        expect(notice()).not.toBeNull();
        expect(spies.start).toHaveBeenCalledTimes(1);
        // The recorder was fetched only with the notice already drawn.
        expect(spies.noticeOnScreenAtLoad).toEqual([true]);
    });

    it("says what the owner wrote, with the way to turn it off", () => {
        act(() => root.render(<Page noticeDue noticeSeen={false} />));
        expect(notice()?.textContent).toBe(
            "We record how the workspace is used to make Saroh easier. Your customers' details and anything you type are hidden. Turn it off in Settings › Your profile.Got it",
        );
        const link = notice()?.querySelector("a");
        expect(link?.getAttribute("href")).toBe("/settings/profile");
        expect(link?.textContent).toBe(USAGE_NOTICE.settings);
        expect(notice()?.getAttribute("role")).toBe("status");
    });

    it("starts without a notice for someone who dismissed it on an earlier visit", async () => {
        act(() => root.render(<Page noticeDue={false} noticeSeen />));
        await settle();
        expect(notice()).toBeNull();
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("never starts for someone who turned sharing off, notice or not", async () => {
        act(() =>
            root.render(<Page noticeDue noticeSeen sharesUsage={false} />),
        );
        await settle();
        expect(spies.loadRecorder).not.toHaveBeenCalled();
        expect(spies.start).not.toHaveBeenCalled();
    });

    it("goes when dismissed, keeps that on their account, and the recording carries on", async () => {
        act(() => root.render(<Page noticeDue noticeSeen={false} />));
        await settle();
        const button = notice()?.querySelector("button");
        expect(button?.textContent).toBe("Got it");
        await act(async () => {
            button?.click();
            await Promise.resolve();
        });
        await settle();
        expect(spies.dismiss).toHaveBeenCalledTimes(1);
        expect(notice()).toBeNull();
        expect(spies.stop).not.toHaveBeenCalled();
        expect(spies.start).toHaveBeenCalledTimes(1);
    });

    it("comes back, and says so, when the dismissal could not be kept", async () => {
        spies.dismiss.mockResolvedValue({ ok: false, error: "nope" });
        act(() => root.render(<Page noticeDue noticeSeen={false} />));
        await settle();
        await act(async () => {
            notice()?.querySelector("button")?.click();
            await Promise.resolve();
        });
        await settle();
        expect(notice()).not.toBeNull();
        expect(spies.showError).toHaveBeenCalledTimes(1);
    });
});
