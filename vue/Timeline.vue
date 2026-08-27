<template>
    <div ref="rootRef" class="rt" :style="rootStyle">
        <div class="rt__grid">
            <div class="rt__corner">
                <slot name="corner" />
            </div>

            <div class="rt__axis">
                <div
                    v-for="slot in layout.slots"
                    :key="slot.start"
                    class="rt__axis-cell"
                    :class="{ 'rt__axis-cell--today': slot.isToday, 'rt__axis-cell--weekend': slot.isWeekend }"
                    @click="emit('slot-click', { slot })"
                >
                    <slot name="slot-label" :slot-data="slot">
                        {{ slot.date.getDate() }}
                    </slot>
                </div>
            </div>

            <div class="rt__resources">
                <div
                    v-for="row in layout.rows"
                    :key="row.resource.id"
                    class="rt__resource"
                    :style="rowStyle(row)"
                >
                    <slot name="resource" :resource="row.resource">
                        {{ row.resource.title }}
                    </slot>
                </div>
            </div>

            <div class="rt__body" @click="onBodyClick">
                <!-- Накладки на всю висоту: по одному елементу на позначену колонку,
                     а не на кожну клітинку (рішення 09). -->
                <div
                    v-for="slot in markedSlots"
                    :key="slot.start"
                    class="rt__column"
                    :class="{ 'rt__column--today': slot.isToday, 'rt__column--weekend': slot.isWeekend }"
                    :style="{ left: px(slot.index), width: px(1) }"
                    aria-hidden="true"
                />

                <div
                    v-for="row in layout.rows"
                    :key="row.resource.id"
                    class="rt__row"
                    :style="rowStyle(row)"
                    :data-resource="row.resource.id"
                >
                    <div
                        v-for="placed in row.backgrounds"
                        :key="placed.item.id"
                        class="rt__background"
                        :class="props.itemClass?.(placed, row.resource)"
                        :style="{ left: px(placed.slotIndex), width: px(placed.slotSpan) }"
                        aria-hidden="true"
                    >
                        <slot name="background" :placed="placed" />
                    </div>

                    <div
                        v-for="placed in row.bars"
                        :key="placed.item.id"
                        class="rt__bar"
                        :class="[
                            {
                                'rt__bar--clipped-start': placed.clippedStart,
                                'rt__bar--clipped-end': placed.clippedEnd,
                            },
                            props.itemClass?.(placed, row.resource),
                        ]"
                        :style="barStyle(placed)"
                        @click.stop="emit('item-click', { item: placed.item, resource: row.resource })"
                    >
                        <slot name="item" :placed="placed" :resource="row.resource">
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
 * через calc() і жодного вимірювання DOM заради розкладки (рішення 06).
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { buildLayout } from "../core/layout";
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
        /** Класи на бар — єдиний спосіб пофарбувати подію за її даними. */
        itemClass?: (placed: PlacedItem<I>, resource: Resource<R>) => string | string[] | undefined;
        /** Ширина слота й панелі ресурсів; решта оформлення — через токени --rt-*. */
        slotWidth?: string;
        resourceWidth?: string;
        barHeight?: string;
    }>(),
    {
        step: "day",
        slotWidth: "40px",
        resourceWidth: "253px",
        barHeight: "28px",
    },
);

const emit = defineEmits<{
    "cell-click": [payload: { date: IsoDate; resource: Resource<R> }];
    "item-click": [payload: { item: Item<I>; resource: Resource<R> }];
    "slot-click": [payload: { slot: Slot }];
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

/** У DOM потрапляють лише позначені колонки — решта сітки намальована градієнтом. */
const markedSlots = computed(() => layout.value.slots.filter((slot) => slot.isToday || slot.isWeekend));

const rootStyle = computed(() => ({
    "--rt-slot-width": props.slotWidth,
    "--rt-resource-width": props.resourceWidth,
    "--rt-bar-height": props.barHeight,
    "--rt-slot-count": String(layout.value.slots.length),
}));

/** Слоти → пікселі. Єдине місце, де відбувається це перетворення. */
function px(slots: number): string {
    return `calc(var(--rt-slot-width) * ${slots})`;
}

function rowStyle(row: Row<R, I>) {
    return {
        height: `calc(var(--rt-bar-height) * ${row.laneCount} + var(--rt-bar-gap) * ${row.laneCount + 1})`,
    };
}

function barStyle(placed: PlacedItem<I>) {
    return {
        left: px(placed.slotIndex),
        width: px(placed.slotSpan),
        top: `calc((var(--rt-bar-height) + var(--rt-bar-gap)) * ${placed.lane} + var(--rt-bar-gap))`,
    };
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

    emit("cell-click", { date: slot.start, resource });
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
    for (const teardown of teardowns) teardown();
    teardowns.length = 0;
});

defineExpose({ layout });
</script>

<style>
/**
 * Публічні токени (рішення 02). Задані через :where(), щоб будь-яке
 * перевизначення ззовні вигравало без !important і без гонки специфічності.
 */
:where(.rt) {
    --rt-bar-gap: 4px;
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

.rt__resources {
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--rt-surface);
    border-right: 1px solid var(--rt-grid-line);
}

.rt__resource {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    padding: 0 12px;
    overflow: hidden;
    border-bottom: 1px solid var(--rt-grid-line);
}

/**
 * Вертикальні лінії сітки — градієнт, а не DOM на клітинку (рішення 09):
 * 300 ресурсів на місяць коштують 300 елементів, а не 9300.
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
    position: relative;
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
    height: var(--rt-bar-height);
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
