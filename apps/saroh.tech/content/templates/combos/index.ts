import type { Combo } from "../types";

import { creditNoteAustralia } from "./credit-note-australia";
import { creditNoteCanada } from "./credit-note-canada";
import { creditNoteSingapore } from "./credit-note-singapore";
import { creditNoteUae } from "./credit-note-uae";
import { creditNoteUk } from "./credit-note-uk";
import { creditNoteUs } from "./credit-note-us";
import { estimateAustralia } from "./estimate-australia";
import { estimateCanada } from "./estimate-canada";
import { estimateCleaner } from "./estimate-cleaner";
import { estimateConsultant } from "./estimate-consultant";
import { estimateContractor } from "./estimate-contractor";
import { estimateElectrician } from "./estimate-electrician";
import { estimateGraphicDesigner } from "./estimate-graphic-designer";
import { estimateLandscaper } from "./estimate-landscaper";
import { estimatePhotographer } from "./estimate-photographer";
import { estimatePlumber } from "./estimate-plumber";
import { estimateSingapore } from "./estimate-singapore";
import { estimateTutor } from "./estimate-tutor";
import { estimateUae } from "./estimate-uae";
import { estimateUk } from "./estimate-uk";
import { estimateUs } from "./estimate-us";
import { estimateWebDeveloper } from "./estimate-web-developer";
import { invoiceAustralia } from "./invoice-australia";
import { invoiceCanada } from "./invoice-canada";
import { invoiceCleaner } from "./invoice-cleaner";
import { invoiceConsultant } from "./invoice-consultant";
import { invoiceContractor } from "./invoice-contractor";
import { invoiceElectrician } from "./invoice-electrician";
import { invoiceGraphicDesigner } from "./invoice-graphic-designer";
import { invoiceLandscaper } from "./invoice-landscaper";
import { invoicePhotographer } from "./invoice-photographer";
import { invoicePlumber } from "./invoice-plumber";
import { invoiceSingapore } from "./invoice-singapore";
import { invoiceTutor } from "./invoice-tutor";
import { invoiceUae } from "./invoice-uae";
import { invoiceUk } from "./invoice-uk";
import { invoiceUs } from "./invoice-us";
import { invoiceWebDeveloper } from "./invoice-web-developer";
import { priceListContractor } from "./price-list-contractor";
import { priceListTutor } from "./price-list-tutor";
import { proformaInvoiceContractor } from "./proforma-invoice-contractor";
import { proformaInvoiceTutor } from "./proforma-invoice-tutor";
import { quoteAustralia } from "./quote-australia";
import { quoteCanada } from "./quote-canada";
import { quoteCleaner } from "./quote-cleaner";
import { quoteConsultant } from "./quote-consultant";
import { quoteContractor } from "./quote-contractor";
import { quoteElectrician } from "./quote-electrician";
import { quoteGraphicDesigner } from "./quote-graphic-designer";
import { quoteLandscaper } from "./quote-landscaper";
import { quotePhotographer } from "./quote-photographer";
import { quotePlumber } from "./quote-plumber";
import { quoteSingapore } from "./quote-singapore";
import { quoteTutor } from "./quote-tutor";
import { quoteUae } from "./quote-uae";
import { quoteUk } from "./quote-uk";
import { quoteUs } from "./quote-us";
import { quoteWebDeveloper } from "./quote-web-developer";
import { receiptAustralia } from "./receipt-australia";
import { receiptCanada } from "./receipt-canada";
import { receiptCleaner } from "./receipt-cleaner";
import { receiptConsultant } from "./receipt-consultant";
import { receiptContractor } from "./receipt-contractor";
import { receiptElectrician } from "./receipt-electrician";
import { receiptGraphicDesigner } from "./receipt-graphic-designer";
import { receiptLandscaper } from "./receipt-landscaper";
import { receiptPhotographer } from "./receipt-photographer";
import { receiptPlumber } from "./receipt-plumber";
import { receiptSingapore } from "./receipt-singapore";
import { receiptTutor } from "./receipt-tutor";
import { receiptUae } from "./receipt-uae";
import { receiptUk } from "./receipt-uk";
import { receiptUs } from "./receipt-us";
import { receiptWebDeveloper } from "./receipt-web-developer";

import { estimateEventPlanner } from "./estimate-event-planner";
import { estimateMakeupArtist } from "./estimate-makeup-artist";
import { estimatePersonalTrainer } from "./estimate-personal-trainer";
import { estimateSalon } from "./estimate-salon";
import { invoiceEventPlanner } from "./invoice-event-planner";
import { invoiceMakeupArtist } from "./invoice-makeup-artist";
import { invoicePersonalTrainer } from "./invoice-personal-trainer";
import { invoiceSalon } from "./invoice-salon";
import { priceListEventPlanner } from "./price-list-event-planner";
import { priceListMakeupArtist } from "./price-list-makeup-artist";
import { priceListPersonalTrainer } from "./price-list-personal-trainer";
import { priceListSalon } from "./price-list-salon";
import { proformaInvoiceEventPlanner } from "./proforma-invoice-event-planner";
import { proformaInvoiceMakeupArtist } from "./proforma-invoice-makeup-artist";
import { proformaInvoicePersonalTrainer } from "./proforma-invoice-personal-trainer";
import { proformaInvoiceSalon } from "./proforma-invoice-salon";
import { quoteEventPlanner } from "./quote-event-planner";
import { quoteMakeupArtist } from "./quote-makeup-artist";
import { quotePersonalTrainer } from "./quote-personal-trainer";
import { quoteSalon } from "./quote-salon";
import { receiptEventPlanner } from "./receipt-event-planner";
import { receiptMakeupArtist } from "./receipt-makeup-artist";
import { receiptPersonalTrainer } from "./receipt-personal-trainer";
import { receiptSalon } from "./receipt-salon";

/** Every document x trade and document x country page. No entry, no page. */
export const COMBOS: Combo[] = [
    invoicePersonalTrainer,
    estimatePersonalTrainer,
    quotePersonalTrainer,
    receiptPersonalTrainer,
    proformaInvoicePersonalTrainer,
    priceListPersonalTrainer,
    invoiceMakeupArtist,
    estimateMakeupArtist,
    quoteMakeupArtist,
    receiptMakeupArtist,
    proformaInvoiceMakeupArtist,
    priceListMakeupArtist,
    invoiceEventPlanner,
    estimateEventPlanner,
    quoteEventPlanner,
    receiptEventPlanner,
    proformaInvoiceEventPlanner,
    priceListEventPlanner,
    invoiceSalon,
    estimateSalon,
    quoteSalon,
    receiptSalon,
    proformaInvoiceSalon,
    priceListSalon,
    estimatePhotographer,
    quotePhotographer,
    receiptPhotographer,
    estimateCleaner,
    quoteCleaner,
    receiptCleaner,
    estimatePlumber,
    quotePlumber,
    receiptPlumber,
    invoiceGraphicDesigner,
    estimateGraphicDesigner,
    quoteGraphicDesigner,
    receiptGraphicDesigner,
    invoiceWebDeveloper,
    estimateWebDeveloper,
    quoteWebDeveloper,
    receiptWebDeveloper,
    invoiceConsultant,
    estimateConsultant,
    quoteConsultant,
    receiptConsultant,
    invoicePhotographer,
    invoiceCleaner,
    invoicePlumber,
    invoiceUk,
    estimateUk,
    quoteUk,
    receiptUk,
    creditNoteUk,
    invoiceUs,
    estimateUs,
    quoteUs,
    receiptUs,
    creditNoteUs,
    invoiceCanada,
    estimateCanada,
    quoteCanada,
    receiptCanada,
    creditNoteCanada,
    invoiceAustralia,
    estimateAustralia,
    quoteAustralia,
    receiptAustralia,
    creditNoteAustralia,
    invoiceUae,
    estimateUae,
    quoteUae,
    receiptUae,
    creditNoteUae,
    invoiceSingapore,
    estimateSingapore,
    quoteSingapore,
    receiptSingapore,
    creditNoteSingapore,
    invoiceContractor,
    estimateContractor,
    quoteContractor,
    receiptContractor,
    proformaInvoiceContractor,
    priceListContractor,
    invoiceElectrician,
    estimateElectrician,
    quoteElectrician,
    receiptElectrician,
    invoiceLandscaper,
    estimateLandscaper,
    quoteLandscaper,
    receiptLandscaper,
    invoiceTutor,
    estimateTutor,
    quoteTutor,
    receiptTutor,
    proformaInvoiceTutor,
    priceListTutor,
];
