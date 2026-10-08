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
});
