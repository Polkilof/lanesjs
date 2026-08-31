import { describe, it, expect } from "vitest";
import { buildLayout } from "@/lanes/core/layout";
import type { Item, LayoutInput, Resource } from "@/lanes/core/types";

const resources: Resource[] = [
    { id: "r1", title: "Перший" },
    { id: "r2", title: "Другий" },
];

/** Березень 2026: 1-ше — неділя, 31 день. */
const march: LayoutInput["range"] = { start: "2026-03-01", end: "2026-04-01" };

function bar(id: string, start: string, end: string, resourceId = "r1"): Item {
    return { id, resourceId, start, end };
}

function build(overrides: Partial<LayoutInput> = {}) {
    return buildLayout({
        range: march,
        step: "day",
        resources,
        items: [],
        ...overrides,
    });
}

describe("вісь", () => {
    it("денний крок дає слот на кожен день діапазону", () => {
        const layout = build();

        expect(layout.slots).toHaveLength(31);
        expect(layout.slots[0].start).toBe("2026-03-01");
        expect(layout.slots[0].end).toBe("2026-03-02");
        expect(layout.slots[30].start).toBe("2026-03-31");
        expect(layout.range).toEqual({ start: "2026-03-01", end: "2026-04-01" });
    });

    it("тижневий крок відсуває початок назад до понеділка", () => {
        // 2026-03-01 — неділя, тож вісь починається з понеділка 23 лютого
        const layout = build({ step: "week" });

        expect(layout.slots[0].start).toBe("2026-02-23");
        expect(layout.range.start).toBe("2026-02-23");
        expect(layout.slots.every((slot) => slot.isWeekend === false)).toBe(true);
    });

    it("weekStartsOn зсуває початок тижня", () => {
        const layout = build({ step: "week", weekStartsOn: 0 });

        expect(layout.slots[0].start).toBe("2026-03-01");
    });

    it("позначає сьогодні та вихідні", () => {
        const layout = build({ today: "2026-03-10" });

        expect(layout.slots.filter((slot) => slot.isToday)).toHaveLength(1);
        expect(layout.slots[9].isToday).toBe(true);
        // 1 березня — неділя, 7-ме — субота
        expect(layout.slots[0].isWeekend).toBe(true);
        expect(layout.slots[6].isWeekend).toBe(true);
        expect(layout.slots[1].isWeekend).toBe(false);
    });

    it("без today жоден слот не позначений", () => {
        expect(build().slots.some((slot) => slot.isToday)).toBe(false);
    });

    it("порожній діапазон дає нуль слотів", () => {
        const layout = build({ range: { start: "2026-03-01", end: "2026-03-01" } });

        expect(layout.slots).toHaveLength(0);
        expect(layout.rows).toHaveLength(2);
    });
});

describe("розміщення подій", () => {
    it("подія на один день займає один слот", () => {
        const layout = build({ items: [bar("a", "2026-03-05", "2026-03-06")] });
        const placed = layout.rows[0].bars[0];

        expect(placed.slotIndex).toBe(4);
        expect(placed.slotSpan).toBe(1);
        expect(placed.clippedStart).toBe(false);
        expect(placed.clippedEnd).toBe(false);
    });

    it("ексклюзивний end не захоплює зайвий слот", () => {
        const layout = build({ items: [bar("a", "2026-03-05", "2026-03-08")] });

        expect(layout.rows[0].bars[0].slotSpan).toBe(3);
    });

    it("обрізає подію по обох краях і піднімає прапорці", () => {
        const layout = build({ items: [bar("a", "2026-02-20", "2026-04-10")] });
        const placed = layout.rows[0].bars[0];

        expect(placed.slotIndex).toBe(0);
        expect(placed.slotSpan).toBe(31);
        expect(placed.clippedStart).toBe(true);
        expect(placed.clippedEnd).toBe(true);
    });

    it("подія повністю поза вікном не потрапляє в розкладку", () => {
        const layout = build({
            items: [bar("before", "2026-01-01", "2026-02-01"), bar("after", "2026-05-01", "2026-05-02")],
        });

        expect(layout.rows[0].bars).toHaveLength(0);
    });

    it("подія, що впритул торкається краю вікна, не потрапляє", () => {
        // end === початок осі, тобто останній день події — 28 лютого
        const layout = build({ items: [bar("a", "2026-02-25", "2026-03-01")] });

        expect(layout.rows[0].bars).toHaveLength(0);
    });

    it("end не більший за start трактується як один слот", () => {
        const layout = build({
            items: [bar("zero", "2026-03-05", "2026-03-05"), bar("negative", "2026-03-10", "2026-03-09", "r2")],
        });

        expect(layout.rows[0].bars[0].slotSpan).toBe(1);
        expect(layout.rows[1].bars[0].slotSpan).toBe(1);
    });

    it("подія невідомого ресурсу ігнорується", () => {
        const layout = build({ items: [bar("a", "2026-03-05", "2026-03-06", "нема-такого")] });

        expect(layout.rows.every((row) => row.bars.length === 0)).toBe(true);
    });

    it("тижневий крок міряє span у тижнях", () => {
        const layout = build({ step: "week", items: [bar("a", "2026-03-02", "2026-03-16")] });
        const placed = layout.rows[0].bars[0];

        // вісь стартує 23 лютого, подія — з понеділка 2 березня на два тижні
        expect(placed.slotIndex).toBe(1);
        expect(placed.slotSpan).toBe(2);
    });
});

describe("доріжки", () => {
    it("події, що не перетинаються, лежать в одній доріжці", () => {
        const layout = build({
            items: [bar("a", "2026-03-01", "2026-03-05"), bar("b", "2026-03-10", "2026-03-12")],
        });

        expect(layout.rows[0].bars.map((placed) => placed.lane)).toEqual([0, 0]);
        expect(layout.rows[0].laneCount).toBe(1);
    });

    it("події, що торкаються краями, лежать в одній доріжці", () => {
        // end першої === start другої: ексклюзивний край не є перетином
        const layout = build({
            items: [bar("a", "2026-03-01", "2026-03-05"), bar("b", "2026-03-05", "2026-03-08")],
        });

        expect(layout.rows[0].laneCount).toBe(1);
    });

    it("події, що перетинаються, розходяться по доріжках", () => {
        const layout = build({
            items: [
                bar("a", "2026-03-01", "2026-03-10"),
                bar("b", "2026-03-05", "2026-03-15"),
                bar("c", "2026-03-06", "2026-03-08"),
            ],
        });

        expect(layout.rows[0].laneCount).toBe(3);
        expect(layout.rows[0].bars.map((placed) => placed.lane)).toEqual([0, 1, 2]);
    });

    it("рядок без подій усе одно має одну доріжку", () => {
        expect(build().rows[0].laneCount).toBe(1);
    });

    it("підкладки не впливають на доріжки й лежать окремо", () => {
        const layout = build({
            items: [
                bar("a", "2026-03-01", "2026-03-10"),
                { ...bar("bg", "2026-03-01", "2026-03-31"), display: "background" },
            ],
        });

        expect(layout.rows[0].bars).toHaveLength(1);
        expect(layout.rows[0].backgrounds).toHaveLength(1);
        expect(layout.rows[0].laneCount).toBe(1);
    });

    it("однакові за геометрією події впорядковуються за id", () => {
        // без тай-брейку порядок доріжок залежав би від порядку в масиві
        const geometry = { start: "2026-03-05", end: "2026-03-10" };
        const items = [
            { id: "b", resourceId: "r1", ...geometry },
            { id: "a", resourceId: "r1", ...geometry },
        ];

        const layout = build({ items });

        expect(layout.rows[0].bars.map((placed) => placed.item.id)).toEqual(["a", "b"]);
        expect(layout.rows[0].bars.map((placed) => placed.lane)).toEqual([0, 1]);
    });

    it("результат не залежить від порядку подій на вході", () => {
        const items = [
            bar("a", "2026-03-01", "2026-03-10"),
            bar("b", "2026-03-05", "2026-03-15"),
            bar("c", "2026-03-06", "2026-03-08"),
        ];

        const forward = build({ items });
        const backward = build({ items: [...items].reverse() });

        expect(backward.rows[0].bars).toEqual(forward.rows[0].bars);
    });
});

describe("рядки", () => {
    it("порядок рядків дорівнює порядку ресурсів, ядро не сортує", () => {
        const reversed = [...resources].reverse();
        const layout = buildLayout({ range: march, step: "day", resources: reversed, items: [] });

        expect(layout.rows.map((row) => row.resource.id)).toEqual(["r2", "r1"]);
    });

    it("вхідні масиви не мутуються", () => {
        const items = [bar("b", "2026-03-05", "2026-03-15"), bar("a", "2026-03-01", "2026-03-10")];
        const snapshot = JSON.stringify(items);

        build({ items });

        expect(JSON.stringify(items)).toBe(snapshot);
    });
});
