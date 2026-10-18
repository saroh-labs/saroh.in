import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ABSENT_MARK, absentText, isAbsentText } from "../../lib/absent";
import { AbsentOr, AbsentValue } from "./absent-value";
import { Badge } from "./badge";
import {
    COPIED_MS,
    CopyButton,
    copyFailedMessage,
    copyText,
    ShareLink,
} from "./copy-button";
import { CountBadge } from "./count-badge";
import { IconButton } from "./icon-button";
import { Notice } from "./notice";
import { doneOf, ProgressBar } from "./progress-bar";
import { TextLink } from "./text-link";

/**
 * The small shared pieces (UX consistency, wave B): each replaces a look
 * every screen had drawn for itself. What is pinned is what a screen can no
 * longer get wrong: the name a screen reader hears, the role, the keyboard,
 * and that none of them is Saffron.
 */

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("not found");
    return value;
}

/** A press whose handler is async: let its promises settle inside `act`. */
async function press(el: Element) {
    await act(async () => {
        fireEvent.click(el);
        await Promise.resolve();
    });
}

describe("Badge", () => {
    it("is a span that says its status in words, with no hover, focus ring or transition", () => {
        render(<Badge variant="success">Live</Badge>);
        const badge = screen.getByText("Live");
        expect(badge.tagName).toBe("SPAN");
        expect(badge.className).not.toMatch(/hover:|focus|transition/);
        expect(badge).not.toHaveAttribute("tabindex");
    });

    it.each(["default", "secondary", "destructive"] as const)(
        "%s has no hover either",
        (variant) => {
            render(<Badge variant={variant}>Paid</Badge>);
            expect(screen.getByText("Paid").className).not.toMatch(/hover:/);
        },
    );

    it("has an 11px size and a dot that is not announced", () => {
        const { container } = render(
            <Badge variant="warning" size="sm" dot>
                Paused
            </Badge>,
        );
        expect(classes(screen.getByText("Paused"))).toContain("text-[11px]");
        const dot = container.querySelector("[data-badge-dot]");
        expect(dot).toHaveAttribute("aria-hidden");
        expect(classes(must(dot))).toContain("bg-current");
    });

    it("draft is neutral, not Saffron", () => {
        render(<Badge variant="draft">Draft</Badge>);
        expect(screen.getByText("Draft").className).not.toMatch(
            /brand|highlight/,
        );
    });

    it("never sets uppercase", () => {
        render(<Badge>Paid</Badge>);
        expect(screen.getByText("Paid").className).not.toMatch(/uppercase/);
    });
});

describe("AbsentValue", () => {
    it("draws a muted dash the eye sees and a word a screen reader hears", () => {
        const { container } = render(<AbsentValue says="Not set" />);
        const el = must(container.querySelector("[data-absent]"));
        expect(classes(el)).toContain("text-muted-foreground");
        const [dash, words] = Array.from(el.children);
        expect(dash).toHaveTextContent(ABSENT_MARK);
        expect(dash).toHaveAttribute("aria-hidden", "true");
        expect(words).toHaveTextContent("Not set");
        expect(classes(must(words))).toContain("sr-only");
        // Saroh's own mark, never a record's data.
        expect(el).toHaveAttribute("data-ph-unmask");
    });

    it('says "None" unless told otherwise', () => {
        render(<AbsentValue />);
        expect(screen.getByText("None")).toBeInTheDocument();
    });

    it("the string twin is the same dash", () => {
        expect(absentText()).toBe(ABSENT_MARK);
        expect(ABSENT_MARK).toBe("\u2014");
        expect(isAbsentText(absentText())).toBe(true);
        expect(isAbsentText(null)).toBe(true);
        expect(isAbsentText("")).toBe(true);
        expect(isAbsentText("0")).toBe(false);
        expect(isAbsentText(0)).toBe(false);
    });

    it("AbsentOr draws what it is given, or the dash for nothing", () => {
        const { container, rerender } = render(
            <AbsentOr says="Not known">12 Oct</AbsentOr>,
        );
        expect(container).toHaveTextContent("12 Oct");
        expect(container.querySelector("[data-absent]")).toBeNull();
        for (const nothing of [null, undefined, "", absentText()]) {
            rerender(<AbsentOr says="Not known">{nothing}</AbsentOr>);
            expect(container.querySelector("[data-absent]")).not.toBeNull();
            expect(screen.getByText("Not known")).toBeInTheDocument();
        }
        rerender(<AbsentOr>{0}</AbsentOr>);
        expect(container).toHaveTextContent("0");
    });
});

describe("CountBadge", () => {
    it("shows the number, capped where asked", () => {
        const { rerender } = render(<CountBadge count={7} />);
        expect(screen.getByText("7")).toBeInTheDocument();
        rerender(<CountBadge count={140} max={99} />);
        expect(screen.getByText("99+")).toBeInTheDocument();
    });

    it("draws a count that could not be read as a dash named unknown, never 0", () => {
        render(<CountBadge count={null} />);
        expect(screen.getByLabelText("count unknown")).toHaveTextContent("—");
        expect(screen.queryByText("0")).toBeNull();
    });

    it("waiting work is Ink and trouble is the destructive tint, never Saffron", () => {
        const { rerender, container } = render(
            <CountBadge count={3} tone="strong" />,
        );
        const el = () => must(container.querySelector("[data-count-badge]"));
        expect(classes(el())).toContain("bg-primary");
        rerender(<CountBadge count={3} tone="danger" />);
        expect(classes(el())).toContain("bg-destructive-subtle");
        expect(el().className).not.toMatch(/brand|highlight/);
        expect(classes(el())).toContain("text-[11px]");
    });

    it("a plain tally is neutral and needs no name of its own", () => {
        const { container } = render(<CountBadge count={12} />);
        const el = must(container.querySelector("[data-count-badge]"));
        expect(el).toHaveAttribute("data-tone", "neutral");
        expect(classes(el)).toContain("bg-muted");
        expect(el).not.toHaveAttribute("aria-label");
    });

    it("an attention count says what it means: colour alone tells nobody", () => {
        const { rerender } = render(
            <CountBadge count={4} tone="strong" says="need you" />,
        );
        expect(screen.getByLabelText("4 need you")).toHaveTextContent("4");
        rerender(<CountBadge count={2} tone="danger" says="overdue" />);
        expect(screen.getByLabelText("2 overdue")).toHaveAttribute(
            "data-tone",
            "danger",
        );
        // A neutral count never borrows the words.
        rerender(<CountBadge count={2} tone="neutral" says="overdue" />);
        expect(screen.queryByLabelText("2 overdue")).toBeNull();
    });

    it("takes a few words too", () => {
        render(<CountBadge count="2 need you" tone="strong" />);
        expect(screen.getByText("2 need you")).toBeInTheDocument();
    });
});

describe("Notice", () => {
    it.each([
        ["error", "alert"],
        ["warning", "status"],
        ["info", "status"],
        ["success", "status"],
        ["neutral", "note"],
    ] as const)("%s is announced as %s", (tone, role) => {
        render(<Notice tone={tone}>Something to know.</Notice>);
        expect(screen.getByRole(role)).toHaveTextContent("Something to know.");
    });

    it("takes a role of the caller's, or none", () => {
        const { rerender } = render(
            <Notice tone="error" role="status">
                Saved elsewhere.
            </Notice>,
        );
        expect(screen.getByRole("status")).toBeInTheDocument();
        rerender(
            <Notice tone="error" role="none">
                Saved elsewhere.
            </Notice>,
        );
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
    });

    it("shows a title, the words and an action, with a glyph that is not announced", () => {
        const { container } = render(
            <Notice
                tone="warning"
                title="Payments are off"
                action={<button type="button">Turn on</button>}
            >
                Customers can't pay online yet.
            </Notice>,
        );
        expect(screen.getByText("Payments are off")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Turn on" }),
        ).toBeInTheDocument();
        expect(container.querySelector("svg")?.parentElement).toHaveAttribute(
            "aria-hidden",
        );
    });

    it("can go without a glyph", () => {
        const { container } = render(<Notice icon={false}>Plain.</Notice>);
        expect(container.querySelector("svg")).toBeNull();
    });

    it.each(["info", "warning", "error", "success", "neutral"] as const)(
        "%s uses a subtle pair, never an alpha tint or Saffron",
        (tone) => {
            render(<Notice tone={tone}>Words.</Notice>);
            const el = must(document.querySelector(`[data-notice="${tone}"]`));
            expect(el.className).not.toMatch(/\/\d|brand|highlight/);
        },
    );

    it("is a card by default and a banner edge to edge", () => {
        const { rerender } = render(<Notice>Words.</Notice>);
        const el = () => must(document.querySelector("[data-notice]"));
        expect(classes(el())).toContain("rounded-lg");
        rerender(<Notice layout="banner">Words.</Notice>);
        expect(classes(el())).not.toContain("rounded-lg");
        expect(classes(el())).toContain("border-b");
    });
});

describe("TextLink", () => {
    it("is an in-app link: Ink, underlined at rest, with a focus ring", () => {
        render(<TextLink href="/orders">See orders</TextLink>);
        const link = screen.getByRole("link", { name: "See orders" });
        expect(link).toHaveAttribute("href", "/orders");
        const c = classes(link);
        expect(c).toContain("underline");
        expect(c).toContain("text-foreground");
        expect(c).toContain("focus-visible:ring-2");
        expect(link.className).not.toMatch(/brand|highlight/);
        expect(link).not.toHaveAttribute("target");
    });

    it("external opens a new tab safely and says so", () => {
        const { container } = render(
            <TextLink href="https://example.com" external>
                Read the guide
            </TextLink>,
        );
        const link = screen.getByRole("link", {
            name: "Read the guide (opens in a new tab)",
        });
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
        expect(container.querySelector("svg")).toHaveAttribute("aria-hidden");
    });

    it("with onClick alone it is a button that reads as a link", () => {
        const onClick = vi.fn();
        render(<TextLink onClick={onClick}>Change</TextLink>);
        const button = screen.getByRole("button", { name: "Change" });
        expect(button).toHaveAttribute("type", "button");
        fireEvent.click(button);
        expect(onClick).toHaveBeenCalled();
        expect(classes(button)).toContain("underline");
    });

    it("muted is the secondary text colour, still underlined", () => {
        render(
            <TextLink href="/help" tone="muted">
                Help
            </TextLink>,
        );
        const c = classes(screen.getByRole("link", { name: "Help" }));
        expect(c).toContain("text-muted-foreground");
        expect(c).toContain("underline");
    });
});

describe("IconButton", () => {
    it("takes its accessible name from label and hides the glyph", () => {
        const { container } = render(
            <IconButton label="More actions" icon={<svg />} />,
        );
        const button = screen.getByRole("button", { name: "More actions" });
        expect(button).toHaveAttribute("type", "button");
        expect(button).not.toHaveAttribute("title");
        expect(container.querySelector("svg")?.parentElement).toHaveAttribute(
            "aria-hidden",
        );
    });

    it("shows the label as a tooltip on keyboard focus", async () => {
        render(<IconButton label="Edit" icon={<svg />} />);
        fireEvent.focus(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() =>
            expect(screen.getByRole("tooltip")).toHaveTextContent("Edit"),
        );
    });

    it("shows no tooltip for focus a press just moved there (a sheet opening)", async () => {
        render(<IconButton label="Previous product" icon={<svg />} />);
        // A click elsewhere opened a sheet, which then focused this button.
        fireEvent.pointerDown(document.body);
        fireEvent.focus(
            screen.getByRole("button", { name: "Previous product" }),
        );
        await new Promise((r) => setTimeout(r, 500));
        expect(screen.queryByRole("tooltip")).toBeNull();
    });

    it("is 44px on touch at every size, with the pointer, hover, pressed and ring", () => {
        for (const size of ["xs", "sm", "md"] as const) {
            const { unmount } = render(
                <IconButton label="Close" size={size} icon={<svg />} />,
            );
            const c = classes(screen.getByRole("button", { name: "Close" }));
            expect(c).toContain("coarse:size-11");
            expect(c).toContain("cursor-pointer");
            expect(c).toContain("focus-visible:ring-2");
            expect(c.some((x) => x.startsWith("hover:"))).toBe(true);
            expect(c.some((x) => x.startsWith("active:"))).toBe(true);
            unmount();
        }
    });

    it("draws a link that looks the same, and names a new tab", () => {
        const { rerender } = render(
            <IconButton label="Open order" href="/orders/1" icon={<svg />} />,
        );
        expect(
            screen.getByRole("link", { name: "Open order" }),
        ).toHaveAttribute("href", "/orders/1");
        rerender(
            <IconButton
                label="View site"
                href="https://example.com"
                external
                icon={<svg />}
            />,
        );
        const link = screen.getByRole("link", {
            name: "View site (opens in a new tab)",
        });
        expect(link).toHaveAttribute("target", "_blank");
    });

    it("passes disabled and onClick through", () => {
        const onClick = vi.fn();
        const { rerender } = render(
            <IconButton label="Delete" icon={<svg />} onClick={onClick} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(
            <IconButton
                label="Delete"
                icon={<svg />}
                onClick={onClick}
                disabled
            />,
        );
        expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    });
});

describe("ProgressBar", () => {
    it("is a progressbar named by its label, with the measured values", () => {
        render(<ProgressBar value={2} max={4} label={doneOf(2, 4)} />);
        const bar = screen.getByRole("progressbar", { name: "2 of 4 done" });
        expect(bar).toHaveAttribute("aria-valuenow", "2");
        expect(bar).toHaveAttribute("aria-valuemax", "4");
        expect(bar).toHaveAttribute("aria-valuemin", "0");
        expect((bar.firstElementChild as HTMLElement).style.width).toBe("50%");
    });

    it("clamps what it is given and survives a max of zero", () => {
        const { rerender } = render(
            <ProgressBar value={9} max={4} label="Over" />,
        );
        const fill = () =>
            screen.getByRole("progressbar").firstElementChild as HTMLElement;
        expect(fill().style.width).toBe("100%");
        rerender(<ProgressBar value={-2} max={4} label="Under" />);
        expect(fill().style.width).toBe("0%");
        rerender(<ProgressBar value={3} max={0} label="Nothing to do" />);
        expect(fill().style.width).toBe("0%");
    });

    it("fills in Ink by default, never Saffron, in two thicknesses", () => {
        const { rerender } = render(
            <ProgressBar value={1} max={2} label="Half" size="xs" />,
        );
        const bar = () => screen.getByRole("progressbar");
        expect(classes(bar())).toContain("h-1");
        expect(classes(must(bar().firstElementChild))).toContain(
            "bg-foreground",
        );
        rerender(<ProgressBar value={1} max={2} label="Half" size="sm" />);
        expect(classes(bar())).toContain("h-1.5");
        expect(bar().innerHTML).not.toMatch(/brand|highlight|transition-all/);
    });

    it("words a checklist's count one way", () => {
        expect(doneOf(2, 4)).toBe("2 of 4 done");
    });
});

describe("CopyButton", () => {
    const original = navigator.clipboard;
    const setClipboard = (writeText: (v: string) => Promise<void>) =>
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText },
            configurable: true,
        });
    afterEach(() => {
        Object.defineProperty(navigator, "clipboard", {
            value: original,
            configurable: true,
        });
        vi.useRealTimers();
    });

    it('says "Copied" in its own label for 1.6 seconds, then comes back', async () => {
        vi.useFakeTimers();
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        const onCopied = vi.fn();
        render(
            <CopyButton value="https://pay.example/1" onCopied={onCopied} />,
        );
        const button = screen.getByRole("button", { name: "Copy link" });
        await press(button);
        expect(writeText).toHaveBeenCalledWith("https://pay.example/1");
        expect(screen.getByRole("button", { name: "Copied" })).toBe(button);
        expect(onCopied).toHaveBeenCalledWith("https://pay.example/1");
        act(() => {
            vi.advanceTimersByTime(COPIED_MS - 1);
        });
        expect(button).toHaveTextContent("Copied");
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(button).toHaveTextContent("Copy link");
        expect(COPIED_MS).toBe(1600);
    });

    it("announces the swap politely", () => {
        setClipboard(vi.fn().mockResolvedValue(undefined));
        render(<CopyButton value="x" />);
        const label = screen.getByText("Copy link");
        expect(label).toHaveAttribute("aria-live", "polite");
    });

    it("on failure says one sentence and shows the link selected", async () => {
        setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
        const onCopied = vi.fn();
        render(
            <CopyButton value="https://pay.example/1" onCopied={onCopied} />,
        );
        await press(screen.getByRole("button", { name: "Copy link" }));
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Couldn't copy the link. Select it and copy it instead.",
        );
        const shown = screen.getByRole<HTMLInputElement>("textbox", {
            name: "The link",
        });
        expect(shown).toHaveValue("https://pay.example/1");
        expect(shown).toHaveAttribute("readonly");
        expect(shown.selectionStart).toBe(0);
        expect(shown.selectionEnd).toBe("https://pay.example/1".length);
        expect(onCopied).not.toHaveBeenCalled();
        // The button is still there to try again.
        expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled();
    });

    it("names what it copies in the label and the failure", async () => {
        setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
        render(<CopyButton value="SAVE10" label="Copy code" thing="code" />);
        await press(screen.getByRole("button", { name: "Copy code" }));
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Couldn't copy the code. Select it and copy it instead.",
        );
        expect(copyFailedMessage()).toBe(
            "Couldn't copy the link. Select it and copy it instead.",
        );
    });

    it("copies a value made on the press, and does nothing when it couldn't be made", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        setClipboard(writeText);
        const make = vi
            .fn<() => Promise<string | null>>()
            .mockResolvedValueOnce("https://pay.example/new")
            .mockResolvedValueOnce(null);
        render(<CopyButton value={make} />);
        await press(screen.getByRole("button", { name: "Copy link" }));
        expect(writeText).toHaveBeenCalledWith("https://pay.example/new");
        await press(screen.getByRole("button"));
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("copyText never throws: false without a clipboard", async () => {
        Object.defineProperty(navigator, "clipboard", {
            value: undefined,
            configurable: true,
        });
        await expect(copyText("x")).resolves.toBe(false);
    });
});

describe("ShareLink", () => {
    const original = navigator.clipboard;
    const coarse = (matches: boolean) => {
        window.matchMedia = vi.fn().mockReturnValue({ matches }) as never;
    };
    afterEach(() => {
        Object.defineProperty(navigator, "share", {
            value: undefined,
            configurable: true,
        });
        Object.defineProperty(navigator, "clipboard", {
            value: original,
            configurable: true,
        });
    });

    it("is the copy button at a desk, even where the browser can share", () => {
        coarse(false);
        Object.defineProperty(navigator, "share", {
            value: vi.fn(),
            configurable: true,
        });
        render(<ShareLink value="https://shop.example" />);
        expect(
            screen.getByRole("button", { name: "Copy link" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    });

    it("is the copy button on a phone that can't share", () => {
        coarse(true);
        render(<ShareLink value="https://shop.example" />);
        expect(
            screen.getByRole("button", { name: "Copy link" }),
        ).toBeInTheDocument();
    });

    it("opens the share sheet on a phone, with the link and its line", async () => {
        coarse(true);
        const share = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "share", {
            value: share,
            configurable: true,
        });
        render(
            <ShareLink
                value="https://pay.example/1"
                text="Pay for order 1042"
                title="Rye & Co."
            />,
        );
        await press(screen.getByRole("button", { name: "Share" }));
        expect(share).toHaveBeenCalledWith({
            url: "https://pay.example/1",
            text: "Pay for order 1042",
            title: "Rye & Co.",
        });
    });

    it("closing the sheet is not a failure, but a refusal falls back to copy", async () => {
        coarse(true);
        const share = vi
            .fn()
            .mockRejectedValueOnce(new DOMException("closed", "AbortError"))
            .mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
        Object.defineProperty(navigator, "share", {
            value: share,
            configurable: true,
        });
        render(<ShareLink value="https://pay.example/1" />);
        await press(screen.getByRole("button", { name: "Share" }));
        expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
        await press(screen.getByRole("button", { name: "Share" }));
        expect(
            screen.getByRole("button", { name: "Copy link" }),
        ).toBeInTheDocument();
    });
});
