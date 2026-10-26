// The free tools (#1253): every tool page in the code renders with its tool,
// the shared email gate goes locked → sending → sent or error, and every
// tool passes its own checks.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolPage } from "./components/tool-page";
import { ToolsHub } from "./components/tools-hub";
import { allToolPages, listSearchPages, loadToolPage } from "./load";
import { unknownClasses } from "./test-classes";
import { toolChecks } from "./tool-checks";
import { TOOL_GROUPS } from "./tool-schema";
import { EmailGate, emailProblem, ToolGateProvider } from "./tools/email-gate";
import { TOOLS } from "./tools/registry";

afterEach(cleanup);

const BUILT = allToolPages().filter((p) => !p.inApp);
describe("the registry and the content agree", () => {
    it("every tool built here has a component, and every component a file", () => {
        expect(Object.keys(TOOLS).sort()).toEqual(
            BUILT.map((p) => p.slug).sort(),
        );
    });

    it.each(allToolPages().map((p) => [p.slug, p] as const))(
        "%s passes every check",
        (_, p) => {
            expect(toolChecks(p).filter((c) => !c.ok)).toEqual([]);
        },
    );

    it("fails the checks a broken tool page would", () => {
        const p = loadToolPage("no-show-cost-calculator");
        if (!p) throw new Error("no-show-cost-calculator is missing");
        const failed = toolChecks({
            ...p,
            slug: "nope",
            questions: [],
            title: `${p.title} for every small business in India`,
            description: "Something else entirely.",
            ctaLine: "Write to owner@gmail.com, GSTIN 27ABCDE1234F1Z5.",
        })
            .filter((c) => !c.ok)
            .map((c) => c.id);
        expect(failed).toEqual([
            "component",
            "faq",
            "sample-emails",
            "sample-gstin",
            "seo-title",
            "seo-description",
        ]);
    });
});

describe("<ToolPage>", () => {
    it.each(BUILT.map((p) => [p.slug, p] as const))(
        "%s renders its tool, one h1, headings in order and only known classes",
        async (_, p) => {
            const { container } = render(
                <ToolPage
                    page={p}
                    links={{ home: "/", hub: "/tools", startFree: "/start" }}
                />,
            );
            // The tool is lazy: wait for its form.
            await screen.findByRole("form");
            expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(
                1,
            );
            const levels = [...container.querySelectorAll("h1,h2,h3")].map(
                (h) => Number(h.tagName[1]),
            );
            levels.forEach(
                (l, i) =>
                    i > 0 &&
                    expect(l - (levels[i - 1] ?? 0)).toBeLessThanOrEqual(1),
            );
            const crumb = screen.getByRole("navigation", {
                name: "Breadcrumb",
            });
            expect(
                within(crumb)
                    .getByRole("link", { name: "Free tools" })
                    .getAttribute("href"),
            ).toBe("/tools");
            expect(
                screen
                    .getByRole("link", { name: "Start free" })
                    .getAttribute("href"),
            ).toBe("/start");
            for (const q of p.questions)
                expect(screen.getByText(q.question)).toBeTruthy();
            expect(screen.queryByText(/Draft/)).toBeNull();
            expect(unknownClasses(container)).toEqual([]);
        },
    );

    it("draws nothing navigable without links (the admin preview), and says when it's a draft", async () => {
        const p = loadToolPage("no-show-cost-calculator");
        if (!p) throw new Error("no-show-cost-calculator is missing");
        const { container } = render(<ToolPage page={p} draft />);
        await screen.findByRole("form");
        expect(container.querySelectorAll("a[href]")).toHaveLength(0);
        expect(screen.getByText("Draft — not published yet")).toBeTruthy();
    });
});

describe("<EmailGate>", () => {
    it("checks the email before sending, then sends it alone and opens", async () => {
        const submit = vi.fn().mockResolvedValue({ ok: true });
        const { container } = render(
            <ToolGateProvider onSubmit={submit} privacy="/privacy">
                <EmailGate label="Get this as a PDF" button="Email it">
                    <button type="button">Print</button>
                </EmailGate>
            </ToolGateProvider>,
        );
        const email = screen.getByLabelText("Get this as a PDF");
        const send = screen.getByRole("button", { name: "Email it" });
        expect(screen.getByRole("link", { name: "Privacy" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Print" })).toBeNull();

        fireEvent.change(email, { target: { value: "ryestudio@example" } });
        fireEvent.click(send);
        expect(screen.getByRole("alert").textContent).toBe(
            "That email is missing its ending, like .com or .in.",
        );
        expect(submit).not.toHaveBeenCalled();

        fireEvent.change(email, {
            target: { value: " ryestudio@example.com " },
        });
        await act(() => Promise.resolve(fireEvent.click(send)));
        expect(submit).toHaveBeenCalledWith("ryestudio@example.com");
        expect(screen.getByRole("status").textContent).toBe(
            "✓ Sent to ryestudio@example.com",
        );
        expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
        expect(unknownClasses(container)).toEqual([]);

        fireEvent.click(
            screen.getByRole("button", { name: "Use another email" }),
        );
        expect(screen.getByRole("button", { name: "Email it" })).toBeTruthy();
    });

    it("says what went wrong and keeps the gate shut", async () => {
        render(
            <EmailGate
                label="Get it"
                button="Email it"
                onSubmit={() =>
                    Promise.resolve({ ok: false, reason: "rate-limited" })
                }
            />,
        );
        fireEvent.change(screen.getByLabelText("Get it"), {
            target: { value: "a@example.com" },
        });
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        expect(screen.getByRole("alert").textContent).toMatch(/a lot of tries/);
    });

    it("opens with no provider: the admin preview sends nothing", async () => {
        render(<EmailGate label="Get it" button="Email it" />);
        fireEvent.change(screen.getByLabelText("Get it"), {
            target: { value: "a@example.com" },
        });
        await act(() =>
            Promise.resolve(
                fireEvent.click(
                    screen.getByRole("button", { name: "Email it" }),
                ),
            ),
        );
        expect(screen.getByRole("status").textContent).toBe(
            "✓ Sent to a@example.com",
        );
    });

    it("names the problem with a typed email", () => {
        expect(emailProblem("")).toBe("Type your email first.");
        expect(emailProblem("a@b")).toMatch(/ending/);
        expect(emailProblem("a b@c.in")).toMatch(/incomplete/);
        expect(emailProblem("a@b.in")).toBeNull();
    });
});

describe("<ToolsHub>", () => {
    it("lists each tool in its section, as a card to open", () => {
        const { container } = render(
            <ToolsHub
                tools={listSearchPages({ kind: "tools" })}
                isNew={(t) => !t.inApp}
            />,
        );
        const money = screen
            .getByRole("heading", { name: "Money" })
            .closest("section");
        if (!money) throw new Error("no Money section");
        expect(
            within(money)
                .getByRole("link", { name: /No-show cost calculator/ })
                .getAttribute("href"),
        ).toBe("/tools/no-show-cost-calculator");
        expect(within(money).getAllByText("new").length).toBeGreaterThan(0);
        // A section with no tool in the code yet isn't drawn.
        const used = new Set(allToolPages().map((t) => t.group));
        for (const g of TOOL_GROUPS.filter((x) => !used.has(x)))
            expect(screen.queryByRole("heading", { name: g })).toBeNull();
        expect(unknownClasses(container)).toEqual([]);
    });
});
