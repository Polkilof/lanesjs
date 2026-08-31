/**
 * Публічний контракт Lanes. Цей файл — RFC на API: усе, що тут експортується,
 * побачить сторонній розробник, тож зміни тут дорожчі за зміни будь-де в теці.
 *
 * Нуль імпортів — ні з "@/", ні з FullCalendar, ні з Vue. Див. ../BRIEF.md
 */

/**
 * «Настінна» дата у форматі YYYY-MM-DD, без часової зони (рішення 05).
 * Зона — турбота форматера у шарі vue, ядро її не знає.
 */
export type IsoDate = string;

/** Діапазон дат. `end` — ексклюзивний, як у FullCalendar (рішення 03). */
export interface DateRange {
    start: IsoDate;
    end: IsoDate;
}

/** Крок осі часу. Години й дрібніші кроки — платний шар. */
export type SlotStep = "day" | "week";

/**
 * Рядок таймлайна. Усе прикладне — аватар, посада, дата звільнення — живе в `meta`
 * і рендериться слотом; ядро в `meta` не заглядає.
 */
export interface Resource<M = unknown> {
    id: string;
    title: string;
    meta?: M;
}

/**
 * `bar` — звичайна подія, займає доріжку в рядку.
 * `background` — підкладка під сіткою, не бере участі в укладанні доріжок:
 * періоди, коли ресурс узагалі недоступний, свята, робочі години.
 */
export type ItemDisplay = "bar" | "background";

/** Подія на таймлайні. Колір, іконка, статус — у `meta`, не в ядрі. */
export interface Item<M = unknown> {
    id: string;
    resourceId: string;
    start: IsoDate;
    /** Ексклюзивний: подія на один день — це start=01, end=02. */
    end: IsoDate;
    /** За замовчуванням "bar". */
    display?: ItemDisplay;
    meta?: M;
}

/** Одна колонка осі. */
export interface Slot {
    index: number;
    start: IsoDate;
    /** Ексклюзивний. */
    end: IsoDate;
    /** Локальна опівніч початку слота — лише для форматерів у шарі vue. */
    date: Date;
    isToday: boolean;
    isWeekend: boolean;
}

/** Подія, покладена на сітку. Координати — у слотах, не в пікселях (рішення 06). */
export interface PlacedItem<M = unknown> {
    item: Item<M>;
    /** Індекс слота, з якого подія починається у видимому вікні. */
    slotIndex: number;
    /** Скільки слотів займає у видимому вікні; завжди ≥ 1. */
    slotSpan: number;
    /** Доріжка всередині рядка: 0, якщо перекриттів немає. */
    lane: number;
    /** Подія починається до / закінчується після видимого діапазону. */
    clippedStart: boolean;
    clippedEnd: boolean;
}

/** Рядок результату розкладки. */
export interface Row<R = unknown, I = unknown> {
    resource: Resource<R>;
    bars: PlacedItem<I>[];
    /** Підкладки: без доріжок, малюються під сіткою. */
    backgrounds: PlacedItem<I>[];
    /** Скільки доріжок займає рядок; мінімум 1. Висота рядка = f(laneCount). */
    laneCount: number;
}

/** Повний результат розкладки — усе, що потрібно шару vue для рендеру. */
export interface Layout<R = unknown, I = unknown> {
    range: DateRange;
    step: SlotStep;
    slots: Slot[];
    rows: Row<R, I>[];
}

/**
 * Вхід розкладки. Компонент контрольований (рішення 04): порядок `resources` —
 * це і є порядок рядків, ядро нічого не сортує й не фільтрує.
 */
export interface LayoutInput<R = unknown, I = unknown> {
    range: DateRange;
    step: SlotStep;
    resources: Resource<R>[];
    items: Item<I>[];
    /** Що вважати «сьогодні». Передається явно, щоб тести були детермінованими. */
    today?: IsoDate;
    /** Дні тижня-вихідні, 0 — неділя. За замовчуванням [0, 6]. */
    weekendDays?: number[];
    /** З якого дня починається тиждень при step: "week". За замовчуванням 1 (понеділок). */
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Події таймлайна. На них підписується і застосунок, і плагіни. */
export interface TimelineEvents<R = unknown, I = unknown> {
    /**
     * Картинка змінилась: перераховано розкладку або геометрію. Сигнал для
     * тих, хто малює в шарі накладок — час перемалювати.
     */
    layout: (layout: Layout<R, I>) => void;
    /** Клік по порожній клітинці. */
    cellClick: (payload: { date: IsoDate; resource: Resource<R> }) => void;
    /** Клік по події. */
    itemClick: (payload: { item: Item<I>; resource: Resource<R> }) => void;
    /** Клік по підпису колонки. */
    slotClick: (payload: { slot: Slot }) => void;
    /** Видимий діапазон змінився — застосунок вантажить дані. */
    rangeChange: (range: DateRange) => void;
}

/**
 * Те, що плагін отримує на старті. Мінімальна поверхня: читати розкладку,
 * слухати події, просити перерахунок.
 */
/**
 * Геометрія сітки в пікселях. Плагін не має права її вимірювати сам: ширина
 * дня й висоти рядків — результат вирівнювання по пристроєвих пікселях, і
 * повторне вимірювання дало б інші числа, ніж ті, за якими малює компонент.
 */
export interface Geometry {
    slotWidth: number;
    /** Верх кожного рядка від початку тіла; довжина на одиницю більша. */
    rowOffsets: number[];
    /**
     * Висота бара й проміжок між доріжками. Без них не порахувати, де бар
     * лежить усередині рядка, а це потрібно всім, хто малює по барах.
     */
    barHeight: number;
    barGap: number;
}

/** Що лежить під точкою. Порожні місця теж влучання — там створюють події. */
export interface HitTest<R = unknown> {
    resource: Resource<R>;
    resourceIndex: number;
    slot: Slot;
    date: IsoDate;
}

export interface PluginContext<R = unknown, I = unknown> {
    getLayout(): Layout<R, I>;
    /** Кореневий елемент; у ядрі завжди null, заповнює шар vue. */
    getRoot(): HTMLElement | null;
    /**
     * Шар для власних накладок плагіна — привидів перетягування, рамок
     * виділення. Лежить у координатах сітки й не ловить вказівник, тож
     * плагін малює в ньому, не заважаючи клікам по барах.
     */
    getOverlay(): HTMLElement | null;
    getGeometry(): Geometry;
    /**
     * Ресурс і день під точкою у координатах вікна — тими самими, що їх дає
     * подія вказівника. Поза сіткою — null.
     */
    hitTest(point: { x: number; y: number }): HitTest<R> | null;
    /** Підписка; повертає функцію відписки. */
    on<K extends keyof TimelineEvents<R, I>>(
        event: K,
        handler: TimelineEvents<R, I>[K],
    ): () => void;
    /** Попросити перерахунок розкладки. */
    requestUpdate(): void;
}

/**
 * Точка розширення (рішення 01). Платний шар — це набір плагінів:
 * перетягування, віртуалізація, масштаб. Ядро про них не знає нічого.
 */
export interface Plugin<R = unknown, I = unknown> {
    name: string;
    /** Повернена функція викликається при знищенні таймлайна. */
    setup(ctx: PluginContext<R, I>): void | (() => void);
}

/**
 * Те, що застосунок дістає через `ref` на компонент.
 *
 * Оголошено тут, а не виведено з компонента, бо вивести його споживач не може:
 * `Timeline` — узагальнений SFC, тобто функція, а не конструктор, і звичне
 * `InstanceType<typeof Timeline>` на ньому не компілюється взагалі. Без
 * названого типу лишалось би або тягнути `vue-component-type-helpers`, або
 * переписувати цю форму в себе — обидва варіанти гірші за один експорт.
 *
 * `layout` тут — уже розгорнута розкладка, а не `ComputedRef`: рефи розгортає
 * проксі, який Vue робить із `defineExpose`.
 */
export interface TimelineInstance<R = unknown, I = unknown> {
    layout: Layout<R, I>;
    /** Перевиміряти вікно — після власної зміни розмірів контейнера. */
    syncViewport(): void;
    scrollToDate(date: IsoDate, align?: "start" | "center"): void;
    /** Намалювати всю таблицю, надрукувати й повернути віртуалізацію. */
    print(): Promise<void>;
}
