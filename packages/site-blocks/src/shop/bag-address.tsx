"use client";

import { focusRing, inputFill } from "../booking-flow/styles";
import { phoneOk } from "../lib/phone";
import { cn } from "../lib/utils";
import type { DeliveryAddress, ShopWay } from "./api";
import { INDIA_STATES, stateIn } from "./india-states";

/**
 * Where a delivery goes, in the bag: the fields, the address a returning
 * customer's last delivery went to, and the rules both are held to.
 *
 * A delivery needs every line a courier does and a phone to ring (the
 * rider at the gate, the courier with a parcel); Pick-up asks for none of
 * it. State is a choice from India's states and union territories, since
 * it decides the order's GST. The API checks the same.
 */

export const needsAddress = (way: ShopWay | null) =>
    way === "LOCAL_DELIVERY" || way === "SHIPPING";

export const EMPTY_ADDRESS: DeliveryAddress = {
    name: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
};

/** Nothing typed in any field. */
export function addressBlank(a: DeliveryAddress): boolean {
    return [a.name, a.phone, a.line1, a.line2, a.city, a.state, a.postalCode]
        .map((value) => value?.trim() ?? "")
        .every((value) => value === "");
}

/**
 * What is still missing before the order can be delivered there, in a
 * sentence for the line beside the button; null when nothing is. The lines
 * first, then the phone.
 */
export function addressLeft(a: DeliveryAddress): string | null {
    if (
        a.line1.trim() === "" ||
        a.city.trim() === "" ||
        stateIn(a.state) === "" ||
        a.postalCode.trim() === ""
    ) {
        return "Add the address to deliver to.";
    }
    const phone = a.phone?.trim() ?? "";
    if (phone === "") return "Add a phone number for the delivery.";
    if (!phoneOk(phone)) return "Check the phone number.";
    return null;
}

export function addressReady(a: DeliveryAddress): boolean {
    return addressLeft(a) === null;
}

export function trimmed(a: DeliveryAddress): DeliveryAddress {
    const out: DeliveryAddress = {
        line1: a.line1.trim(),
        city: a.city.trim(),
        state: stateIn(a.state),
        postalCode: a.postalCode.trim(),
    };
    if (a.name?.trim()) out.name = a.name.trim();
    if (a.phone?.trim()) out.phone = a.phone.trim();
    if (a.line2?.trim()) out.line2 = a.line2.trim();
    return out;
}

/** The address as lines to read: who, where, and the number to ring. */
export function addressLines(a: DeliveryAddress): string[] {
    const town = [a.city.trim(), stateIn(a.state) || a.state.trim()]
        .filter(Boolean)
        .join(", ");
    return [
        a.name?.trim() ?? "",
        a.line1.trim(),
        a.line2?.trim() ?? "",
        [town, a.postalCode.trim()].filter(Boolean).join(" "),
        a.phone?.trim() ?? "",
    ].filter((line) => line !== "");
}

// 16px: under it, iOS Safari zooms the page when a field takes focus.
const field = cn(
    "border-site-border text-site-fg mt-1 block h-11 w-full rounded-[calc(var(--site-radius)+8px)] border px-3 text-base",
    inputFill,
    focusRing,
);

/**
 * The address the customer's last delivery went to, offered again: read,
 * not retyped. "Use a different address" empties it and shows the fields.
 */
export function SavedAddress({
    address,
    onDifferent,
}: {
    address: DeliveryAddress;
    onDifferent: () => void;
}) {
    return (
        <div className="border-site-border rounded-[calc(var(--site-radius)+8px)] border px-3.5 py-3">
            <p className="text-site-body text-sm leading-normal">
                {addressLines(address).map((line, i) => (
                    <span
                        key={`${i}-${line}`}
                        className={cn(
                            "block [overflow-wrap:anywhere]",
                            i === 0 && "text-site-fg font-semibold",
                        )}
                    >
                        {line}
                    </span>
                ))}
            </p>
            <button
                type="button"
                onClick={onDifferent}
                className={cn(
                    "text-site-fg mt-1 min-h-11 cursor-pointer text-sm font-semibold underline",
                    focusRing,
                )}
            >
                Use a different address
            </button>
        </div>
    );
}

export function AddressFields({
    site,
    address,
    onChange,
}: {
    /** The bag's site id, so each field's id is its own. */
    site: string;
    address: DeliveryAddress;
    onChange: (name: keyof DeliveryAddress) => (value: string) => void;
}) {
    const phone = address.phone?.trim() ?? "";
    // Only once something is typed: an empty required field is said beside
    // the button, never as an error before the customer has started.
    const phoneNote = phone !== "" && !phoneOk(phone);
    const input = (
        name: keyof DeliveryAddress,
        label: string,
        auto: string,
        required = false,
    ) => (
        <label className="block text-[13.5px] font-medium">
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
            <input
                type={name === "phone" ? "tel" : "text"}
                // The keyboard each needs: digits for a PIN code (six of
                // them), the phone pad for a phone.
                inputMode={
                    name === "postalCode"
                        ? "numeric"
                        : name === "phone"
                          ? "tel"
                          : undefined
                }
                maxLength={name === "postalCode" ? 6 : undefined}
                autoComplete={auto}
                required={required}
                value={address[name] ?? ""}
                onChange={(e) => onChange(name)(e.target.value)}
                aria-invalid={name === "phone" && phoneNote ? true : undefined}
                aria-describedby={
                    name === "phone" && phoneNote
                        ? `${site}-phone-note`
                        : undefined
                }
                className={field}
            />
        </label>
    );
    return (
        <div className="grid gap-2.5">
            {input("name", "Name", "name")}
            <div>
                {input("phone", "Phone", "tel", true)}
                {phoneNote ? (
                    <p
                        id={`${site}-phone-note`}
                        className="text-site-fg mt-1.5 text-sm font-medium"
                    >
                        Check the phone number.
                    </p>
                ) : null}
            </div>
            {input("line1", "Address", "address-line1", true)}
            {input("line2", "Flat, floor or landmark", "address-line2")}
            <div className="grid grid-cols-2 gap-2.5">
                {input("city", "Town or city", "address-level2", true)}
                {input("postalCode", "PIN code", "postal-code", true)}
            </div>
            <label className="block text-[13.5px] font-medium">
                State
                <span aria-hidden="true"> *</span>
                <select
                    autoComplete="address-level1"
                    required
                    value={stateIn(address.state)}
                    onChange={(e) => onChange("state")(e.target.value)}
                    className={cn(field, "cursor-pointer")}
                >
                    <option value="">Choose a state</option>
                    {INDIA_STATES.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}
