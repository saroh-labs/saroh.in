// @vitest-environment jsdom
/**
 * A page form checks a field on leaving it, and on submit puts the keyboard
 * on the first field in error, a select the form library holds no ref for
 * included.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";

import { PAGE_FORM, toFirstError } from "./page-form";

const schema = z.object({
    kind: z.string().min(1, { message: "Choose a kind." }),
    name: z.string().min(1, { message: "Add a name." }),
});

function Sample({ onSave }: { onSave: () => void }) {
    const form = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        ...PAGE_FORM,
        defaultValues: { kind: "", name: "" },
    });
    const { errors } = form.formState;
    return (
        <form onSubmit={form.handleSubmit(onSave, toFirstError)} noValidate>
            {/* Not registered: a control the form library can't focus. */}
            <Field label="Kind" error={errors.kind?.message}>
                <button type="button">Pick a kind</button>
            </Field>
            <Field label="Name" error={errors.name?.message}>
                <Input {...form.register("name")} />
            </Field>
            <button type="submit">Save</button>
        </form>
    );
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const settle = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
    }
};

const alerts = () =>
    Array.from(host.querySelectorAll('[role="alert"]')).map((a) =>
        a.textContent.trim(),
    );

describe("a page form", () => {
    it("says nothing while a field is being typed in for the first time", async () => {
        act(() => root.render(<Sample onSave={() => undefined} />));
        const name = host.querySelector("input");
        act(() => name?.focus());
        await settle();
        expect(alerts()).toEqual([]);
    });

    it("checks a field on leaving it", async () => {
        act(() => root.render(<Sample onSave={() => undefined} />));
        const name = host.querySelector("input");
        act(() => {
            name?.focus();
            name?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        });
        await settle();
        expect(alerts()).toEqual(["Add a name."]);
    });

    it("on submit, goes to the first field in error, in the order the form draws them", async () => {
        const onSave = vi.fn();
        act(() => root.render(<Sample onSave={onSave} />));
        act(() =>
            host
                .querySelector<HTMLButtonElement>('button[type="submit"]')
                ?.click(),
        );
        await settle();
        expect(onSave).not.toHaveBeenCalled();
        expect(alerts()).toEqual(["Choose a kind.", "Add a name."]);
        expect(document.activeElement?.textContent).toBe("Pick a kind");
    });
});
