import ChartsLayout from "@/components/layouts/charts-layout";
import ComponentsLayout from "@/components/layouts/components-layout";
import DocsLayout from "@/components/layouts/docs-layout";
import TemplatesLayout from "@/components/layouts/templates-layout";
import ChartsList from "@/components/pages/charts";
import ComponentsList from "@/components/pages/components";
import DocsList from "@/components/pages/docs";
import TemplatesList from "@/components/pages/templates";

export const features = [
    {
        pageType: "docs",
        layout: DocsLayout,
        component: DocsList,
        pages: [
            {
                title: "Getting Started",
                slug: "getting-started",
            },
            {
                title: "Customization",
                slug: "customization",
            },
            {
                title: "Deployment",
                slug: "deployment",
            },
        ],
    },
    {
        pageType: "templates",
        layout: TemplatesLayout,
        component: TemplatesList,
        pages: [
            {
                title: "Basic Blog",
                slug: "basic-blog",
            },
            {
                title: "E-commerce",
                slug: "e-commerce",
            },
        ],
    },
    {
        pageType: "components",
        layout: ComponentsLayout,
        component: ComponentsList,
        pages: [
            {
                title: "Buttons",
                slug: "buttons",
            },
            {
                title: "Forms",
                slug: "forms",
            },
        ],
    },
    {
        pageType: "charts",
        layout: ChartsLayout,
        component: ChartsList,
        pages: [
            {
                title: "Bar Chart",
                slug: "bar-chart",
            },
            {
                title: "Line Chart",
                slug: "line-chart",
            },
        ],
    },
];
