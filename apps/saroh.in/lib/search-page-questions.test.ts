import type { Question } from "@saroh/search-pages";
import { Questions } from "@saroh/search-pages";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { faqPageLd } from "./structured-data";

// #1201: the questions a page shows and its FAQPage come from one list, so the two never disagree.
const QUESTIONS: Question[] = [
    {
        question: "Do I need to charge GST if I'm not registered?",
        answer: ["No, and you mustn't.", "You give a plain bill with no tax."],
    },
    {
        question: "Is GST different for products I sell?",
        answer: ["Yes. Products go at the rate for their HSN code."],
    },
];

describe("Questions and FAQPage from one array", () => {
    it("draws and describes the same questions in the same order", () => {
        const html = renderToStaticMarkup(
            createElement(Questions, {
                questions: QUESTIONS,
                headingClass: "sp-h2c",
                compact: true,
            }),
        );
        const ld = faqPageLd(
            QUESTIONS.map((q) => ({ q: q.question, a: q.answer.join(" ") })),
        );
        const drawn = [...html.matchAll(/<summary>([^<]*)/g)].map((m) =>
            m[1].replace(/&#x27;/g, "'"),
        );
        expect(drawn).toEqual(QUESTIONS.map((q) => q.question));
        expect(ld).toMatchInlineSnapshot(`
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "No, and you mustn't. You give a plain bill with no tax.",
                },
                "name": "Do I need to charge GST if I'm not registered?",
              },
              {
                "@type": "Question",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. Products go at the rate for their HSN code.",
                },
                "name": "Is GST different for products I sell?",
              },
            ],
          }
        `);
    });
});
