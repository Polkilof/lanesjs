<template>
    <div ref="rootRef" class="rt" :class="themeClass" :style="rootStyle" @scroll.passive="onScroll">
        <div class="rt__grid">
            <div class="rt__corner">
                <slot name="corner" />
            </div>

            <div class="rt__axis">
                <div
                    v-for="slot in layout.slots"
                    :key="slot.start"
                    class="rt__axis-cell"
                    :class="[
                        { 'rt__axis-cell--today': slot.isToday, 'rt__axis-cell--weekend': slot.isWeekend },
                        props.slotClass?.(slot),
                    ]"
                    @click="onSlotLabelClick($event, slot)"
                >
                    <slot name="slot-label" :slot-data="slot">
                        {{ slot.date.getDate() }}
                    </slot>
                </div>
            </div>

            <div class="rt__resources" :style="{ height: totalHeight + 'px' }">
                <div
                    v-for="visible in visibleRows"
                    :key="visible.row.resource.id"
                    class="rt__resource"
                    :style="rowStyle(visible)"
                >
                    <slot name="resource" :resource="visible.row.resource">
                        {{ visible.row.resource.title }}
                    </slot>
                </div>
            </div>

            <div class="rt__body" :style="{ height: totalHeight + 'px' }" @click="onBodyClick">
                <!-- Накладки на всю висоту: по одному елементу на позначену колонку,
                     а не на кожну клітинку (рішення 09). -->
                <div
                    v-for="slot in markedSlots"
                    :key="slot.start"
                    class="rt__column"
                    :class="[
                        { 'rt__column--today': slot.isToday, 'rt__column--weekend': slot.isWeekend },
                        props.slotClass?.(slot),
                    ]"
                    :style="{ left: px(slot.index), width: px(1) }"
                    aria-hidden="true"
                />

                <div
                    v-for="visible in visibleRows"
                    :key="visible.row.resource.id"
                    class="rt__row"
                    :style="rowStyle(visible)"
                    :data-resource="visible.row.resource.id"
                >
                    <div
                        v-for="placed in visible.row.backgrounds"
                        :key="placed.item.id"
                        class="rt__background"
                        :class="props.itemClass?.(placed, visible.row.resource)"
                        :style="[
                            { left: px(placed.slotIndex), width: px(placed.slotSpan) },
                            props.itemStyle?.(placed, visible.row.resource),
                        ]"
                        aria-hidden="true"
                    >
                        <slot name="background" :placed="placed" />
                    </div>

                    <div
                        v-for="placed in visible.row.bars"
                        :key="placed.item.id"
                        class="rt__bar"
                        :class="[
                            {
                                'rt__bar--clipped-start': placed.clippedStart,
                                'rt__bar--clipped-end': placed.clippedEnd,
                            },
                            props.itemClass?.(placed, visible.row.resource),
                        ]"
                        :style="[barStyle(placed), props.itemStyle?.(placed, visible.row.resource)]"
                        @click.stop="onBarClick($event, placed.item, visible.row.resource)"
                    >
                        <slot name="item" :placed="placed" :resource="visible.row.resource">
                            {{ placed.item.id }}
                        </slot>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts" generic="R = unknown, I = unknown">
/**
 * Шар рендеру. Уся математика — в ядрі; тут лише перетворення слотів у пікселі
 * і зріз видимих рядків.
 *
 * Розміри приходять числами, а не рядками: віртуалізації треба знати висоти,
 * щоб зіставити прокрутку з рядками. Рішення 06 від цього не страждає —
 * геометрія бара досі не міряє DOM, віртуалізація читає лише scrollTop і
 * висоту вікна, тобто те, що інакше дізнатись неможливо.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { buildLayout } from "../core/layout";
import { rowOffsets, visibleSlice } from "../core/virtual";
import type {
    DateRange,
    IsoDate,
    Item,
    Layout,
    PlacedItem,
    Plugin,
    Resource,
    Row,
    Slot,
    SlotStep,
} from "../core/types";

const props = withDefaults(
    defineProps<{
        resources: Resource<R>[];
        items: Item<I>[];
        range: DateRange;
        step?: SlotStep;
        today?: IsoDate;
        weekendDays?: number[];
        weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
        plugins?: Plugin<R, I>[];
        /** Класи на бар — для станів, відомих наперед. */
        itemClass?: (placed: PlacedItem<I>, resource: Resource<R>) => string | string[] | undefined;
        /**
         * Стилі на бар — для довільних значень із даних: коли колір приходить
         * з API, класом його не передаси. Тут же перевизначаються --rt-bar-*.
         */
        itemStyle?: (placed: PlacedItem<I>, resource: Resource<R>) => Record<string, string> | undefined;
        /**
         * Класи на колонку — свята, блекаути, межі спринтів. Слот із класом
         * отримує накладку на всю висоту нарівні з «сьогодні» й вихідними.
         */
        slotClass?: (slot: Slot) => string | string[] | undefined;
        /** Розміри в пікселях. Кольори й решта оформлення — через токени --rt-*. */
        /** Мінімальна ширина слота: якщо місця більше — колонки розтягуються. */
        slotWidth?: number;
        resourceWidth?: number;
        barHeight?: number;
        barGap?: number;
        /** Нижня межа висоти рядка, незалежно від кількості доріжок. */
        minRowHeight?: number;
        /** Вимкнути розтягування, якщо потрібна рівно задана ширина дня. */
        stretch?: boolean;
        /** Прокрутити вісь до цієї дати: на монтуванні й на кожній зміні. */
        scrollTo?: IsoDate;
        /** Скільки рядків тримати за межами вікна, щоб прокрутка не блимала. */
        overscan?: number;
        /**
         * "auto" — за системною темою. Застосунки з власним перемикачем
         * передають "light"/"dark" або просто перевизначають токени.
         */
        theme?: "auto" | "light" | "dark";
    }>(),
    {
        step: "day",
        slotWidth: 40,
        resourceWidth: 253,
        barHeight: 28,
        barGap: 4,
        minRowHeight: 0,
        stretch: true,
        overscan: 4,
        theme: "auto",
    },
);

/**
 * У payload іде і подія, і `target` — елемент, до якого можна прив'язати попап
 * чи меню. Окреме поле не зайве: `event.currentTarget` обнуляється, щойно
 * діспатч завершився, тож збережена подія віддала б null.
 */
const emit = defineEmits<{
    "cell-click": [payload: { date: IsoDate; resource: Resource<R>; event: MouseEvent; target: HTMLElement }];
    "item-click": [payload: { item: Item<I>; resource: Resource<R>; event: MouseEvent; target: HTMLElement }];
    "slot-click": [payload: { slot: Slot; event: MouseEvent; target: HTMLElement }];
    /** Фактичний діапазон осі — при тижневому кроці ширший за заданий у props. */
    "range-change": [range: DateRange];
}>();

const rootRef = ref<HTMLElement | null>(null);
/** Лічильник для requestUpdate() від плагінів. */
const revision = shallowRef(0);

const layout = computed<Layout<R, I>>(() => {
    void revision.value;
    return buildLayout<R, I>({
        range: props.range,
        step: props.step,
        resources: props.resources,
        items: props.items,
        today: props.today,
        weekendDays: props.weekendDays,
        weekStartsOn: props.weekStartsOn,
    });
});

/**
 * Застосунок вантажить дані на цю подію, а не на зміну props.range: при
 * тижневому кроці вісь ширша, і вантажити треба саме видиме вікно.
 * Стежимо за рядковим ключем, бо об'єкт діапазону новий на кожен перерахунок.
 */
watch(
    () => `${layout.value.range.start}|${layout.value.range.end}`,
    () => emit("range-change", layout.value.range),
    { immediate: true },
);

/**
 * У DOM потрапляють лише позначені колонки — решта сітки намальована
 * градієнтом. Власний клас від застосунку теж робить колонку позначеною,
 * інакше свята й блекаути не було б чим малювати.
 */
function hasSlotClass(slot: Slot): boolean {
    const value = props.slotClass?.(slot);
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const markedSlots = computed(() =>
    layout.value.slots.filter((slot) => slot.isToday || slot.isWeekend || hasSlotClass(slot)),
);

/* ── Віртуалізація рядків ─────────────────────────────────────────────── */

const scrollTop = ref(0);
const viewportHeight = ref(0);
const viewportWidth = ref(0);

/**
 * Задана ширина слота — мінімальна. Якщо в контейнері лишається місце,
 * колонки розтягуються на нього: порожня смуга праворуч від сітки виглядає
 * як недомальований компонент, а не як свідоме рішення.
 */
const slotWidth = computed(() => {
    const count = layout.value.slots.length;
    if (!props.stretch || viewportWidth.value === 0 || count === 0) return props.slotWidth;

    return Math.max(props.slotWidth, (viewportWidth.value - props.resourceWidth) / count);
});

const rowHeights = computed(() =>
    layout.value.rows.map((row) =>
        Math.max(props.minRowHeight, row.laneCount * props.barHeight + (row.laneCount + 1) * props.barGap),
    ),
);

const offsets = computed(() => rowOffsets(rowHeights.value));
const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0);

const slice = computed(() => visibleSlice(offsets.value, scrollTop.value, viewportHeight.value, props.overscan));

interface VisibleRow {
    row: Row<R, I>;
    top: number;
    height: number;
}

const visibleRows = computed<VisibleRow[]>(() =>
    layout.value.rows.slice(slice.value.start, slice.value.end).map((row, position) => {
        const index = slice.value.start + position;
        return { row, top: offsets.value[index], height: rowHeights.value[index] };
    }),
);

function onScroll() {
    if (rootRef.value === null) return;
    scrollTop.value = rootRef.value.scrollTop;
}

function syncViewport() {
    if (rootRef.value === null) return;
    viewportHeight.value = rootRef.value.clientHeight;
    viewportWidth.value = rootRef.value.clientWidth;
}

/**
 * Прокрутити вісь до дати. За замовчуванням дата опиняється по центру видимої
 * частини — саме те, що потрібно для «показати сьогодні».
 */
function scrollToDate(date: IsoDate, align: "start" | "center" = "center") {
    if (rootRef.value === null) return;

    const index = layout.value.slots.findIndex((slot) => slot.start <= date && date < slot.end);
    if (index < 0) return;

    const position = index * slotWidth.value;
    const visible = viewportWidth.value - props.resourceWidth;
    const left = align === "center" ? position - visible / 2 + slotWidth.value / 2 : position;

    rootRef.value.scrollLeft = Math.max(0, left);
}

watch(
    () => [props.scrollTo, layout.value.range.start] as const,
    async ([date]) => {
        if (date === undefined) return;
        await nextTick();
        scrollToDate(date);
    },
);

let observer: ResizeObserver | null = null;

/* ── Оформлення ───────────────────────────────────────────────────────── */

const themeClass = computed(() => {
    if (props.theme === "dark") return "rt--dark";
    if (props.theme === "light") return "rt--light";
    return null;
});

const rootStyle = computed(() => ({
    "--rt-slot-width": `${slotWidth.value}px`,
    "--rt-resource-width": `${props.resourceWidth}px`,
    "--rt-slot-count": String(layout.value.slots.length),
}));

/** Слоти → пікселі. Єдине місце, де відбувається це перетворення. */
function px(slots: number): string {
    return `calc(var(--rt-slot-width) * ${slots})`;
}

function rowStyle(visible: VisibleRow) {
    return {
        height: `${visible.height}px`,
        transform: `translateY(${visible.top}px)`,
    };
}

function barStyle(placed: PlacedItem<I>) {
    return {
        left: px(placed.slotIndex),
        width: px(placed.slotSpan),
        height: `${props.barHeight}px`,
        top: `${(props.barHeight + props.barGap) * placed.lane + props.barGap}px`,
    };
}

function onSlotLabelClick(event: MouseEvent, slot: Slot) {
    emit("slot-click", { slot, event, target: event.currentTarget as HTMLElement });
}

function onBarClick(event: MouseEvent, item: Item<I>, resource: Resource<R>) {
    emit("item-click", { item, resource, event, target: event.currentTarget as HTMLElement });
}

/**
 * Клік по порожньому місцю. Колонку рахуємо з відступу всередині рядка — це
 * єдине читання геометрії, і на розкладку воно не впливає.
 */
function onBodyClick(event: MouseEvent) {
    const rowEl = (event.target as HTMLElement).closest<HTMLElement>(".rt__row");
    if (rowEl === null) return;

    const resource = props.resources.find((candidate) => candidate.id === rowEl.dataset.resource);
    if (resource === undefined) return;

    const slotCount = layout.value.slots.length;
    if (slotCount === 0) return;

    const offset = event.clientX - rowEl.getBoundingClientRect().left;
    const slot = layout.value.slots[Math.floor((offset / rowEl.offsetWidth) * slotCount)];
    if (slot === undefined) return;

    emit("cell-click", { date: slot.start, resource, event, target: rowEl });
}

/* ── Плагіни (рішення 01) ─────────────────────────────────────────────── */

/**
 * Сховище підписок. Типізацію тримає сигнатура `on` у контракті; всередині
 * типи стерті, інакше мапований тип не дає покласти Set у комірку.
 */
type ErasedHandler = (payload: never) => void;

const handlers = new Map<string, Set<ErasedHandler>>();
const teardowns: Array<() => void> = [];

function subscribe(event: string, handler: ErasedHandler): () => void {
    const bucket = handlers.get(event) ?? new Set<ErasedHandler>();
    handlers.set(event, bucket);
    bucket.add(handler);

    return () => {
        bucket.delete(handler);
    };
}

onMounted(() => {
    syncViewport();

    if (props.scrollTo !== undefined) {
        nextTick(() => scrollToDate(props.scrollTo as IsoDate));
    }

    if (typeof ResizeObserver !== "undefined" && rootRef.value !== null) {
        observer = new ResizeObserver(syncViewport);
        observer.observe(rootRef.value);
    }

    for (const plugin of props.plugins ?? []) {
        const teardown = plugin.setup({
            getLayout: () => layout.value,
            getRoot: () => rootRef.value,
            on: (event, handler) => subscribe(event, handler as ErasedHandler),
            requestUpdate: () => {
                revision.value += 1;
            },
        });
        if (typeof teardown === "function") teardowns.push(teardown);
    }
});

onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;

    for (const teardown of teardowns) teardown();
    teardowns.length = 0;
});

defineExpose({ layout, syncViewport, scrollToDate });
</script>

<style>
/**
 * Публічні токени (рішення 02). Задані через :where(), щоб будь-яке
 * перевизначення ззовні вигравало без !important і без гонки специфічності.
 *
 * Три рівні, і порядок правил тут — це і є пріоритет (усі мають нульову вагу):
 *   1. світла палітра — база;
 *   2. системна темна — лише якщо застосунок не наполіг на світлій;
 *   3. явний theme="dark" — перекриває навіть світлу систему.
 * Застосунок із власним перемикачем (як [data-bs-theme] у Bootstrap) може
 * узагалі не чіпати theme, а просто перевизначити токени у своєму блоці.
 */
:where(.rt) {
    --rt-radius: 4px;
    --rt-surface: #ffffff;
    --rt-header-bg: #ffffff;
    --rt-text: #1d1127;
    --rt-muted: #6b7280;
    --rt-grid-line: #e5e7eb;
    --rt-today-bg: rgba(79, 45, 197, 0.08);
    --rt-weekend-bg: rgba(107, 114, 128, 0.06);
    --rt-bar-bg: #4f2dc5;
    --rt-bar-text: #ffffff;
}

@media (prefers-color-scheme: dark) {
    :where(.rt:not(.rt--light)) {
        --rt-surface: #161f25;
        --rt-header-bg: #1b252c;
        --rt-text: #e4ecef;
        --rt-muted: #8ea0aa;
        --rt-grid-line: rgba(255, 255, 255, 0.12);
        --rt-today-bg: rgba(141, 112, 255, 0.16);
        --rt-weekend-bg: rgba(255, 255, 255, 0.05);
        --rt-bar-bg: #7c5cf0;
        --rt-bar-text: #ffffff;
    }
}

:where(.rt--dark) {
    --rt-surface: #161f25;
    --rt-header-bg: #1b252c;
    --rt-text: #e4ecef;
    --rt-muted: #8ea0aa;
    --rt-grid-line: rgba(255, 255, 255, 0.12);
    --rt-today-bg: rgba(141, 112, 255, 0.16);
    --rt-weekend-bg: rgba(255, 255, 255, 0.05);
    --rt-bar-bg: #7c5cf0;
    --rt-bar-text: #ffffff;
}

.rt {
    position: relative;
    overflow: auto;
    background: var(--rt-surface);
    color: var(--rt-text);
}

.rt__grid {
    display: grid;
    grid-template-columns: var(--rt-resource-width) max-content;
    grid-template-rows: auto auto;
    width: max-content;
    min-width: 100%;
}

.rt__corner,
.rt__axis {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--rt-header-bg);
    border-bottom: 1px solid var(--rt-grid-line);
}

.rt__corner {
    left: 0;
    z-index: 3;
    border-right: 1px solid var(--rt-grid-line);
}

.rt__axis {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--rt-slot-width);
}

.rt__axis-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 2px;
    font-size: 12px;
    line-height: 1.2;
    text-align: center;
    white-space: nowrap;
    cursor: default;
}

.rt__axis-cell--today {
    background: var(--rt-today-bg);
    font-weight: 700;
}

.rt__axis-cell--weekend {
    color: var(--rt-muted);
}

/**
 * Обидві колонки — позиційовані контейнери однакової висоти, а рядки в них
 * абсолютні з тим самим зміщенням. Тому панель ресурсів і сітка не можуть
 * розсинхронізуватись: вони рендерять один і той самий зріз.
 */
.rt__resources {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--rt-surface);
    border-right: 1px solid var(--rt-grid-line);
}

.rt__resource {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 12px;
    overflow: hidden;
    border-bottom: 1px solid var(--rt-grid-line);
}

/**
 * Вертикальні лінії сітки — градієнт, а не DOM на клітинку (рішення 09):
 * 300 ресурсів на місяць коштують 300 рядків, а не 9300 клітинок.
 */
.rt__body {
    position: relative;
    width: calc(var(--rt-slot-width) * var(--rt-slot-count));
    background-image: repeating-linear-gradient(
        to right,
        var(--rt-grid-line) 0,
        var(--rt-grid-line) 1px,
        transparent 1px,
        transparent var(--rt-slot-width)
    );
}

.rt__column {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
}

.rt__column--weekend {
    background: var(--rt-weekend-bg);
}

.rt__column--today {
    background: var(--rt-today-bg);
}

.rt__row {
    position: absolute;
    left: 0;
    right: 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--rt-grid-line);
}

.rt__background {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
}

.rt__bar {
    position: absolute;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 6px;
    overflow: hidden;
    font-size: 12px;
    white-space: nowrap;
    background: var(--rt-bar-bg);
    color: var(--rt-bar-text);
    border-radius: var(--rt-radius);
    cursor: pointer;
}

/** Обрізаний край — прямий, щоб було видно, що подія триває далі. */
.rt__bar--clipped-start {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.rt__bar--clipped-end {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}
</style>
