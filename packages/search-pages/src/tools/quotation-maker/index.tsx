"use client";

import { useId, useState } from "react";

import type { Parties } from "../_documents/logic";
import { showDate, untouched } from "../_documents/logic";
import {
    CustomerSet,
    DocDate,
    DocGate,
    DocNote,
    DocNumber,
    DocSet,
    DocTool,
    LinesEditor,
    Paper,
    PaperEmpty,
    Small,
    Tc,
    useDraft,
    YouSet,
} from "../_documents/parts";
import type { QuoteForm } from "./logic";
import {
    dates,
    NUMBER_PLACEHOLDER,
    quote,
    shareLink,
    START,
    untilProblem,
    WORDS,
} from "./logic";

/**
 * /tools/quotation-maker (design Quotation*.dc.html): a numbered quote
 * with GST, drawn as they type, free; the PDF and Send on WhatsApp are
 * behind the email gate. A valid-until on or before the quote's date is
 * marked when they leave it, and the last good one stays. Kept in this
 * browser only.
 */
export default function QuotationMaker() {
    const [f, setF] = useDraft<QuoteForm>("saroh-tool:quotation-maker", START);
    const [held, setHeld] = useState<string | null>(null);
    const termsId = useId();
    const set = (patch: Partial<QuoteForm>) => setF({ ...f, ...patch });
    const setParties = (patch: Partial<Parties>) => set(patch);
    const { paper, registered, inter, until } = quote(f, held);
    const problem = untilProblem(f);

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
                    <DocSet legend={WORDS.set} cols={3}>
                        <DocNumber
                            label={WORDS.number}
                            value={f.number}
                            placeholder={NUMBER_PLACEHOLDER}
                            onChange={(number) => set({ number })}
                        />
                        <DocDate
                            label={WORDS.date}
                            value={f.date}
                            onChange={(date) => set({ date })}
                        />
                        <DocDate
                            label={WORDS.validUntil}
                            value={f.validUntil}
                            placeholder={showDate(dates(f).usual)}
                            hint={WORDS.validHint}
                            error={problem}
                            onChange={(validUntil) => {
                                const was = dates(f).until;
                                if (was && !problem) setHeld(was);
                                set({ validUntil });
                            }}
                        />
                    </DocSet>
                    <DocSet legend={WORDS.lines}>
                        <LinesEditor
                            lines={f.lines}
                            onChange={(lines) => set({ lines })}
                            gst
                            placeholder={{
                                item: "What you'll do or sell",
                                code: "998382",
                                rate: "12000",
                            }}
                        />
                        <Small>
                            {WORDS.codes} <Tc />
                        </Small>
                        <a
                            className="td-find"
                            href="/tools/hsn-sac-code-finder"
                        >
                            {WORDS.find}
                        </a>
                    </DocSet>
                    <DocSet legend={WORDS.terms}>
                        <div className="tp-field">
                            <label htmlFor={termsId} className="tp-label">
                                {WORDS.termsLabel}
                            </label>
                            <textarea
                                id={termsId}
                                rows={2}
                                value={f.terms}
                                placeholder={WORDS.termsPlaceholder}
                                onChange={(e) => set({ terms: e.target.value })}
                                className="tp-input td-area"
                            />
                        </div>
                    </DocSet>
                </>
            }
        >
            {untouched(f.name, f.lines) ? (
                <PaperEmpty>{WORDS.empty}</PaperEmpty>
            ) : (
                <>
                    <Paper {...paper}>
                        {f.terms.trim() ? (
                            <div className="td-words">{f.terms.trim()}</div>
                        ) : null}
                    </Paper>
                    {problem ? <DocNote>{WORDS.held(until)}</DocNote> : null}
                    <Small>
                        {!registered
                            ? WORDS.unregistered
                            : inter
                              ? WORDS.otherState
                              : WORDS.sameState}
                    </Small>
                    <Small>
                        {WORDS.notABill}{" "}
                        <a href="/tools/gst-invoice-generator">
                            {WORDS.invoiceTool}
                        </a>
                    </Small>
                    <DocGate
                        what="quote"
                        file={f.number.trim() || NUMBER_PLACEHOLDER}
                        share={shareLink(f, paper.total.v, until)}
                        shareLabel={WORDS.share}
                    />
                </>
            )}
        </DocTool>
    );
}
