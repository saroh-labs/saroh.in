import type { DocumentData } from "../types";

import { creditNote } from "./credit-note";
import { estimate } from "./estimate";
import { invoice } from "./invoice";
import { paymentReminderLetter } from "./payment-reminder-letter";
import { priceList } from "./price-list";
import { proformaInvoice } from "./proforma-invoice";
import { quote } from "./quote";
import { receipt } from "./receipt";

/** The order here is the gallery's. */
export const DOCUMENTS: DocumentData[] = [
    invoice,
    estimate,
    quote,
    receipt,
    proformaInvoice,
    creditNote,
    paymentReminderLetter,
    priceList,
];
