/**
 * Where a person's details live outside the `Contact` row, and what a
 * privacy removal (DEC-042, C11) does with each: the registry
 * `personal-data.spec.ts` holds the schema to.
 *
 * The spec reads `schema.prisma`, walks from `Contact` and the store
 * `Customer` along foreign keys (two hops: an order's review invitation is
 * reached through the order), and fails when a field there looks personal
 * ({@link looksPersonal}) and has no entry here — so a new column holding a
 * name, an address or a free-text note can't ship without saying what a
 * removal does with it. An entry that is kept says why.
 */

export type PersonalFieldRule =
    /** Set to null (or blanked). */
    | "cleared"
    /** Replaced by the reserved `removed+<id>@removed.invalid` placeholder. */
    | "placeholder"
    /** Replaced by a fixed word ("Removed customer", "Removed", "A customer"). */
    | "replaced"
    /** The row is deleted. */
    | "deleted"
    /** Kept as it is; `why` says why. */
    | "kept";

export interface PersonalField {
    rule: PersonalFieldRule;
    why: string;
}

/** Every personal-looking field reachable from a contact, keyed `Model.field`. */
export const PERSONAL_FIELDS: Readonly<Record<string, PersonalField>> = {
    // The contact itself: anonymised in place.
    "Contact.email": {
        rule: "placeholder",
        why: "Required and unique per business, so a placeholder per contact.",
    },
    "Contact.firstName": { rule: "cleared", why: "Their name." },
    "Contact.lastName": { rule: "cleared", why: "Their name." },
    "Contact.phone": { rule: "cleared", why: "Their phone." },
    "Contact.addressLine1": { rule: "cleared", why: "Their address." },
    "Contact.addressLine2": { rule: "cleared", why: "Their address." },
    "Contact.city": { rule: "cleared", why: "Their address." },
    "Contact.state": { rule: "cleared", why: "Their address." },
    "Contact.postalCode": { rule: "cleared", why: "Their address." },

    // A store customer linked only to them.
    "Customer.email": {
        rule: "placeholder",
        why: "Unique per store; the placeholder stops a later checkout re-linking them by email.",
    },
    "Customer.firstName": { rule: "cleared", why: "Their name." },
    "Customer.lastName": { rule: "cleared", why: "Their name." },
    "Customer.phone": { rule: "cleared", why: "Their phone." },
    "Customer.city": { rule: "cleared", why: "Their address." },
    "Customer.state": { rule: "cleared", why: "Their address." },
    "Customer.zipCode": { rule: "cleared", why: "Their address." },

    // Their orders: lines, amounts and tax facts stay.
    "Order.deliveryName": { rule: "cleared", why: "The recipient." },
    "Order.deliveryPhone": { rule: "cleared", why: "The recipient." },
    "Order.deliveryLine1": { rule: "cleared", why: "The street." },
    "Order.deliveryLine2": { rule: "cleared", why: "The street." },
    "Order.deliveryCity": { rule: "cleared", why: "The street." },
    "Order.deliveryPostalCode": { rule: "cleared", why: "The street." },
    "Order.deliveryState": {
        rule: "kept",
        why: "The GST place of supply when no bill-to state is set; tax records need it.",
    },
    "Order.notes": { rule: "cleared", why: "Free text about the order." },
    "Order.courierName": {
        rule: "kept",
        why: "The courier company, not the person.",
    },

    // Issued invoices are the law's paper (DEC-042).
    "Invoice.billToName": {
        rule: "kept",
        why: "Printed on an issued invoice.",
    },
    "Invoice.billToEmail": {
        rule: "kept",
        why: "Printed on an issued invoice.",
    },
    "Invoice.billToAddress": {
        rule: "kept",
        why: "Printed on an issued invoice.",
    },
    "Invoice.sellerAddress": {
        rule: "kept",
        why: "The business's address, not theirs.",
    },

    // Bookings: the time and service stay (default 26).
    "Booking.bookerName": {
        rule: "replaced",
        why: "Reads “Removed customer”.",
    },
    "Booking.bookerEmail": { rule: "cleared", why: "The booker's email." },
    "Booking.bookerPhone": { rule: "cleared", why: "The booker's phone." },
    "Booking.intakeNote": {
        rule: "cleared",
        why: "What they told the booking page.",
    },
    "Booking.snapshot": {
        rule: "replaced",
        why: "Its `booker` part reads “Removed customer” with no email or phone; the service and price stay.",
    },

    // What was sent to them.
    "Message.toAddress": { rule: "placeholder", why: "Their email or phone." },
    "Message.body": { rule: "replaced", why: "Reads “Removed”." },
    "Delivery.error": {
        rule: "cleared",
        why: "A provider's error can quote the address.",
    },
    "ReviewInvitation.toAddress": {
        rule: "placeholder",
        why: "Where a review link went.",
    },

    // Reviews they wrote: hidden; the stars still count.
    "ProductReview.displayName": {
        rule: "replaced",
        why: "Reads “A customer”.",
    },
    "ProductReview.body": { rule: "cleared", why: "What they wrote." },
    "ProductReview.invitedTo": {
        rule: "placeholder",
        why: "Where the review link went.",
    },
    "ProductReview.productName": {
        rule: "kept",
        why: "The product's name, not theirs.",
    },

    // Rows that go with them.
    "ContactNote.body": { rule: "deleted", why: "Notes are deleted." },
    "CustomerAccount.email": {
        rule: "deleted",
        why: "The account is deleted, with its sessions and pending codes.",
    },
    "CustomerThreadMessage.body": {
        rule: "deleted",
        why: "The thread is deleted with its messages.",
    },

    // The CRM's own.
    "Activity.body": {
        rule: "kept",
        why: "A lead's activity: leads are CRM records, left as they are (DEC-041).",
    },
};

/**
 * Whether a column's name says it may hold a person's details: an email,
 * phone, name, address, delivery or booker field, a message address or
 * body, a note, or a snapshot that can copy any of these.
 */
export function looksPersonal(field: string): boolean {
    return /^(email|phone|firstName|lastName|displayName|toAddress|invitedTo|city|state|zipCode|postalCode|notes|body|error|intakeNote|snapshot|address.*|delivery.*|booker.*|.*Name|.*Email|.*Phone|.*Address)$/.test(
        field,
    );
}

interface ModelShape {
    /** Scalar text columns (String, Json), by name. */
    text: string[];
    /** The models this one holds a foreign key to. */
    references: string[];
}

function modelsOf(schema: string): Map<string, ModelShape> {
    const models = new Map<string, ModelShape>();
    for (const [, model, body] of schema.matchAll(
        /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm,
    )) {
        const shape: ModelShape = { text: [], references: [] };
        for (const raw of body.split("\n")) {
            const line = raw.trim();
            if (!line || line.startsWith("//") || line.startsWith("@@")) {
                continue;
            }
            const field = /^(\w+)\s+(\w+)(\?|\[\])?/.exec(line);
            if (!field) continue;
            const [, name, type, suffix] = field;
            if ((type === "String" || type === "Json") && suffix !== "[]") {
                shape.text.push(name);
            }
            if (/@relation\([^)]*fields:/.test(line)) {
                shape.references.push(type);
            }
        }
        models.set(model, shape);
    }
    return models;
}

/**
 * The models a person's details can reach: `Contact`, the store `Customer`,
 * and every model holding a foreign key to one of those, `hops` deep.
 */
export function personalModels(schema: string, hops = 2): string[] {
    const models = modelsOf(schema);
    let reached = new Set(["Contact", "Customer"]);
    for (let i = 0; i < hops; i += 1) {
        const next = new Set(reached);
        for (const [name, shape] of models) {
            if (shape.references.some((r) => reached.has(r))) next.add(name);
        }
        reached = next;
    }
    return [...reached].filter((m) => models.has(m)).sort();
}

/** Every personal-looking text field those models hold, as `Model.field`. */
export function personalFields(schema: string, hops = 2): string[] {
    const models = modelsOf(schema);
    return personalModels(schema, hops)
        .flatMap((model) =>
            (models.get(model)?.text ?? [])
                .filter(looksPersonal)
                .map((field) => `${model}.${field}`),
        )
        .sort();
}

/** Personal-looking fields with no entry in the registry: must be empty. */
export function unruledPersonalFields(
    schema: string,
    registry: Readonly<Record<string, PersonalField>> = PERSONAL_FIELDS,
): string[] {
    return personalFields(schema).filter((key) => !(key in registry));
}
