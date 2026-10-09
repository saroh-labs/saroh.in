import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UnseenLinkNote } from "./unseen-link";

/**
 * A pay link out that this tab can't show (UX-048, owner 8 Oct: the API
 * keeps only its hash): the drawer and the Payment panel say why, and that
 * a new link ends the old one, before anything is pressed.
 */
describe("UnseenLinkNote", () => {
    it("says the address is shown only when made, and a new link ends the old one", () => {
        const html = renderToStaticMarkup(<UnseenLinkNote sendable={false} />);
        expect(html).toContain("A pay link is out and still works.");
        expect(html).toContain("shown only once, when it&#x27;s made");
        expect(html).toContain("here or on another device");
        expect(html).toContain("Making a new link ends the old one.");
        expect(html).not.toContain("sending the invoice");
    });

    it("names sending as ending it too where the invoice can be sent", () => {
        const html = renderToStaticMarkup(
            <UnseenLinkNote sendable className="mt-2" />,
        );
        expect(html).toContain(
            "Making a new link, or sending the invoice, ends the old one.",
        );
        expect(html).toContain("mt-2");
    });

    it("names the day the link was made when the API says (#870)", () => {
        const html = renderToStaticMarkup(
            <UnseenLinkNote
                sendable={false}
                madeAt="2026-10-08T09:00:00.000Z"
            />,
        );
        // The server snapshot writes it in UTC; the browser corrects it.
        expect(html).toContain(
            'A pay link was made on <time dateTime="2026-10-08T09:00:00.000Z">8 Oct 2026</time> and still works.',
        );
        expect(html).toContain("shown only once, when it&#x27;s made");
        expect(html).toContain("Making a new link ends the old one.");
        expect(html).not.toContain("{date}");
        expect(html).not.toContain("is out and still works");
    });

    it("keeps today's words when the date isn't known", () => {
        const html = renderToStaticMarkup(
            <UnseenLinkNote sendable={false} madeAt={null} />,
        );
        expect(html).toContain("A pay link is out and still works.");
        expect(html).not.toContain("<time");
    });
});
