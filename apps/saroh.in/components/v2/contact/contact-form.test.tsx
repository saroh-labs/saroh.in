// @vitest-environment jsdom
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONTACT_PAGE } from "@/content/contact-page";

import { ContactForm } from "./contact-form";

/**
 * /contact's form (design "Contact", DEC-137): the topic chips and the
 * placeholder that follows them, the three messages one at a time with the
 * field at fault marked and focused, the thanks that names the email, a
 * failed send that keeps what was typed, and "Send another message".
 */
const copy = CONTACT_PAGE.form;
const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
});

const name = () => screen.getByLabelText<HTMLInputElement>(copy.nameLabel);
const email = () => screen.getByLabelText<HTMLInputElement>(copy.emailLabel);
const message = () =>
    screen.getByLabelText<HTMLTextAreaElement>(copy.messageLabel);
const kind = () => screen.getByLabelText<HTMLSelectElement>(/Your business/);
const chip = (label: string) => screen.getByRole("radio", { name: label });
const press = () =>
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
const type = (el: HTMLElement, value: string) =>
    fireEvent.change(el, { target: { value } });

const sentOk = () =>
    fetchMock.mockResolvedValue({
        json: () => Promise.resolve({ sent: true }),
    });

function fill() {
    type(name(), "Asha Rao");
    type(email(), "asha.rao@example.com");
    type(message(), "Can I take bookings for two branches?");
}

describe("ContactForm: topics", () => {
    it("starts on the first topic, with its placeholder in the message box", () => {
        render(<ContactForm />);
        const [first] = copy.topics;
        expect(chip(first.label).getAttribute("aria-checked")).toBe("true");
        expect(message().placeholder).toBe(first.hint);
        expect(screen.getAllByRole("radio")).toHaveLength(4);
    });

    it("fills the chosen chip with Ink and changes the placeholder", () => {
        render(<ContactForm />);
        const bug = copy.topics[2];
        fireEvent.click(chip(bug.label));
        expect(chip(bug.label).getAttribute("aria-checked")).toBe("true");
        expect(chip(bug.label).className).toContain("bg-foreground");
        expect(chip(copy.topics[0].label).getAttribute("aria-checked")).toBe(
            "false",
        );
        expect(chip(copy.topics[0].label).className).toContain("bg-white");
        expect(message().placeholder).toBe(bug.hint);
    });

    it("is one tab stop, and the arrow keys move the choice round", () => {
        render(<ContactForm />);
        const labels = copy.topics.map((t) => t.label);
        expect(chip(labels[0]).tabIndex).toBe(0);
        expect(chip(labels[1]).tabIndex).toBe(-1);

        fireEvent.keyDown(chip(labels[0]), { key: "ArrowRight" });
        expect(chip(labels[1]).getAttribute("aria-checked")).toBe("true");
        expect(document.activeElement).toBe(chip(labels[1]));
        expect(chip(labels[1]).tabIndex).toBe(0);

        fireEvent.keyDown(chip(labels[1]), { key: "ArrowLeft" });
        fireEvent.keyDown(chip(labels[0]), { key: "ArrowLeft" });
        expect(chip(labels[3]).getAttribute("aria-checked")).toBe("true");
    });
});

describe("ContactForm: what is wrong", () => {
    it("says nothing and marks nothing before Send is pressed", () => {
        render(<ContactForm />);
        expect(screen.queryByRole("alert")).toBeNull();
        expect(name().getAttribute("aria-invalid")).toBeNull();
        expect(name().className).toContain("border-border-strong");
    });

    it("shows one message at a time, in order, and sends nothing", () => {
        render(<ContactForm />);
        press();
        expect(screen.getByRole("alert").textContent).toBe(copy.errors.name);

        type(name(), "Asha Rao");
        expect(screen.getByRole("alert").textContent).toBe(copy.errors.email);

        type(email(), "asha.rao@example.com");
        expect(screen.getByRole("alert").textContent).toBe(copy.errors.message);

        type(message(), "hey");
        expect(screen.getByRole("alert").textContent).toBe(copy.errors.message);

        type(message(), "hello");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("marks every field at fault red, and clears each as it is put right", () => {
        render(<ContactForm />);
        press();
        for (const field of [name(), email(), message()]) {
            expect(field.getAttribute("aria-invalid")).toBe("true");
            expect(field.className).toContain("border-destructive");
        }
        // The optional field is never at fault.
        expect(kind().getAttribute("aria-invalid")).toBeNull();

        type(name(), "Asha Rao");
        expect(name().getAttribute("aria-invalid")).toBeNull();
        expect(name().className).toContain("border-border-strong");
        expect(email().getAttribute("aria-invalid")).toBe("true");
    });

    it("puts the keyboard on the first field at fault and ties the message to it", () => {
        render(<ContactForm />);
        press();
        expect(document.activeElement).toBe(name());
        expect(name().getAttribute("aria-describedby")).toBe("contact-error");
        expect(email().getAttribute("aria-describedby")).toBeNull();

        type(name(), "Asha Rao");
        press();
        expect(document.activeElement).toBe(email());
        expect(email().getAttribute("aria-describedby")).toBe("contact-error");
        expect(screen.getByRole("alert").id).toBe("contact-error");
    });

    it("takes an email the design's check takes, and refuses one it refuses", () => {
        render(<ContactForm />);
        type(name(), "Asha Rao");
        type(message(), "One line.");
        for (const bad of ["asha", "asha@example", "a sha@example.com"]) {
            type(email(), bad);
            press();
            expect(screen.getByRole("alert").textContent).toBe(
                copy.errors.email,
            );
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("ContactForm: sending", () => {
    it("sends the message to /api/contact and thanks them by first name, naming the email", async () => {
        sentOk();
        render(<ContactForm />);
        fireEvent.click(chip(copy.topics[1].label));
        type(name(), "  Asha Rao ");
        type(email(), " asha.rao@example.com ");
        type(kind(), "salon");
        type(message(), " My booking page is empty. ");
        press();

        const thanks = await screen.findByRole("status");
        expect(thanks.textContent).toContain("Thanks, Asha. We've got it.");
        expect(thanks.textContent).toContain(
            "We'll reply to asha.rao@example.com within one working day.",
        );
        // What they typed, said back: masked in a session recording.
        expect(thanks.hasAttribute("data-ph-mask")).toBe(true);
        expect(document.activeElement).toBe(
            screen.getByRole("heading", { level: 2 }),
        );

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/contact");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            topic: "help",
            name: "Asha Rao",
            email: "asha.rao@example.com",
            kind: "salon",
            message: "My booking page is empty.",
        });
    });

    it("leaves the kind out when none was chosen", async () => {
        sentOk();
        render(<ContactForm />);
        fill();
        press();
        await screen.findByRole("status");
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).not.toHaveProperty("kind");
    });

    it("says Sending… and can't be sent twice", async () => {
        let finish: (value: unknown) => void = () => undefined;
        fetchMock.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        render(<ContactForm />);
        fill();
        press();
        const busy = await screen.findByRole("button", { name: copy.sending });
        expect(busy).toHaveProperty("disabled", true);
        fireEvent.click(busy);
        fireEvent.submit(screen.getByRole("form", { name: copy.title }));
        expect(fetchMock).toHaveBeenCalledTimes(1);

        finish({ json: () => Promise.resolve({ sent: true }) });
        await screen.findByRole("status");
    });

    it.each([
        [
            "the network fails",
            () => fetchMock.mockRejectedValue(new Error("x")),
        ],
        [
            "the API can't be reached",
            () =>
                fetchMock.mockResolvedValue({
                    json: () =>
                        Promise.resolve({
                            sent: false,
                            failure: "unavailable",
                        }),
                }),
        ],
        [
            "the answer isn't one the form can read",
            () =>
                fetchMock.mockResolvedValue({
                    json: () => Promise.resolve({ error: "Bad gateway" }),
                }),
        ],
        [
            "the answer isn't JSON at all",
            () =>
                fetchMock.mockResolvedValue({
                    json: () => Promise.reject(new SyntaxError("<html>")),
                }),
        ],
    ])(
        "keeps what was typed and gives the address when %s",
        async (_, fail) => {
            fail();
            render(<ContactForm />);
            fireEvent.click(chip(copy.topics[2].label));
            fill();
            type(kind(), "gym");
            press();

            const alert = await screen.findByRole("alert");
            expect(alert.textContent).toContain(copy.failed);
            expect(alert.querySelector("a")?.getAttribute("href")).toBe(
                "mailto:contact@saroh.in",
            );
            expect(screen.queryByRole("status")).toBeNull();

            expect(name().value).toBe("Asha Rao");
            expect(email().value).toBe("asha.rao@example.com");
            expect(message().value).toBe(
                "Can I take bookings for two branches?",
            );
            expect(kind().value).toBe("gym");
            expect(
                chip(copy.topics[2].label).getAttribute("aria-checked"),
            ).toBe("true");
            // No field is at fault: the send was.
            expect(name().getAttribute("aria-invalid")).toBeNull();
            // The button is ready for another try.
            expect(
                screen.getByRole("button", { name: copy.submit }),
            ).toHaveProperty("disabled", false);
        },
    );

    it("says so when too many were sent from here", async () => {
        fetchMock.mockResolvedValue({
            json: () =>
                Promise.resolve({ sent: false, failure: "rate-limited" }),
        });
        render(<ContactForm />);
        fill();
        press();
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain(copy.rateLimited);
        expect(message().value).toBe("Can I take bookings for two branches?");
    });

    it("marks the email when the API refuses it, until it is changed", async () => {
        fetchMock.mockResolvedValue({
            json: () => Promise.resolve({ sent: false, failure: "email" }),
        });
        render(<ContactForm />);
        fill();
        press();
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toBe(
                copy.errors.email,
            ),
        );
        expect(email().getAttribute("aria-invalid")).toBe("true");
        expect(document.activeElement).toBe(email());

        type(email(), "asha@example.org");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(email().getAttribute("aria-invalid")).toBeNull();
    });
});

describe("ContactForm: send another message", () => {
    it("keeps the name and email, and starts the topic and message again", async () => {
        sentOk();
        render(<ContactForm />);
        fireEvent.click(chip(copy.topics[3].label));
        fill();
        press();
        await screen.findByRole("status");

        fireEvent.click(
            screen.getByRole("button", { name: CONTACT_PAGE.done.again }),
        );
        expect(screen.queryByRole("status")).toBeNull();
        expect(name().value).toBe("Asha Rao");
        expect(email().value).toBe("asha.rao@example.com");
        expect(message().value).toBe("");
        expect(chip(copy.topics[0].label).getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(message().placeholder).toBe(copy.topics[0].hint);
        // A fresh form: nothing is marked until Send is pressed again.
        expect(screen.queryByRole("alert")).toBeNull();
        expect(message().getAttribute("aria-invalid")).toBeNull();
        // Focus moves in an effect once the card has changed over: waited
        // for, as a slow runner may not have run it yet (flaked on CI).
        await waitFor(() => expect(document.activeElement).toBe(message()));
    });
});
