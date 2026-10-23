import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { IdentityLinkDialog } from "./identity-link-dialog";

vi.mock("@/lib/customer-workspace/actions", () => ({
    linkCustomerAction: vi.fn(),
}));
// The dialog's parts drawn in place: a portal draws nothing on the server.
vi.mock("@saroh/ui/dialog", () => {
    const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
    return {
        Dialog: Pass,
        DialogTrigger: Pass,
        DialogContent: Pass,
        DialogHeader: Pass,
        DialogTitle: Pass,
        DialogDescription: Pass,
    };
});

/**
 * "Link a commerce customer" on a phone (pre-launch polish P2): a long
 * email used to sit on one truncated line that set the row's width and
 * pushed Link off the screen. The address now wraps, whole, and the buttons
 * never shrink. Layout itself is `e2e/tests/phone-reflow.spec.ts`'s.
 */

const EMAIL = "aishwarya.venkataramansubramaniam@venkataramanhospitality.in";

const render = () =>
    renderToStaticMarkup(
        <IdentityLinkDialog
            contactId="c1"
            open
            onOpenChange={vi.fn()}
            onMerge={vi.fn()}
            suggestions={[
                {
                    kind: "customer",
                    customerId: "cu1",
                    name: "Aishwarya Lakshmi Venkataraman-Subramaniam",
                    email: EMAIL,
                    matchedOn: ["email"],
                },
            ]}
            duplicates={[
                {
                    kind: "contact",
                    contactId: "c2",
                    name: "Aishwarya L. V. Subramaniam",
                    email: EMAIL,
                    matchedOn: ["email"],
                    signsIn: false,
                },
            ]}
        />,
    );

/** The `<li>` that holds `text`. */
function rowWith(html: string, text: string): string {
    const rows = html.split("<li").slice(1);
    const row = rows.find((r) => r.includes(text));
    expect(row, `a row with ${text}`).toBeDefined();
    return row ?? "";
}

describe("IdentityLinkDialog on a phone", () => {
    it("shows the whole address, wrapping, never truncated", () => {
        const row = rowWith(render(), ">Link<");
        expect(row).toContain(EMAIL);
        expect(row).not.toContain("truncate");
        expect(row).toContain("[overflow-wrap:anywhere]");
    });

    it("keeps Link and Merge… their own width beside a long address", () => {
        const html = render();
        const link = rowWith(html, ">Link<");
        expect(link).toMatch(/class="[^"]*shrink-0[^"]*"[^>]*>Link</);
        const merge = rowWith(html, "Merge…");
        expect(merge).toMatch(/class="[^"]*shrink-0[^"]*"[^>]*>Merge…</);
        expect(merge).not.toContain("truncate");
    });
});
