import type { ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { deleteQuestion } from "@/lib/contacts/removal";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";

import { useMoreActions } from "./more-actions";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/contacts/actions", () => ({ deleteContact: vi.fn() }));
vi.mock("@/lib/customer-workspace/actions", () => ({}));

/**
 * The person page's delete confirm (#869) says what deleting them ends:
 * the page hands its words in, and without them the confirm still asks,
 * in the plain sentence.
 */

const d: CustomerDetail = {
    contact: {
        id: "c1",
        name: "Asha Rao",
        firstName: "Asha",
        lastName: "Rao",
        email: "asha@example.com",
        phone: null,
        company: null,
        source: null,
        createdAt: "2026-09-01T00:00:00Z",
    },
    money: true,
    timezone: "Asia/Kolkata",
    stats: {},
    notes: { from: "contact", rows: [], allergenChoices: [] },
    allergens: [],
    consent: null,
    unavailable: [],
};

interface Props {
    title?: unknown;
    description?: unknown;
}

/** The dialog in `dialogs` whose title asks to delete them. */
function deleteConfirm(dialogs: ReactNode): Props | undefined {
    let found: Props | undefined;
    const walk = (node: ReactNode) =>
        Children.forEach(node, (child) => {
            if (!isValidElement(child)) return;
            const props = (
                child as ReactElement<Props & { children?: ReactNode }>
            ).props;
            if (
                typeof props.title === "string" &&
                props.title.startsWith("Delete ")
            ) {
                found = props;
            }
            walk(props.children);
        });
    walk(dialogs);
    return found;
}

function confirmFor(deleteWords?: string): Props | undefined {
    let props: Props | undefined;
    function Probe() {
        const more = useMoreActions({
            d,
            name: d.contact.name,
            sells: false,
            canWrite: true,
            canMerge: false,
            canRemove: false,
            suggestions: [],
            duplicates: [],
            deleteWords,
        });
        props = deleteConfirm(more.dialogs);
        return null;
    }
    renderToStaticMarkup(<Probe />);
    return props;
}

describe("the delete confirm's words (#869)", () => {
    it("says what the page counted", () => {
        const words = deleteQuestion(2, {
            subscriptions: 1,
            packs: 0,
            courses: 0,
        });
        const confirm = confirmFor(words);
        expect(confirm?.title).toBe("Delete Asha Rao?");
        expect(confirm?.description).toBe(words);
        expect(confirm?.description).toContain(
            "Their notes and 2 leads go with them. Their subscription goes too.",
        );
    });

    it("still asks, in the plain sentence, when nothing was counted", () => {
        expect(confirmFor()?.description).toBe(deleteQuestion(null, {}));
    });
});
