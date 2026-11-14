// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CodeSample } from "./code-sample";

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const CODE = '# Two orders\ncurl "https://api.example.com/v1/orders"';

function clipboard(writeText: (s: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
}

describe("CodeSample", () => {
    it("shows the code as text, its comment lines muted", () => {
        const { container } = render(
            <CodeSample code={CODE} title="Terminal" />,
        );
        expect(container.querySelector("code")?.textContent).toBe(
            CODE.replace("\n", ""),
        );
        expect(screen.getByText("# Two orders").className).toContain(
            "text-mk-on-ink-muted",
        );
    });

    it("copies the whole sample and says so", async () => {
        const writeText = vi.fn(() => Promise.resolve());
        clipboard(writeText);
        render(<CodeSample code={CODE} title="Terminal" />);
        const button = screen.getByRole("button", {
            name: "Copy terminal code",
        });
        await act(() => {
            fireEvent.click(button);
            return Promise.resolve();
        });
        expect(writeText).toHaveBeenCalledWith(CODE);
        expect(button.textContent).toBe("Copied");
    });

    it("selects the code to copy by hand when the clipboard is refused", async () => {
        clipboard(() => Promise.reject(new Error("denied")));
        const { container } = render(
            <CodeSample code={CODE} title="Terminal" />,
        );
        await act(() => {
            fireEvent.click(screen.getByRole("button"));
            return Promise.resolve();
        });
        expect(window.getSelection()?.toString()).toContain("curl");
        expect(container.textContent).toContain("copy it by hand");
        expect(screen.getByRole("button").textContent).toBe("Copy");
    });
});
