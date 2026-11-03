import type { TradeEntry } from "../types";

import { cleaner } from "./cleaner";
import { consultant } from "./consultant";
import { contractor } from "./contractor";
import { electrician } from "./electrician";
import { eventPlanner } from "./event-planner";
import { graphicDesigner } from "./graphic-designer";
import { landscaper } from "./landscaper";
import { makeupArtist } from "./makeup-artist";
import { personalTrainer } from "./personal-trainer";
import { photographer } from "./photographer";
import { plumber } from "./plumber";
import { salon } from "./salon";
import { tutor } from "./tutor";
import { webDeveloper } from "./web-developer";

/** All 14 trades. Add `data` when a trade's file is written (see README.md). */
export const TRADES: TradeEntry[] = [
    {
        slug: "photographer",
        data: photographer,
        name: "Photographer",
        plural: "photographers",
        near: [
            "event-planner",
            "makeup-artist",
            "graphic-designer",
            "web-developer",
            "consultant",
            "tutor",
        ],
    },
    {
        slug: "graphic-designer",
        data: graphicDesigner,
        name: "Graphic designer",
        plural: "graphic designers",
        near: [
            "web-developer",
            "photographer",
            "consultant",
            "event-planner",
            "tutor",
            "makeup-artist",
        ],
    },
    {
        slug: "web-developer",
        data: webDeveloper,
        name: "Web developer",
        plural: "web developers",
        near: [
            "graphic-designer",
            "consultant",
            "photographer",
            "tutor",
            "event-planner",
            "electrician",
        ],
    },
    {
        slug: "cleaner",
        data: cleaner,
        name: "Cleaner",
        plural: "cleaners",
        near: [
            "landscaper",
            "plumber",
            "electrician",
            "contractor",
            "salon",
            "personal-trainer",
        ],
    },
    {
        slug: "contractor",
        data: contractor,
        name: "Contractor",
        plural: "contractors",
        near: [
            "plumber",
            "electrician",
            "landscaper",
            "cleaner",
            "event-planner",
            "consultant",
        ],
    },
    {
        slug: "plumber",
        data: plumber,
        name: "Plumber",
        plural: "plumbers",
        near: [
            "electrician",
            "contractor",
            "landscaper",
            "cleaner",
            "consultant",
            "event-planner",
        ],
    },
    {
        slug: "electrician",
        data: electrician,
        name: "Electrician",
        plural: "electricians",
        near: [
            "plumber",
            "contractor",
            "landscaper",
            "cleaner",
            "web-developer",
            "consultant",
        ],
    },
    {
        slug: "tutor",
        data: tutor,
        name: "Tutor",
        plural: "tutors",
        near: [
            "personal-trainer",
            "consultant",
            "web-developer",
            "graphic-designer",
            "salon",
            "makeup-artist",
        ],
    },
    {
        slug: "personal-trainer",
        data: personalTrainer,
        name: "Personal trainer",
        plural: "personal trainers",
        near: [
            "tutor",
            "salon",
            "makeup-artist",
            "consultant",
            "cleaner",
            "event-planner",
        ],
    },
    {
        slug: "consultant",
        data: consultant,
        name: "Consultant",
        plural: "consultants",
        near: [
            "web-developer",
            "graphic-designer",
            "tutor",
            "event-planner",
            "contractor",
            "personal-trainer",
        ],
    },
    {
        slug: "makeup-artist",
        data: makeupArtist,
        name: "Makeup artist",
        plural: "makeup artists",
        near: [
            "salon",
            "photographer",
            "event-planner",
            "personal-trainer",
            "tutor",
            "graphic-designer",
        ],
    },
    {
        slug: "event-planner",
        data: eventPlanner,
        name: "Event planner",
        plural: "event planners",
        near: [
            "photographer",
            "makeup-artist",
            "consultant",
            "graphic-designer",
            "salon",
            "landscaper",
        ],
    },
    {
        slug: "landscaper",
        data: landscaper,
        name: "Landscaper",
        plural: "landscapers",
        near: [
            "contractor",
            "cleaner",
            "plumber",
            "electrician",
            "event-planner",
            "consultant",
        ],
    },
    {
        slug: "salon",
        data: salon,
        name: "Salon",
        plural: "salons",
        near: [
            "makeup-artist",
            "personal-trainer",
            "tutor",
            "cleaner",
            "photographer",
            "event-planner",
        ],
    },
];
