"use client";

import type { Parties } from "../_documents/logic";
import { untouched } from "../_documents/logic";
import {
    CustomerSet,
    DocDate,
    DocGate,
    DocNumber,
    DocSet,
    DocTool,
    LinesEditor,
    Paper,
    PaperEmpty,
    Small,
    useDraft,
    YouSet,
} from "../_documents/parts";
import type { InvoiceForm } from "./logic";
import { invoice, NUMBER_PLACEHOLDER, START, WORDS } from "./logic";

/**
 * /tools/gst-invoice-generator (design GstInvoice*.dc.html): the invoice
 * draws as they type, free; the PDF (print, or save as PDF) is behind the
 * email gate. What's typed is kept in this browser only, so the email's
 * link brings them back to it.
 */
export default function GstInvoiceGenerator() {
    const [f, setF] = useDraft<InvoiceForm>(
        "saroh-tool:gst-invoice-generator",
        START,
    );
    const set = (patch: Partial<InvoiceForm>) => setF({ ...f, ...patch });
    const setParties = (patch: Partial<Parties>) => set(patch);
    const { paper, registered, inter } = invoice(f);

    return (
        <DocTool
            formLabel={WORDS.form}
            label={WORDS.aside}
            form={
                <>
                    <YouSet
                        v={f}
                        set={setParties}
                        gstinHint={WORDS.gstinHint}
                    />
                    <CustomerSet v={f} set={setParties} />
                    <DocSet legend={WORDS.set} cols={2}>
                        <DocNumber
                            label={WORDS.number}
                            value={f.number}
                            placeholder={NUMBER_PLACEHOLDER}
                            hint={WORDS.numberHint}
                            onChange={(number) => set({ number })}
                        />
                        <DocDate
                            label={WORDS.date}
                            value={f.date}
                            onChange={(date) => set({ date })}
                        />
                    </DocSet>
                    <DocSet legend={WORDS.lines}>
                        <LinesEditor
                            lines={f.lines}
                            onChange={(lines) => set({ lines })}
                            gst
                            placeholder={{
                                item: "What you sold",
                                code: "999721",
                                rate: "800",
                            }}
                        />
                        <a
                            className="td-find"
                            href="/tools/hsn-sac-code-finder"
                        >
                            {WORDS.find}
                        </a>
                    </DocSet>
                </>
            }
        >
            {untouched(f.name, f.lines) ? (
                <PaperEmpty>{WORDS.empty}</PaperEmpty>
            ) : (
                <>
                    <Paper {...paper} />
                    <Small>
                        {!registered
                            ? WORDS.unregistered
                            : inter
                              ? WORDS.otherState
                              : WORDS.sameState}
                    </Small>
                    <DocGate what="invoice" file={paper.num} />
                </>
            )}
        </DocTool>
    );
}
