/**
 * Вісь у днях. Спільна для жестів, бо всі вони міряють одне й те саме, а
 * колонками цього не виміряти.
 *
 * Чому не в колонках, як було: при кроці "week" колонка накриває сім днів, і
 * подія, коротша за тиждень, у колонках не виражається взагалі. Край,
 * обмежений однією колонкою, не міг зрушити ні на день — жест мовчки нічого не
 * робив; а коли таки перестрибував колонку, дата їхала на сім днів, і кінець
 * опинявся раніше за початок. Обидві біди з однієї причини: одиниця виміру
 * жесту не збігалася з одиницею, у якій живуть дані.
 *
 * Тому одиниця тут — день, у будь-якому кроці. Колонки лишаються тільки там,
 * де малюють: привид рахує пікселі, і йому віддають дробову колонку.
 *
 * Тека pro/ імпортує з core/; назад — ніколи (див. README).
 */
import { addDays, diffDays, toEpoch, toIso } from "../core/date";
import type { IsoDate, Layout } from "../core/types";

export interface DayAxis {
    /** Скільки днів накриває одна колонка: день — один, тиждень — сім. */
    perSlot: number;
    /** Скільки днів на осі всього. */
    length: number;
    /** День осі за датою. Від'ємний — раніше за початок осі. */
    dayOf(date: IsoDate): number;
    /** Дата за днем осі. */
    dateAt(day: number): IsoDate;
    /** Колонка за днем; дробова, бо саме в колонках малюється привид. */
    slotOf(day: number): number;
    /**
     * День за колонкою. Через округлення, а не діленням навпростець: 3/7*7
     * у подвійній точності дає 2.9999999999999996, і день поїхав би назад.
     */
    dayOfSlot(slot: number): number;
}

export function dayAxis<R, I>(layout: Layout<R, I>): DayAxis {
    const slots = layout.slots;

    // Порожня вісь трапляється хіба що в тестах і на першому кадрі; віддаємо
    // безпечні одиниці, щоб жест просто нікуди не влучив.
    if (slots.length === 0) {
        return {
            perSlot: 1,
            length: 0,
            dayOf: () => 0,
            dateAt: () => layout.range.start,
            slotOf: (day) => day,
            dayOfSlot: (slot) => Math.round(slot),
        };
    }

    const first = toEpoch(slots[0].start);
    const perSlot = diffDays(first, toEpoch(slots[0].end));
    const length = diffDays(first, toEpoch(slots[slots.length - 1].end));

    return {
        perSlot,
        length,
        dayOf: (date) => diffDays(first, toEpoch(date)),
        dateAt: (day) => toIso(addDays(first, day)),
        slotOf: (day) => day / perSlot,
        dayOfSlot: (slot) => Math.round(slot * perSlot),
    };
}

/**
 * День осі під вказівником. Накладка лежить у координатах сітки, тож її лівий
 * край — це й є нуль осі; питати про це компонент нема потреби.
 */
export function dayUnder(x: number, overlay: HTMLElement, slotWidth: number, perSlot: number): number {
    const dayWidth = slotWidth / perSlot;
    return Math.floor((x - overlay.getBoundingClientRect().left) / dayWidth);
}

/** Межі можуть зійтися в точку — тоді перемагає нижня, а не NaN. */
export function clamp(value: number, low: number, high: number): number {
    return Math.min(Math.max(value, low), Math.max(low, high));
}
