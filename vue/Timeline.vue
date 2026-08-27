<template>
    <div ref="rootRef" class="rt" :class="[themeClass, modeClass]" :style="rootStyle">
        <!--
            Шапка — окрема смуга над скролером, а не рядок усередині нього.
            Тоді під нею нічого не проїжджає, а в режимі сторінки вона може
            липнути до вікна: усередині скролера це неможливо, бо будь-який
            overflow створює власний контекст прокрутки й перехоплює sticky.
        -->
        <div class="rt__header" :style="headerStyle">
            <div class="rt__corner">
                <slot name="corner" />
            </div>

            <!-- Вікно, у якому вісь дат їде разом із сіткою; кут лишається на місці -->
            <div class="rt__axis-viewport">
                <div ref="headerTrackRef" class="rt__axis">
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
            </div>
        </div>


        <div ref="scrollerRef" class="rt__scroller" @scroll.passive="onScroll">
            <div ref="gridRef" class="rt__grid">
                <div ref="resourcesRef" class="rt__resources" :style="{ height: totalHeight + 'px' }">
                <div
                    v-for="visible in visibleRows"
                    :key="visible.row.resource.id"
                    class="rt__resource"
                    :class="{ 'rt__resource--last': visible.isLast }"
                    :style="rowStyle(visible)"
                >
                    <slot name="resource" :resource="visible.row.resource">
                        {{ visible.row.resource.title }}
                    </slot>
                </div>
            </div>

            <div ref="bodyRef" class="rt__body" :style="{ height: totalHeight + 'px' }" @click="onBodyClick">
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
                    :class="{ 'rt__row--last': visible.isLast }"
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

        <!--
            Смуга прокрутки, прилипла до низу вікна: у режимі сторінки справжня
            лежить у кінці таблиці, куди ще треба доскролити. Це порожній
            скролер тієї ж ширини, синхронізований із сіткою в обидва боки.
        -->
        <div v-if="pageScroll" ref="scrollbarRef" class="rt__scrollbar" @scroll.passive="onScrollbarScroll">
            <div class="rt__scrollbar-track" :style="{ width: contentWidth + 'px' }" />
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
        /**
         * Розміри в пікселях; кольори й решта оформлення — через токени --rt-*.
         * Ширина слота мінімальна: якщо місця більше, колонки розтягуються.
         */
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
        /**
         * "container" — таблиця скролиться всередині заданої висоти.
         * "page" — росте на всю висоту, вертикально скролиться сторінка, а
         * шапка й смуга прокрутки липнуть до вікна.
         */
        scroll?: "container" | "page";
        /** Висота власної липкої шапки застосунку; лише для scroll: "page". */
        stickyOffset?: number;
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
        scroll: "container",
        stickyOffset: 0,
    },
);

const pageScroll = computed(() => props.scroll === "page");
const modeClass = computed(() => (pageScroll.value ? "rt--page-scroll" : "rt--container-scroll"));
/**
 * Відступ під чужу шапку теж кратний пристроєвому пікселю: коли наша шапка
 * прилипає, саме він задає, де опиниться її нижня межа.
 */
const headerStyle = computed(() =>
    pageScroll.value ? { top: `${snapToDevice(props.stickyOffset, Math.ceil)}px` } : undefined,
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
const bodyRef = ref<HTMLElement | null>(null);
const gridRef = ref<HTMLElement | null>(null);
const resourcesRef = ref<HTMLElement | null>(null);
const scrollerRef = ref<HTMLElement | null>(null);
const headerTrackRef = ref<HTMLElement | null>(null);
const scrollbarRef = ref<HTMLElement | null>(null);
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
/** Виміряна ширина під панель ресурсів разом із колонками. */
const totalWidth = ref(0);

/**
 * Пристроєвих пікселів на CSS-піксель. На 125% масштабу це 1.25, і саме там
 * ламається «ціла ширина = чіткі лінії»: 31 CSS-піксель — це 38.75
 * пристроєвих, тож кожна наступна лінія лягає на чверть пікселя далі, а
 * кожна четверта — рівно на межу. Три лінії розмиті, четверта різка, і око
 * читає це як нерівну товщину.
 */
const pixelRatio = ref(1);

/** Розмір, кратний пристроєвому пікселю: усі лінії лягають однаково. */
function snapToDevice(size: number, round: (value: number) => number): number {
    const snapped = round(Math.round(size * pixelRatio.value * 1e4) / 1e4) / pixelRatio.value;
    // Дробове ділення дає хвіст у 15-му знаку; у CSS він ні до чого
    return Math.round(snapped * 1e4) / 1e4;
}

/** Скільки бракує розміру, щоб його край ліг рівно на пристроєвий піксель. */
function deviceDrift(size: number): number {
    return snapToDevice(size, Math.ceil) - size;
}

/**
 * Задана ширина слота — мінімальна. Якщо в контейнері лишається місце,
 * колонки розтягуються на нього: порожня смуга праворуч від сітки виглядає
 * як недомальований компонент, а не як свідоме рішення.
 *
 * Ширина кратна пристроєвому пікселю, а не цілому CSS-пікселю: вирівнює
 * лінії саме перший, а другий збігається з ним лише на 100% масштабу.
 * Розтяжка округлюється вниз, щоб влізти, мінімум — угору, щоб не впасти
 * нижче заданого.
 */
const slotWidth = computed(() => {
    const count = layout.value.slots.length;
    if (!props.stretch || totalWidth.value <= 0 || count === 0) return props.slotWidth;

    return Math.max(
        snapToDevice(props.slotWidth, Math.ceil),
        snapToDevice((totalWidth.value - props.resourceWidth) / count, Math.floor),
    );
});

/**
 * Залишок від ділення забирає панель ресурсів: кілька зайвих пікселів у ній
 * непомітні, а нерівні лінії в сітці помітні одразу.
 *
 * Разом із залишком панель забирає й дробовий зсув. Кратної ширини дня мало:
 * вона робить лінії однаковими між собою, але всі однаково розмитими, якщо
 * сама сітка починається з півпікселя — а звідки їй починатись, вирішує
 * компонування застосунку. Дешевше зсунути панель на цю дробу, ніж лишити
 * весь місяць висіти між пристроєвими пікселями.
 */
const paneWidth = computed(() => {
    const count = layout.value.slots.length;
    if (!props.stretch || totalWidth.value <= 0 || count === 0) return props.resourceWidth;

    // Залишок округлюємо вниз, щоб влізти; мінімум — угору, щоб не впасти
    // нижче заданого. Обидва краї вирівняні, тож дробі нема де взятись навіть
    // тоді, коли панель уперлася в мінімум і забирати вже нічого.
    const rest = alignPane(totalWidth.value - slotWidth.value * count, Math.floor);

    return Math.max(alignPane(props.resourceWidth, Math.ceil), rest);
});

/**
 * Найближча ширина панелі, за якої сітка починається рівно на пристроєвому
 * пікселі. Вирівнюється саме панель: вона одна, а колонок тридцять одна.
 */
function alignPane(width: number, round: (value: number) => number): number {
    const offset = Math.round((contentOrigin.value + width) * pixelRatio.value * 1e4) / 1e4;
    const aligned = width + (round(offset) - offset) / pixelRatio.value;

    return Math.round(aligned * 1e4) / 1e4;
}

const availableWidth = computed(() => Math.max(0, totalWidth.value - paneWidth.value));

/**
 * Ліва межа сітки без нашої панелі: усе, що поставив застосунок — відступи
 * сторінки, бічне меню, проміжок між картками. Панель вирівнюється саме від
 * неї, і саме тому тут її ширини немає: інакше вимірювання ганялося б за
 * власним результатом.
 */
const contentOrigin = ref(0);

/**
 * Висоти теж кратні пристроєвому пікселю — з тієї ж причини, що й ширини:
 * інакше роздільник кожного наступного рядка лягав би на іншу частку пікселя.
 * Округлення вгору, щоб бари не притискались до межі.
 */
const rowHeights = computed(() =>
    layout.value.rows.map((row) =>
        snapToDevice(
            Math.max(props.minRowHeight, row.laneCount * props.barHeight + (row.laneCount + 1) * props.barGap),
            Math.ceil,
        ),
    ),
);

const offsets = computed(() => rowOffsets(rowHeights.value));
const totalHeight = computed(() => offsets.value[offsets.value.length - 1] ?? 0);

const slice = computed(() => visibleSlice(offsets.value, scrollTop.value, viewportHeight.value, props.overscan));

interface VisibleRow {
    row: Row<R, I>;
    top: number;
    height: number;
    /** Останній рядок не малює нижній роздільник — там уже край контейнера. */
    isLast: boolean;
}

const visibleRows = computed<VisibleRow[]>(() =>
    layout.value.rows.slice(slice.value.start, slice.value.end).map((row, position) => {
        const index = slice.value.start + position;
        return {
            row,
            top: offsets.value[index],
            height: rowHeights.value[index],
            isLast: index === layout.value.rows.length - 1,
        };
    }),
);

/**
 * Горизонтальна прокрутка одна на всіх: шапку зсуваємо трансформацією, а не
 * власним скролером. Два справжні скролери довелося б синхронізувати, і саме
 * на цьому місці FullCalendar тримає найбільше коду.
 */
function onScroll() {
    const scroller = scrollerRef.value;
    if (scroller === null) return;

    if (!pageScroll.value) scrollTop.value = scroller.scrollTop;

    const offset = scroller.scrollLeft;
    if (headerTrackRef.value !== null) {
        headerTrackRef.value.style.transform = `translateX(${-offset}px)`;
    }
    // Те саме обрізання, що шапці дає її вікно: тіло їде під панель ресурсів,
    // а між панелями лишається проміжок, крізь який інакше видно лінії сітки —
    // календар ніби вилазить із-під власної картки.
    if (bodyRef.value !== null) {
        bodyRef.value.style.clipPath = offset > 0 ? `inset(0 0 0 ${offset}px)` : "";
    }
    if (scrollbarRef.value !== null && scrollbarRef.value.scrollLeft !== offset) {
        scrollbarRef.value.scrollLeft = offset;
    }
}

/** Прилипла смуга веде сітку; захист від відлуння — звірка поточного значення. */
function onScrollbarScroll() {
    const scroller = scrollerRef.value;
    const scrollbar = scrollbarRef.value;
    if (scroller === null || scrollbar === null) return;
    if (scroller.scrollLeft === scrollbar.scrollLeft) return;

    scroller.scrollLeft = scrollbar.scrollLeft;
}

/**
 * У режимі сторінки вікном прокрутки є саме вікно: рахуємо, наскільки тіло
 * сітки виїхало вгору за липку шапку застосунку.
 */
function syncPageViewport() {
    const body = bodyRef.value;
    if (body === null || !pageScroll.value) return;

    const top = body.getBoundingClientRect().top;
    const visibleTop = props.stickyOffset + headerHeight.value;

    scrollTop.value = Math.max(0, visibleTop - top);
    viewportHeight.value = Math.max(0, window.innerHeight - visibleTop);
}

const headerHeight = ref(0);
/**
 * Ширина вмісту сітки — під неї підганяється прилипла смуга прокрутки.
 * Читається після переверстки, а не в тому ж проході, що задає колонки:
 * інакше смуга запам'ятала б ширину «до підгонки» й показала б хід прокрутки
 * там, де прокручувати вже нічого.
 */
const contentWidth = ref(0);

/**
 * Два дробові відступи, якими вертикаль сідає на пристроєві пікселі: перший
 * зсуває весь компонент, другий добирає висоту шапки. Обидва менші за піксель
 * і на око не читаються, зате нижня межа шапки й усі роздільники рядків після
 * них лягають рівно, а не між пікселями.
 */
const lead = ref(0);
const headerPad = ref(0);

function syncViewport() {
    const scroller = scrollerRef.value;
    if (scroller === null) return;

    contentWidth.value = scroller.scrollWidth;
    // Масштаб сторінки змінюється разом із її розміром, тож читається тут же
    pixelRatio.value = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    measureVertical();
    totalWidth.value = measureGeometry();

    if (pageScroll.value) syncPageViewport();
    else viewportHeight.value = scroller.clientHeight;
}

/**
 * Вертикальні відступи вирівнювання. Власний внесок віднімається назад, і то
 * не з наших змінних, а з розмітки: коли обидва вимірювання йдуть з DOM, їм
 * нема як розійтися, хоч би коли спостерігач розміру нас розбудив.
 */
function measureVertical() {
    const root = rootRef.value;
    const header = headerTrackRef.value;
    if (root === null || header === null) return;

    // Верх компонента в координатах документа: на екранні його переводить
    // прокрутка, а вона в браузері й так кратна пристроєвому пікселю.
    const top = root.getBoundingClientRect().top + window.scrollY;
    lead.value = deviceDrift(top);

    const applied = parseFloat(getComputedStyle(header).paddingBottom) || 0;
    const natural = header.getBoundingClientRect().height - applied;
    headerPad.value = deviceDrift(natural);
    headerHeight.value = natural + headerPad.value;
}

/**
 * Скільки місця дістається панелі ресурсів разом із колонками — і заразом
 * звідки починається сітка. Рахувати від props не можна: застосунок додає
 * проміжок між панелями, рамки й відступи, і сітка вилізе рівно на цю різницю.
 * Тому міряємо реальні краї.
 *
 * Зворотного зв'язку немає: ліва межа сітки й проміжок між панелями не
 * залежать від того, якої ширини ми зробимо панель і колонки.
 */
function measureGeometry(): number {
    const root = scrollerRef.value;
    const grid = gridRef.value;
    const body = bodyRef.value;
    if (root === null) return 0;

    // jsdom і прихований контейнер не міряються — лишаємо оцінку за props
    if (grid === null || body === null || body.offsetLeft === 0) return root.clientWidth;

    // Усе дробом, а не через offsetWidth: округлення до цілого гуляє на піксель,
    // а піксель тут коштує цілу сходинку ширини дня — колонки б смикались.
    const styles = getComputedStyle(body);
    const borders = (parseFloat(styles.borderLeftWidth) || 0) + (parseFloat(styles.borderRightWidth) || 0);

    // Ліворуч від сітки лежить панель, її рамки й проміжок. Власну ширину
    // панелі віднімаємо назад, і лишається тільки чуже — те, чим розпоряджається
    // застосунок. Від наших колонок ця величина не залежить, тож кола немає.
    // Прямокутники беремо в сітки й тіла: панель липка й при горизонтальній
    // прокрутці їде вправо разом із вікном, тобто про своє місце бреше.
    const bodyLeft = body.getBoundingClientRect().left;
    const chrome = bodyLeft - grid.getBoundingClientRect().left - paneWidth.value;

    // Прокрутку додаємо назад: рахувати треба від нескрученого стану, інакше
    // колонки перераховувались би на кожен горизонтальний рух.
    contentOrigin.value = bodyLeft + root.scrollLeft - paneWidth.value;

    // Цілий піксель запасу: clientWidth округлений, і на дробових масштабах
    // (125%, 150%) рамка правого краю інакше лягає рівно на межу прокрутки
    // й зникає. Зайвий піксель фону праворуч непомітний, зникла рамка — ні.
    return root.clientWidth - chrome - borders - 1;
}

/**
 * Прокрутити вісь до дати. За замовчуванням дата опиняється по центру видимої
 * частини — саме те, що потрібно для «показати сьогодні».
 */
function scrollToDate(date: IsoDate, align: "start" | "center" = "center") {
    if (scrollerRef.value === null) return;

    const index = layout.value.slots.findIndex((slot) => slot.start <= date && date < slot.end);
    if (index < 0) return;

    const position = index * slotWidth.value;
    const left = align === "center" ? position - availableWidth.value / 2 + slotWidth.value / 2 : position;

    scrollerRef.value.scrollLeft = Math.max(0, left);
    onScroll();
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
    "--rt-resource-width": `${paneWidth.value}px`,
    "--rt-slot-count": String(layout.value.slots.length),
    // Внутрішня кухня вирівнювання, а не токени: значення тут виміряні, і
    // задавати їх ззовні нема сенсу — застосунок не знає ні масштабу, ні
    // того, з якої частки пікселя почалась його ж сторінка.
    "--rt-lead": `${lead.value}px`,
    "--rt-header-pad": `${headerPad.value}px`,
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

    if (pageScroll.value) {
        window.addEventListener("scroll", syncPageViewport, { passive: true });
        window.addEventListener("resize", syncViewport, { passive: true });
    }

    if (props.scrollTo !== undefined) {
        nextTick(() => scrollToDate(props.scrollTo as IsoDate));
    }

    if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(syncViewport);
        // Скролер каже, скільки місця є; сітка — скільки зайнято. Друге
        // спостереження обов'язкове, бо ширину колонок задаємо ми самі: у
        // проході, який її міняє, вміст ще старий, і справжня ширина відома
        // лише на наступній верстці. Замкнутого кола немає — вимірювання
        // спирається на проміжок і рамки, а вони від наших колонок не залежать.
        if (scrollerRef.value !== null) observer.observe(scrollerRef.value);
        if (gridRef.value !== null) observer.observe(gridRef.value);
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
    window.removeEventListener("scroll", syncPageViewport);
    window.removeEventListener("resize", syncViewport);

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
    /* Лінія на правому краї слота, а не на лівому: інакше перша збіглася б
       із рамкою контейнера й читалася як подвійна. Один опис для шапки й
       сітки, щоб вони не могли розійтись. */
    --rt-grid-lines: repeating-linear-gradient(
        to right,
        transparent 0,
        transparent calc(var(--rt-slot-width) - 1px),
        var(--rt-grid-line) calc(var(--rt-slot-width) - 1px),
        var(--rt-grid-line) var(--rt-slot-width)
    );
    /* Проміжок між панеллю ресурсів і сіткою; шапка й тіло беруть його разом. */
    --rt-pane-gap: 0px;
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
    display: flex;
    flex-direction: column;
    /* Частка пікселя, якою компонент сідає на пристроєву сітку */
    padding-top: var(--rt-lead, 0px);
    background: var(--rt-surface);
    color: var(--rt-text);
}

/* Висоту задає споживач; прокрутка живе всередині */
.rt--container-scroll {
    overflow: hidden;
}

/**
 * Шапка стоїть над скролером, а не в ньому. Це єдиний спосіб дати їй липнути
 * до вікна: будь-який overflow створює власний контекст прокрутки, і sticky
 * усередині нього чіпляється за контейнер, а не за сторінку.
 *
 * Горизонтально вісь дат веде трансформація, а не другий скролер: два
 * справжні скролери довелося б синхронізувати подіями, і саме там подібні
 * компоненти набирають найбільше коду й найбільше смикань.
 */
.rt__header {
    position: relative;
    z-index: 2;
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: var(--rt-resource-width) minmax(0, 1fr);
    column-gap: var(--rt-pane-gap);
}

.rt--page-scroll .rt__header {
    position: sticky;
}

.rt__axis-viewport {
    overflow: hidden;
}

.rt__scroller {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: auto;
}

.rt--container-scroll .rt__scroller {
    overflow-y: auto;
}

/**
 * У режимі сторінки справжня смуга скролера лежить у кінці таблиці: догорнувши
 * донизу, побачиш дві поспіль — її і прилиплу. Ховаємо справжню; прокрутка
 * колесом, тачпадом і клавіатурою від цього не зникає, а видима лишається одна.
 */
.rt--page-scroll .rt__scroller {
    scrollbar-width: none;
}

.rt--page-scroll .rt__scroller::-webkit-scrollbar {
    display: none;
}

/**
 * Смуга прокрутки, прилипла до низу вікна: у режимі сторінки справжня лежить
 * у кінці таблиці, тобто поза екраном, поки не догорнеш до самого низу.
 */
.rt__scrollbar {
    position: sticky;
    bottom: 0;
    z-index: 3;
    flex: 0 0 auto;
    overflow-x: auto;
    overflow-y: hidden;
}

.rt__scrollbar-track {
    height: 1px;
}

.rt__grid {
    display: grid;
    grid-template-columns: var(--rt-resource-width) max-content;
    column-gap: var(--rt-pane-gap);
    width: max-content;
    min-width: 100%;
    /* Піксель у хвості вмісту: догорнувши до кінця, рамка правого краю інакше
       лягає рівно на межу обрізання скролера, і браузер її просто не малює.
       Ширину це не з'їдає — рівно на цей піксель вимірювання лишає запас. */
    padding-right: 1px;
}

.rt__corner,
.rt__axis {
    background-color: var(--rt-header-bg);
    border-bottom: 1px solid var(--rt-grid-line);
}

.rt__corner {
    border-right: 1px solid var(--rt-grid-line);
}

/**
 * Роздільники шапки — той самий градієнт, що й у сітці, а не бордери клітинок.
 * Браузер округлює колонки grid до 1/64 пікселя, похибка накопичується вздовж
 * місяця, і бордер клітинки роз'їжджався з лінією сітки на видимий піксель.
 * Спільний градієнт розійтися не може за побудовою.
 */
.rt__axis {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--rt-slot-width);
    width: max-content;
    /* Добір висоти до цілого пристроєвого пікселя: інакше нижня межа шапки
       ділиться між двома рядами пікселів і на світлій лінії просто зникає. */
    padding-bottom: var(--rt-header-pad, 0px);
    background-image: var(--rt-grid-lines);
    background-size: calc(100% - 2px) 100%;
    background-repeat: no-repeat;
    will-change: transform;
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
    /* Як і в сітки: задана висота — це рядки, а рамка застосунку додається
       зовні. Інакше панелі закінчуються на різній висоті. */
    box-sizing: content-box;
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
    /* Ширина — це рівно колонки: рамка застосунку має додаватись зовні,
       інакше сітка стане вужчою за шапку на товщину рамок. */
    box-sizing: content-box;
    width: calc(var(--rt-slot-width) * var(--rt-slot-count));
    /* Сітка фарбує своє тло сама, як панель ресурсів і шапка. Покладатись на
       тло кореня не можна: застосунок, що розводить панелі в дві картки,
       робить корінь прозорим — і тоді сітка лишалась би єдиною діркою. */
    background-color: var(--rt-surface);
    /* Останню лінію не малюємо — правий край закриває рамка, як і лівий. */
    background-image: var(--rt-grid-lines);
    background-size: calc(100% - 2px) 100%;
    background-repeat: no-repeat;
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

/**
 * Останній рядок позначений класом, але бордер лишається: чи прибирати його,
 * вирішує застосунок — там, де в нього є власна рамка, лінія подвоїться, а
 * там, де рамки немає (панель на самій тіні), вона і є нижнім краєм картки.
 */

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
