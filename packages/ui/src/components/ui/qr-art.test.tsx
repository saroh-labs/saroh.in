import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emptyQrArt, qrArt } from "../../lib/qr-art";
import { QrArt } from "./qr-art";

function must<T>(value: T | null | undefined): T {
    if (value === null || value === undefined) throw new Error("missing");
    return value;
}

const LINK = "https://glow.saroh.app/q/h7c";

describe("QrArt", () => {
    it("is one image, named by what it opens", () => {
        const art = qrArt(LINK);
        render(
            <QrArt
                art={art}
                color="#1C1C1A"
                aria-label="QR code for your booking page"
                className="max-w-[280px]"
            />,
        );

        const svg = screen.getByRole("img", {
            name: "QR code for your booking page",
        });
        expect(svg.tagName.toLowerCase()).toBe("svg");
        expect(svg).toHaveAttribute("viewBox", art.viewBox);
        expect(svg).toHaveClass("aspect-square", "max-w-[280px]");

        const [dots, eyes] = Array.from(svg.querySelectorAll("path"));
        expect(dots).toHaveAttribute("d", art.dots);
        expect(dots).toHaveAttribute("fill", "#1C1C1A");
        expect(eyes).toHaveAttribute("d", art.eyes);
        expect(eyes).toHaveAttribute("fill-rule", "evenodd");
        // White ground under the quiet zone, whatever the theme.
        expect(svg.querySelector("rect")).toHaveAttribute("fill", "#FFFFFF");
    });

    it("plain has no logo box, even when handed a logo", () => {
        const { container } = render(
            <QrArt
                art={qrArt(LINK)}
                color="#1C1C1A"
                logo={{ initials: "GS" }}
                aria-label="QR code"
            />,
        );
        expect(container.querySelector("[data-qr-logo-box]")).toBeNull();
        expect(screen.queryByText("GS")).toBeNull();
    });

    it("branded shows the logo box with the initials", () => {
        const art = qrArt(LINK, { style: "branded", logo: true });
        const { container } = render(
            <QrArt
                art={art}
                color="#5C2A48"
                logo={{ initials: "GS" }}
                aria-label="QR code"
            />,
        );
        const box = container.querySelector("[data-qr-logo-box]");
        expect(box).not.toBeNull();
        const ground = must(must(box).querySelector("rect"));
        expect(ground).toHaveAttribute("width", String(must(art.logoBox).size));
        expect(ground).toHaveAttribute("fill", "#FFFFFF");
        expect(screen.getByText("GS")).toBeInTheDocument();
    });

    it("draws an image logo in the box, and an empty box without one", () => {
        const art = qrArt(LINK, { style: "branded", logo: true });
        const { container, rerender } = render(
            <QrArt
                art={art}
                color="#1C1C1A"
                logo={{ src: "data:image/png;base64,iVBORw0KGgo=" }}
                aria-label="QR code"
            />,
        );
        const image = must(container.querySelector("image"));
        expect(image).toHaveAttribute(
            "href",
            "data:image/png;base64,iVBORw0KGgo=",
        );
        expect(image).toHaveAttribute(
            "width",
            String(must(art.logoBox).size - 2),
        );

        rerender(<QrArt art={art} color="#1C1C1A" aria-label="QR code" />);
        expect(container.querySelector("image")).toBeNull();
        expect(container.querySelector("[data-qr-logo-box]")).not.toBeNull();
    });

    it("renders the empty art without breaking", () => {
        const { container } = render(
            <QrArt
                art={emptyQrArt()}
                color="#1C1C1A"
                aria-label="No code yet"
            />,
        );
        expect(screen.getByRole("img", { name: "No code yet" })).toBeVisible();
        expect(container.querySelector("[data-qr-art=empty]")).not.toBeNull();
    });
});
