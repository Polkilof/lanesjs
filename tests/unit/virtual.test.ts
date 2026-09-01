import { describe, it, expect } from "vitest";
import { rowOffsets, visibleSlice } from "@/lanes/core/virtual";

/** 10 рядків по 50 px: зміщення 0, 50, 100 … 500. */
const uniform = rowOffsets(Array.from({ length: 10 }, () => 50));

describe("зміщення рядків", () => {
    it("накопичує висоти й додає кінцеву межу", () => {
        expect(rowOffsets([10, 20, 30])).toEqual([0, 10, 30, 60]);
    });

    it("порожній список дає лише нуль", () => {
        expect(rowOffsets([])).toEqual([0]);
    });

    it("тримає різні висоти рядків", () => {
        // рядки з різною кількістю доріжок мають різну висоту
        expect(rowOffsets([36, 68, 36])).toEqual([0, 36, 104, 140]);
    });
});

describe("видимий зріз", () => {
    it("на початку списку показує вікно плюс запас", () => {
        const slice = visibleSlice(uniform, 0, 100, 1);

        expect(slice).toEqual({ start: 0, end: 4 });
    });

    it("рахує зріз від прокрутки", () => {
        // 250 px = шостий рядок за рахунком з нуля; вікно 100 px накриває ще два
        const slice = visibleSlice(uniform, 250, 100, 0);

        expect(slice).toEqual({ start: 5, end: 8 });
    });

    it("не вилазить за межі списку", () => {
        expect(visibleSlice(uniform, 480, 200, 4)).toEqual({ start: 5, end: 10 });
    });

    it("відʼємна прокрутка рахується як нульова", () => {
        // гумовий відскок на macOS: вікно фактично стоїть на початку списку
        expect(visibleSlice(uniform, -100, 100, 4)).toEqual({ start: 0, end: 5 });
    });

    it("overscan розширює зріз в обидва боки", () => {
        const tight = visibleSlice(uniform, 250, 100, 0);
        const loose = visibleSlice(uniform, 250, 100, 2);

        expect(loose.start).toBe(tight.start - 2);
        expect(loose.end).toBe(tight.end + 2);
    });

    it("нульова висота вікна показує все, коли рядків мало", () => {
        // SSR, прихована вкладка або jsdom — прокрутки не існує
        expect(visibleSlice(uniform, 0, 0, 4)).toEqual({ start: 0, end: 10 });
    });

    it("нульова висота вікна не малює тисячу рядків", () => {
        // Висоту міряють після першого рендера. Малювати на ньому все — це
        // збудувати тисячу рядків розмітки й викинути їх тим самим флашем.
        const thousand = rowOffsets(new Array(1000).fill(50));

        expect(visibleSlice(thousand, 0, 0, 4)).toEqual({ start: 0, end: 40 });
    });

    it("порожній список дає порожній зріз", () => {
        expect(visibleSlice(rowOffsets([]), 0, 500, 4)).toEqual({ start: 0, end: 0 });
    });

    it("працює на нерівних висотах", () => {
        const uneven = rowOffsets([100, 20, 20, 20, 100]);

        // Межі рядків: 0, 100, 120, 140, 160, 260. Вікно 110…140 накриває рядки
        // 1 і 2, а рядок 3 починається рівно на нижній межі — і теж потрапляє:
        // зайвий рядок дешевший за порожню смугу при дробовій прокрутці.
        expect(visibleSlice(uneven, 110, 30, 0)).toEqual({ start: 1, end: 4 });
    });

    it("великий список ріжеться так само дешево", () => {
        const many = rowOffsets(Array.from({ length: 10_000 }, () => 40));
        const slice = visibleSlice(many, 200_000, 800, 2);

        expect(slice.end - slice.start).toBeLessThan(30);
        expect(slice.start).toBe(4998);
    });
});
