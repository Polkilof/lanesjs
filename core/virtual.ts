/**
 * Віртуалізація рядків: який зріз показувати при поточній прокрутці.
 *
 * Безкоштовна половина продукту (рішення 10): вертикаль віртуалізується без
 * стелі за кількістю рядків, вісь часу — вже платна історія.
 *
 * Чиста математика, жодного DOM: висоти приходять числами, тож те саме
 * обчислення однакове в браузері, в тестах і на сервері.
 */

/** Кумулятивні зміщення; довжина на одиницю більша за кількість рядків. */
export function rowOffsets(heights: number[]): number[] {
    const offsets = new Array<number>(heights.length + 1);
    offsets[0] = 0;

    for (let index = 0; index < heights.length; index++) {
        offsets[index + 1] = offsets[index] + heights[index];
    }

    return offsets;
}

/** Видимий зріз рядків; `end` — ексклюзивний, як і всюди в контракті. */
export interface RowSlice {
    start: number;
    end: number;
}

/**
 * Останній рядок, чиє зміщення не більше за позицію. Експортований, бо тим
 * самим пошуком користується і влучання вказівника: рядок під курсором — це
 * та сама задача, що й перший видимий рядок, тільки з іншим числом на вході.
 */
export function rowAt(offsets: number[], position: number): number {
    const lastRow = offsets.length - 2;
    if (position <= 0) return 0;
    if (position >= offsets[lastRow + 1]) return lastRow;

    let low = 0;
    let high = lastRow;

    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (offsets[middle] <= position) low = middle;
        else high = middle - 1;
    }

    return low;
}

/**
 * Нульова висота вікна означає, що міряти нема чого — SSR, прихована вкладка
 * або тестове середовище. Тоді показуємо все: краще зайвий DOM, ніж порожній
 * екран там, де прокрутки взагалі не існує.
 */
export function visibleSlice(
    offsets: number[],
    scrollTop: number,
    viewportHeight: number,
    overscan = 4,
): RowSlice {
    const count = offsets.length - 1;
    if (count <= 0) return { start: 0, end: 0 };
    if (viewportHeight <= 0) return { start: 0, end: count };

    const first = rowAt(offsets, scrollTop);
    const last = rowAt(offsets, scrollTop + viewportHeight);

    return {
        start: Math.max(0, first - overscan),
        end: Math.min(count, last + 1 + overscan),
    };
}
