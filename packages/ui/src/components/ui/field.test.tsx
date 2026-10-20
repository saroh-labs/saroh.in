import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";

import { Field, FieldError, focusFirstError } from "./field";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "./form";
import { Input } from "./input";
import {
    cleanMoney,
    moneyDecimals,
    MoneyInput,
    moneySign,
} from "./money-input";

describe("Field", () => {
    it("labels its control", () => {
        render(
            <Field label="Name">
                <Input />
            </Field>,
        );
        const box = screen.getByLabelText("Name");
        expect(box.tagName).toBe("INPUT");
        expect(box).not.toHaveAttribute("aria-invalid");
        expect(box).not.toHaveAttribute("aria-describedby");
    });

    it("a hint sits under the control and describes it", () => {
        render(
            <Field label="Address" hint="Shown on invoices.">
                <Input />
            </Field>,
        );
        const box = screen.getByLabelText("Address");
        expect(box).toHaveAccessibleDescription("Shown on invoices.");
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("an error replaces the hint, is an alert, and marks the control", () => {
        render(
            <Field
                label="Email"
                hint="We send the receipt here."
                error="Add an email."
            >
                <Input />
            </Field>,
        );
        const box = screen.getByLabelText("Email");
        expect(box).toHaveAttribute("aria-invalid", "true");
        expect(box).toHaveAccessibleDescription("Add an email.");
        expect(screen.getByRole("alert")).toHaveTextContent("Add an email.");
        expect(screen.queryByText("We send the receipt here.")).toBeNull();
    });

    it("the error sits after the control, in the hint's place", () => {
        const { container } = render(
            <Field label="Email" error="Add an email.">
                <Input />
            </Field>,
        );
        const field = container.querySelector('[data-slot="field"]');
        expect(Array.from(field?.children ?? []).map((c) => c.tagName)).toEqual(
            ["LABEL", "INPUT", "P"],
        );
    });

    it('optional says "(optional)" in the label and nothing else is marked', () => {
        render(
            <>
                <Field label="Note" optional>
                    <Input />
                </Field>
                <Field label="Name">
                    <Input />
                </Field>
            </>,
        );
        expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
        expect(screen.getByText("Name").textContent).toBe("Name");
        expect(screen.queryByText(/required/i)).toBeNull();
    });

    it("keeps a control's own id and what already describes it", () => {
        render(
            <>
                <p id="more">More.</p>
                <Field label="Code" hint="Six letters.">
                    <Input id="code" aria-describedby="more" />
                </Field>
            </>,
        );
        const box = screen.getByLabelText("Code");
        expect(box).toHaveAttribute("id", "code");
        expect(box).toHaveAccessibleDescription("More. Six letters.");
    });

    it("a function child places the wiring itself", () => {
        render(
            <Field label="Address" error="Taken.">
                {(control) => (
                    <div>
                        <Input {...control} />
                        <button type="button">Check</button>
                    </div>
                )}
            </Field>,
        );
        const box = screen.getByLabelText("Address");
        expect(box).toHaveAttribute("aria-invalid", "true");
        expect(box).toHaveAccessibleDescription("Taken.");
    });

    it("a control wired by hand keeps its wiring, and the note is named after it", () => {
        const { container } = render(
            <Field label="Address" htmlFor="site-address" hint="Letters only.">
                <div>
                    <Input
                        id="site-address"
                        aria-describedby="site-address-note"
                    />
                    <span>.saroh.app</span>
                </div>
            </Field>,
        );
        expect(container.querySelectorAll("#site-address")).toHaveLength(1);
        expect(screen.getByLabelText("Address")).toHaveAccessibleDescription(
            "Letters only.",
        );
    });

    it("several controls under one label are a group without asking", () => {
        render(
            <Field label="Size">
                <Input aria-label="Width" />
                <Input aria-label="Height" />
            </Field>,
        );
        expect(screen.getByRole("group", { name: "Size" })).toBeInTheDocument();
    });

    it("a group of controls is named by the label", () => {
        render(
            <Field label="Days" group error="Pick a day.">
                <div>
                    <button type="button">Mon</button>
                    <button type="button">Tue</button>
                </div>
            </Field>,
        );
        const group = screen.getByRole("group", { name: "Days" });
        expect(group).toHaveAccessibleDescription("Pick a day.");
    });

    it("works with a plain useState draft", () => {
        function Draft() {
            const [name, setName] = React.useState("");
            const [error, setError] = React.useState<string | null>(null);
            return (
                <Field label="Name" error={error}>
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => setError(name ? null : "Add a name.")}
                    />
                </Field>
            );
        }
        render(<Draft />);
        const box = screen.getByLabelText("Name");
        fireEvent.blur(box);
        expect(screen.getByRole("alert")).toHaveTextContent("Add a name.");
        fireEvent.change(box, { target: { value: "Rye" } });
        fireEvent.blur(box);
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("works inside react-hook-form, with the same error line", async () => {
        function HookForm() {
            const form = useForm({ defaultValues: { name: "" } });
            return (
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(() => undefined)}
                        noValidate
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: "Add a name." }}
                            render={({ field, fieldState }) => (
                                <Field
                                    label="Name"
                                    error={fieldState.error?.message}
                                >
                                    <Input {...field} />
                                </Field>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        }
        render(<HookForm />);
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Add a name.");
        expect(screen.getByLabelText("Name")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    });
});

describe("FieldError", () => {
    it("is an alert in the one error style", () => {
        render(<FieldError>Too long.</FieldError>);
        const alert = screen.getByRole("alert");
        expect(alert.className).toContain("text-destructive");
        expect(alert.className).toContain("text-[0.78125rem]");
    });

    it("draws nothing with nothing to say", () => {
        const { container } = render(<FieldError>{""}</FieldError>);
        expect(container).toBeEmptyDOMElement();
    });
});

describe("FormMessage draws the same FieldError", () => {
    it("is an alert, replaces the description, and describes the control", async () => {
        function HookForm() {
            const form = useForm({ defaultValues: { name: "" } });
            return (
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(() => undefined)}
                        noValidate
                    >
                        <FormField
                            control={form.control}
                            name="name"
                            rules={{ required: "Add a name." }}
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                    <FormDescription>
                                        As customers see it.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <button type="submit">Save</button>
                    </form>
                </Form>
            );
        }
        render(<HookForm />);
        expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
            "As customers see it.",
        );
        fireEvent.click(screen.getByRole("button", { name: "Save" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveAttribute("data-slot", "field-error");
        expect(screen.queryByText("As customers see it.")).toBeNull();
        expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
            "Add a name.",
        );
        // The label keeps its colour: the line under the field says it.
        expect(screen.getByText("Name").className).not.toContain(
            "text-destructive",
        );
    });
});

describe("focusFirstError", () => {
    it("puts the keyboard on the first field in error", () => {
        vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
            fn();
            return 0;
        });
        render(
            <>
                <Field label="Name">
                    <Input />
                </Field>
                <Field label="Email" error="Add an email.">
                    <Input />
                </Field>
                <Field label="Phone" error="Add a phone.">
                    <Input />
                </Field>
            </>,
        );
        Element.prototype.scrollIntoView = vi.fn();
        focusFirstError();
        expect(screen.getByLabelText("Email")).toHaveFocus();
        vi.unstubAllGlobals();
    });

    it("puts it on a set of chips' one tab stop, not the group", () => {
        vi.stubGlobal("requestAnimationFrame", (fn: () => void) => {
            fn();
            return 0;
        });
        render(
            <div role="radiogroup" aria-label="GST rate" aria-invalid="true">
                <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    tabIndex={0}
                >
                    0%
                </button>
                <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    tabIndex={-1}
                >
                    5%
                </button>
            </div>,
        );
        Element.prototype.scrollIntoView = vi.fn();
        focusFirstError();
        expect(screen.getByRole("radio", { name: "0%" })).toHaveFocus();
        vi.unstubAllGlobals();
    });
});

describe("MoneyInput", () => {
    it("draws the currency's sign inside the box, not in the label", () => {
        const { container } = render(
            <Field label="Price">
                <MoneyInput
                    currency="INR"
                    value="1250"
                    onValueChange={() => undefined}
                />
            </Field>,
        );
        const sign = container.querySelector('[data-slot="money-sign"]');
        expect(sign).toHaveTextContent("₹");
        expect(sign).toHaveAttribute("aria-hidden");
        const box = screen.getByLabelText("Price");
        expect(box).toHaveValue("1250");
        expect(box).toHaveAttribute("inputmode", "decimal");
        expect(box.className).toContain("tabular-nums");
        expect(box).not.toHaveAttribute("placeholder");
    });

    it("keeps digits and one decimal point from what is typed or pasted", () => {
        const onValueChange = vi.fn();
        render(
            <MoneyInput
                aria-label="Price"
                currency="INR"
                value=""
                onValueChange={onValueChange}
            />,
        );
        fireEvent.change(screen.getByLabelText("Price"), {
            target: { value: "₹1,299.505" },
        });
        expect(onValueChange).toHaveBeenLastCalledWith("1299.50");
    });

    it("whole units only when decimals are off, with the number pad", () => {
        const onValueChange = vi.fn();
        render(
            <MoneyInput
                aria-label="Fee"
                currency="INR"
                value=""
                allowDecimals={false}
                onValueChange={onValueChange}
            />,
        );
        const box = screen.getByLabelText("Fee");
        expect(box).toHaveAttribute("inputmode", "numeric");
        fireEvent.change(box, { target: { value: "40.75" } });
        expect(onValueChange).toHaveBeenLastCalledWith("40");
    });

    it("takes the field's error wiring", () => {
        render(
            <Field label="Price" error="Add a price.">
                <MoneyInput
                    currency="INR"
                    value=""
                    onValueChange={() => undefined}
                />
            </Field>,
        );
        expect(screen.getByLabelText("Price")).toHaveAttribute(
            "aria-invalid",
            "true",
        );
    });

    it("cleanMoney", () => {
        expect(cleanMoney("", 2)).toBe("");
        expect(cleanMoney("12", 2)).toBe("12");
        expect(cleanMoney("12.", 2)).toBe("12.");
        expect(cleanMoney("12.3.4", 2)).toBe("12.34");
        expect(cleanMoney("1 200", 2)).toBe("1200");
        expect(cleanMoney("-5", 2)).toBe("5");
        expect(cleanMoney("abc", 2)).toBe("");
        expect(cleanMoney("99.999", 0)).toBe("99");
    });

    it("the sign and decimals follow the currency", () => {
        expect(moneySign("INR")).toBe("₹");
        expect(moneySign("USD")).toBe("$");
        expect(moneyDecimals("INR")).toBe(2);
        expect(moneyDecimals("JPY")).toBe(0);
        // An unknown code is shown as typed, never a guessed sign.
        expect(moneySign("not a code")).toBe("not a code");
    });
});
