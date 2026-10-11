import type { RenderedEnquiry } from "@saroh/block-contract";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DetailsSheet, NoteSheet } from "./account/me-sheets";
import { AccountMessages } from "./account/messages";
import type { AccountView } from "./account/model";
import EnquirySection, { autoCompleteFor } from "./blocks/enquiry";
import { DetailsStep } from "./booking-flow/steps/details-step";
import { CodeField } from "./shop/code-field";

/**
 * A customer's phone: iOS Safari zooms the page when a field under 16px
 * takes focus, and the page stays zoomed. Every input, select and textarea
 * a merchant's site draws is 16px or more, with the keyboard and autofill
 * its field needs. The bag's address fields and the sign-in sheet's are
 * pinned beside their own tests (`shop.test.tsx`, `sign-in-sheet.test.tsx`);
 * a new control gets its line here.
 */

/** `text-base` and up, or an exact size of 16px or more. */
const BIG_ENOUGH =
    /(?:^|\s)text-(?:base|lg|xl|[2-9]xl|\[(?:1[6-9]|[2-9]\d)(?:\.\d+)?px\])(?:\s|$)/;
const TOO_SMALL =
    /(?:^|\s)text-(?:xs|sm|\[(?:\d|1[0-5])(?:\.\d+)?px\])(?:\s|$)/;

function controls(): Element[] {
    return Array.from(document.querySelectorAll("input, select, textarea"));
}

function expectBigEnough(count: number) {
    const found = controls();
    expect(found).toHaveLength(count);
    for (const control of found) {
        expect(control.className).toMatch(BIG_ENOUGH);
        expect(control.className).not.toMatch(TOO_SMALL);
    }
}

const ENQUIRY: RenderedEnquiry = {
    title: "Get in touch",
    formId: "form_1",
    fields: [
        { name: "name", label: "Your name", type: "text" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "company", label: "Company", type: "text" },
        { name: "message", label: "Message", type: "textarea" },
    ],
};

describe("form controls on a merchant's site are 16px or more", () => {
    it("the booking page's details: name, phone and the note", () => {
        render(
            <DetailsStep
                ids="b"
                business="Kavi Dental"
                // Signed in with no name yet: the one time a name is asked.
                customer={{ email: "new@example.com", name: null }}
                signingOut={false}
                onNotYou={() => undefined}
                name=""
                onName={() => undefined}
                phone=""
                onPhone={() => undefined}
                touched={false}
                asksWhere={false}
                where="IN_PERSON"
                note=""
                onWhere={() => undefined}
                onNote={() => undefined}
            />,
        );
        expectBigEnough(3);
        const [name, phone] = controls();
        expect(name).toHaveAttribute("autocomplete", "name");
        expect(phone).toHaveAttribute("type", "tel");
        expect(phone).toHaveAttribute("inputmode", "tel");
        expect(phone).toHaveAttribute("autocomplete", "tel");
    });

    it("the bag's discount code", () => {
        render(
            <CodeField
                site="s"
                open
                onOpen={() => undefined}
                value=""
                onChange={() => undefined}
                onApply={() => undefined}
                checking={false}
                applied={null}
                note={null}
            />,
        );
        expectBigEnough(1);
    });

    it("the enquiry form, which fills a name, an email and a phone", () => {
        render(<EnquirySection apiUrl="https://api.test" content={ENQUIRY} />);
        expectBigEnough(5);
        const [name, email, phone, company, message] = controls();
        expect(name).toHaveAttribute("autocomplete", "name");
        expect(email).toHaveAttribute("autocomplete", "email");
        expect(email).toHaveAttribute("type", "email");
        expect(phone).toHaveAttribute("autocomplete", "tel");
        expect(phone).toHaveAttribute("type", "tel");
        // Nothing is guessed for a field the form doesn't explain.
        expect(company).not.toHaveAttribute("autocomplete");
        expect(message).not.toHaveAttribute("autocomplete");
    });

    it("the enquiry form's message box for a signed-in customer", () => {
        render(
            <EnquirySection
                apiUrl="https://api.test"
                content={ENQUIRY}
                thread={{
                    businessName: "Kavi Dental",
                    customer: { email: "farah@example.in", name: "Farah" },
                    send: vi.fn(),
                    messagesHref: "/account/messages",
                }}
            />,
        );
        expectBigEnough(1);
    });

    it("the account's message box", () => {
        render(
            <AccountMessages
                businessName="Kavi Dental"
                thread={{ ok: true, value: { messages: [], earlier: false } }}
                api={{ send: vi.fn() }}
            />,
        );
        expectBigEnough(1);
    });

    it("the account's details and note sheets", () => {
        const account = {
            name: "Farah",
            email: "farah@example.in",
            phone: null,
            businessName: "Kavi Dental",
        } as AccountView;
        const { unmount } = render(
            <DetailsSheet
                open
                account={account}
                onClose={() => undefined}
                save={vi.fn()}
                onSaved={() => undefined}
            />,
        );
        expectBigEnough(2);
        const [name, phone] = controls();
        expect(name).toHaveAttribute("autocomplete", "name");
        expect(phone).toHaveAttribute("autocomplete", "tel");
        unmount();
        render(
            <NoteSheet
                open
                title="Add a note"
                placeholder="e.g. I take blood thinners"
                onClose={() => undefined}
                send={vi.fn()}
                onSent={() => undefined}
            />,
        );
        expectBigEnough(1);
    });
});

describe("autoCompleteFor", () => {
    it("goes by the field's type, and a name by what the form calls it", () => {
        expect(autoCompleteFor({ type: "email", name: "work" })).toBe("email");
        expect(autoCompleteFor({ type: "tel", name: "mobile" })).toBe("tel");
        expect(autoCompleteFor({ type: "text", name: "name" })).toBe("name");
        expect(autoCompleteFor({ type: "text", name: "Full name" })).toBe(
            "name",
        );
        expect(autoCompleteFor({ type: "text", name: "pet_name" })).toBe(
            undefined,
        );
        expect(autoCompleteFor({ type: "textarea", name: "name" })).toBe(
            undefined,
        );
    });
});
