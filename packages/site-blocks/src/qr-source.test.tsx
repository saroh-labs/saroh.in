import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import ServicesListSection from "./blocks/services-list";
import {
    qrSourceOf,
    readQrSource,
    useQrSource,
    withQrSource,
} from "./qr-source";

/**
 * The tag a QR code's scan leaves on the address (`?src=qr-<code>`): read
 * from the address only, carried on by the links into the booking page,
 * and never present in what the server draws.
 */

function openAt(address: string) {
    window.history.replaceState({}, "", address);
}

afterEach(() => openAt("/"));

describe("qrSourceOf", () => {
    it("reads a well-formed tag, lower-cased", () => {
        expect(qrSourceOf("?src=qr-h7c")).toBe("qr-h7c");
        expect(qrSourceOf("?service=svc_1&src=QR-H7C9")).toBe("qr-h7c9");
    });

    it("reads nothing from anything else", () => {
        for (const search of [
            "",
            "?service=svc_1",
            "?src=",
            "?src=newsletter",
            "?src=qr-",
            "?src=qr-ab",
            "?src=qr-toolong1",
            "?src=qr-h7c/../x",
            "?src=qr-h7c%20x",
            "?source=qr-h7c",
        ]) {
            expect(qrSourceOf(search), search).toBeNull();
        }
    });
});

describe("readQrSource", () => {
    it("reads the page's own address", () => {
        openAt("/book?src=qr-h7c");
        expect(readQrSource()).toBe("qr-h7c");
        openAt("/book");
        expect(readQrSource()).toBeNull();
    });
});

describe("withQrSource", () => {
    it("carries the tag on a link into the site, keeping its query", () => {
        expect(withQrSource("/book", "qr-h7c")).toBe("/book?src=qr-h7c");
        expect(withQrSource("/book?service=svc_1", "qr-h7c")).toBe(
            "/book?service=svc_1&src=qr-h7c",
        );
        expect(withQrSource("/book?service=svc_1#times", "qr-h7c")).toBe(
            "/book?service=svc_1&src=qr-h7c#times",
        );
    });

    it("leaves a link alone without a tag, and never tags another site", () => {
        expect(withQrSource("/book?service=svc_1", null)).toBe(
            "/book?service=svc_1",
        );
        expect(withQrSource("https://example.com/book", "qr-h7c")).toBe(
            "https://example.com/book",
        );
        expect(withQrSource("//example.com/book", "qr-h7c")).toBe(
            "//example.com/book",
        );
    });
});

const SERVICES = [
    {
        id: "svc_cut",
        name: "Haircut",
        description: null,
        durationMinutes: 30,
        priceCents: 50_000,
        currency: "INR",
    },
];

function List() {
    return (
        <ServicesListSection
            content={{
                heading: "Services",
                serviceIds: ["svc_cut"],
            }}
            services={SERVICES}
            bookHref="/book"
        />
    );
}

function Tag() {
    return <output>{useQrSource() ?? "none"}</output>;
}

describe("on a page a scan opened", () => {
    it("a service's link to the booking page carries the tag", () => {
        openAt("/services?src=qr-h7c");
        render(<List />);
        expect(
            screen.getByRole("link", { name: /Book Haircut/ }),
        ).toHaveAttribute("href", "/book?service=svc_cut&src=qr-h7c");
    });

    it("and is the plain link on any other page", () => {
        openAt("/services");
        render(<List />);
        expect(
            screen.getByRole("link", { name: /Book Haircut/ }),
        ).toHaveAttribute("href", "/book?service=svc_cut");
    });

    it("the server draws the same page with or without the tag", () => {
        // What the page cache keeps is the server's drawing: the tag is
        // read in the browser only, so no scan is ever in it.
        openAt("/services?src=qr-h7c");
        const tagged = renderToString(<List />);
        const tag = renderToString(<Tag />);
        openAt("/services");
        expect(renderToString(<List />)).toBe(tagged);
        expect(tagged).not.toContain("qr-h7c");
        expect(tag).toContain("none");
    });
});
