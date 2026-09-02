import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import Timeline from "@/lanes/vue/Timeline.vue";
import { drag } from "@/lanes/pro/drag";
import { create } from "@/lanes/pro/create";
import { links } from "@/lanes/pro/links";
import type { DragMove, DragResize } from "@/lanes/pro/drag";
import type { DragCreate } from "@/lanes/pro/create";
import type { Item, Plugin, PluginContext, Resource } from "@/lanes/core/types";

const resources: Resource[] = [
    { id: "r1", title: "Перший" },
    { id: "r2", title: "Другий" },
];

const range = { start: "2026-03-01", end: "2026-04-01" };

function render(props: Record<string, unknown> = {}) {
    return mount(Timeline, {
        props: { resources, items: [], range, ...props },
    });
}

describe("сітка", () => {
    it("малює по рядку на ресурс і по клітинці осі на слот", () => {
        const wrapper = render();

        expect(wrapper.findAll(".rt__row")).toHaveLength(2);
        expect(wrapper.findAll(".rt__axis-cell")).toHaveLength(31);
    });

    it("не створює DOM на клітинку сітки", () => {
        // 2 ресурси × 31 день дали б 62 клітинки; у DOM мають бути лише 2 рядки
        const wrapper = render();

        expect(wrapper.findAll(".rt__row, .rt__cell")).toHaveLength(2);
    });

    it("у DOM потрапляють лише позначені колонки", () => {
        const wrapper = render({ today: "2026-03-10" });

        expect(wrapper.findAll(".rt__column").length).toBeLessThan(31);
        expect(wrapper.findAll(".rt__column--today")).toHaveLength(1);
    });

    it("ширина тіла рахується зі слотів, а не вимірюється", () => {
        const wrapper = render({ slotWidth: 50 });

        expect(wrapper.attributes("style")).toContain("--rt-slot-width: 50px");
        expect(wrapper.attributes("style")).toContain("--rt-slot-count: 31");
    });
});

describe("підписи осі", () => {
    it("день підписується числом і скороченим днем тижня мовою застосунку", () => {
        // 2026-03-01 — неділя
        const wrapper = render({ locale: "uk-UA" });
        const first = wrapper.findAll(".rt__axis-cell")[0];

        expect(first.find(".rt__axis-day").text()).toBe("1");
        expect(first.find(".rt__axis-weekday").text()).toBe("нд");
    });

    it("мова змінює підпис, а не розмітку: жодних файлів локалей", () => {
        const wrapper = render({ locale: "en-US" });

        expect(wrapper.findAll(".rt__axis-cell")[0].find(".rt__axis-weekday").text()).toBe("Sun");
    });

    it("тиждень підписується діапазоном, а не числом свого понеділка", () => {
        const wrapper = render({ step: "week", locale: "uk-UA" });
        const first = wrapper.findAll(".rt__axis-cell")[0].find(".rt__axis-range").text();

        // Вісь при тижневому кроці починається в понеділок 23 лютого
        expect(first).toContain("23");
        expect(first).toContain("1");
    });
});

describe("віртуалізація осі", () => {
    const year = { start: "2026-01-01", end: "2027-01-01" };

    /** jsdom не рахує розмірів, тож ширину вікна підставляємо руками. */
    function renderWide(clientWidth: number) {
        const wrapper = mount(Timeline, {
            props: { resources, items: [], range: year, slotWidth: 40, stretch: false, overscan: 2 },
            attachTo: document.body,
        });

        const scroller = wrapper.find(".rt__scroller").element;
        Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
        (wrapper.vm as unknown as { syncViewport: () => void }).syncViewport();

        return wrapper;
    }

    it("у шапці лежать лише видимі дні, а не весь рік", async () => {
        const wrapper = renderWide(800);
        await wrapper.vm.$nextTick();

        // 800 / 40 = 20 днів у вікні плюс запас; рік — 365
        expect(wrapper.findAll(".rt__axis-cell").length).toBeLessThan(30);
    });

    it("клітинка знає свою колонку, тож вісь не з'їжджає", async () => {
        const wrapper = renderWide(800);
        await wrapper.vm.$nextTick();

        const first = wrapper.findAll(".rt__axis-cell")[0];
        expect(first.attributes("style")).toContain("grid-column-start: 1");
    });

    it("без відомої ширини вікна малює всю вісь", () => {
        // SSR і тестове середовище: краще зайвий DOM, ніж порожня шапка
        const wrapper = mount(Timeline, { props: { resources, items: [], range: year } });

        expect(wrapper.findAll(".rt__axis-cell")).toHaveLength(365);
    });
});

describe("друк", () => {
    const many: Resource[] = Array.from({ length: 40 }, (_, index) => ({
        id: `r${index}`,
        title: `Ресурс ${index}`,
    }));

    it("на папір іде вся таблиця, а не вікно", async () => {
        const wrapper = mount(Timeline, {
            props: { resources: many, items: [], range, barHeight: 28, barGap: 4, overscan: 2 },
            attachTo: document.body,
        });

        // jsdom не рахує розмірів: без цього рендериться все, і перевіряти нічого
        const scroller = wrapper.find(".rt__scroller").element;
        Object.defineProperty(scroller, "clientHeight", { value: 200, configurable: true });
        (wrapper.vm as unknown as { syncViewport: () => void }).syncViewport();
        await wrapper.vm.$nextTick();

        const print = vi.spyOn(window, "print").mockImplementation(() => {});

        expect(wrapper.findAll(".rt__row").length).toBeLessThan(40);

        // Скільки рядків було в розмітці саме в мить друку
        let printed = 0;
        print.mockImplementation(() => {
            printed = wrapper.findAll(".rt__row").length;
        });
        await (wrapper.vm as unknown as { print: () => Promise<void> }).print();

        expect(printed).toBe(40);
        // Після друку віртуалізація повертається: тримати все в DOM ні до чого
        expect(wrapper.findAll(".rt__row").length).toBeLessThan(40);

        print.mockRestore();
    });
});

describe("клавіатура", () => {
    const items: Item[] = [
        { id: "a", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" },
        { id: "b", resourceId: "r1", start: "2026-03-10", end: "2026-03-12" },
        { id: "c", resourceId: "r2", start: "2026-03-11", end: "2026-03-14" },
    ];

    const press = (bar: Element, key: string) =>
        bar.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

    it("у таблицю входять одним Tab, а не одним на кожну бронь", () => {
        const wrapper = render({ items });
        const tabbable = wrapper.findAll(".rt__bar").filter((bar) => bar.attributes("tabindex") === "0");

        expect(tabbable).toHaveLength(1);
        expect(tabbable[0].attributes("data-item")).toBe("a");
    });

    it("стрілка веде до наступного бара в рядку, а не до наступного дня", async () => {
        const wrapper = render({ items });

        press(wrapper.find('.rt__bar[data-item="a"]').element, "ArrowRight");
        await wrapper.vm.$nextTick();

        expect(wrapper.find('.rt__bar[data-item="b"]').attributes("tabindex")).toBe("0");
    });

    it("вниз шукає найближчий за часом бар сусіднього рядка", async () => {
        const wrapper = render({ items });

        press(wrapper.find('.rt__bar[data-item="b"]').element, "ArrowDown");
        await wrapper.vm.$nextTick();

        expect(wrapper.find('.rt__bar[data-item="c"]').attributes("tabindex")).toBe("0");
    });

    it("на краю рядка стрілку не забирає: сторінка має лишитись прокручуваною", async () => {
        const wrapper = render({ items });
        const event = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });

        wrapper.find('.rt__bar[data-item="b"]').element.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
    });

    it("Enter відкриває бронь так само, як клік", async () => {
        const wrapper = render({ items });

        press(wrapper.find('.rt__bar[data-item="a"]').element, "Enter");
        await wrapper.vm.$nextTick();

        expect(wrapper.emitted("item-click")?.[0]?.[0]).toMatchObject({ item: { id: "a" } });
    });

    it("бар має ім'я для того, хто його не бачить", () => {
        const wrapper = render({ items, locale: "uk-UA" });
        const label = wrapper.find('.rt__bar[data-item="a"]').attributes("aria-label") ?? "";

        expect(label).toContain("Перший");
        expect(label).toContain("2");
    });

    it("застосунок може дати барові власне ім'я", () => {
        const wrapper = render({
            items,
            itemLabel: (placed: PlacedItem) => `бронь ${placed.item.id}`,
        });

        expect(wrapper.find('.rt__bar[data-item="a"]').attributes("aria-label")).toBe("бронь a");
    });
});

describe("діапазон", () => {
    it("одразу віддає фактичний діапазон осі", () => {
        const wrapper = render();

        expect(wrapper.emitted("range-change")?.[0]?.[0]).toEqual(range);
    });

    it("при тижневому кроці віддає розширену вісь, а не задану в props", () => {
        // 2026-03-01 — неділя, вісь має початись у понеділок 23 лютого
        const wrapper = render({ step: "week" });

        expect(wrapper.emitted("range-change")?.[0]?.[0]).toEqual({
            start: "2026-02-23",
            end: "2026-04-06",
        });
    });

    it("не повторює подію, поки вісь не змінилась", async () => {
        const wrapper = render();
        await wrapper.setProps({ items: [{ id: "a", resourceId: "r1", start: "2026-03-05", end: "2026-03-06" }] });

        expect(wrapper.emitted("range-change")).toHaveLength(1);
    });
});

describe("бари", () => {
    const items: Item[] = [
        { id: "a", resourceId: "r1", start: "2026-03-05", end: "2026-03-08" },
        { id: "bg", resourceId: "r1", start: "2026-03-01", end: "2026-03-03", display: "background" },
    ];

    it("позиціонує бар через calc від індексу слота", () => {
        const bar = render({ items }).find(".rt__bar");

        expect(bar.attributes("style")).toContain("left: calc(var(--rt-slot-width) * 4)");
        expect(bar.attributes("style")).toContain("width: calc(var(--rt-slot-width) * 3)");
    });

    it("підкладки рендеряться окремо від барів", () => {
        const wrapper = render({ items });

        expect(wrapper.findAll(".rt__bar")).toHaveLength(1);
        expect(wrapper.findAll(".rt__background")).toHaveLength(1);
    });

    it("обрізаний край отримує клас", () => {
        const wrapper = render({
            items: [{ id: "a", resourceId: "r1", start: "2026-02-01", end: "2026-03-05" }],
        });

        expect(wrapper.find(".rt__bar").classes()).toContain("rt__bar--clipped-start");
    });

    it("клік по бару віддає подію та її ресурс", async () => {
        const wrapper = render({ items });
        await wrapper.find(".rt__bar").trigger("click");

        const payload = wrapper.emitted("item-click")?.[0]?.[0] as { item: Item; resource: Resource };
        expect(payload.item.id).toBe("a");
        expect(payload.resource.id).toBe("r1");
    });
});

describe("ширина й прокрутка", () => {
    /** jsdom не рахує розміри, тож ширину скролера підставляємо руками. */
    function renderSized(clientWidth: number, props: Record<string, unknown> = {}) {
        const wrapper = mount(Timeline, {
            props: { resources, items: [], range, slotWidth: 40, resourceWidth: 200, ...props },
            attachTo: document.body,
        });

        const scroller = wrapper.find(".rt__scroller").element;
        Object.defineProperty(scroller, "clientWidth", { value: clientWidth, configurable: true });
        (wrapper.vm as unknown as { syncViewport: () => void }).syncViewport();

        return wrapper;
    }

    const slotOf = (wrapper: { attributes: (name: string) => string | undefined }) =>
        Number(/--rt-slot-width: ([\d.]+)px/.exec(wrapper.attributes("style") ?? "")?.[1]);

    const paneOf = (wrapper: { attributes: (name: string) => string | undefined }) =>
        Number(/--rt-resource-width: ([\d.]+)px/.exec(wrapper.attributes("style") ?? "")?.[1]);

    it("розтягує колонки на вільне місце", async () => {
        // 1440 - 200 панелі = 1240 на 31 день, тобто рівно по 40 px
        const wrapper = renderSized(1440);
        await wrapper.vm.$nextTick();

        expect(slotOf(wrapper)).toBe(40);

        const wide = renderSized(2000);
        await wide.vm.$nextTick();

        expect(slotOf(wide)).toBeGreaterThan(40);
    });

    it("ширина колонки завжди ціла, а залишок забирає панель", async () => {
        // 1800 на 31 колонку — це 58.06 px; дробова ширина розмиває лінії сітки,
        // тож колонка стає 58 px, а 26 px решти йдуть у панель ресурсів
        const wrapper = renderSized(2000);
        await wrapper.vm.$nextTick();

        expect(slotOf(wrapper)).toBe(58);
        expect(paneOf(wrapper)).toBe(2000 - 58 * 31);
    });

    it("враховує проміжок і рамки, які додав застосунок", async () => {
        // застосунок розсунув панелі на 12px і додав рамку по 1px з боків
        const wrapper = renderSized(2000);
        // Спершу даємо Vue пропатчити розмітку: у браузері вимірювання будить
        // спостерігач розміру, тобто воно завжди бачить уже покладений DOM.
        await wrapper.vm.$nextTick();

        const grid = wrapper.find(".rt__grid").element;
        const body = wrapper.find(".rt__body").element as HTMLElement;

        // Сітка починається там, де закінчилась панель: заглушка їде за
        // шириною панелі так само, як їхала б розмітка. Інакше вимірювання
        // перевірялось би на тому, чого в браузері не буває.
        grid.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
        body.getBoundingClientRect = () => ({ left: paneOf(wrapper) + 12 }) as DOMRect;
        Object.defineProperty(body, "offsetLeft", { value: 212, configurable: true });

        // Рамки читаються з обчислених стилів, а jsdom їх не рахує — підміняємо
        // саме для тіла сітки, решті елементів лишаємо справжні.
        // Саме globalThis: середовище vitest копіює глобалі з вікна, тож
        // компонент бачить копію, а не властивість window.
        const computed = globalThis.getComputedStyle.bind(globalThis);
        const spy = vi
            .spyOn(globalThis, "getComputedStyle")
            .mockImplementation((element: Element, pseudo?: string | null) =>
                element === body
                    ? ({ borderLeftWidth: "1px", borderRightWidth: "1px" } as CSSStyleDeclaration)
                    : computed(element, pseudo),
            );

        try {
            (wrapper.vm as unknown as { syncViewport: () => void }).syncViewport();
            await wrapper.vm.$nextTick();
        } finally {
            spy.mockRestore();
        }

        // 2000 - 12 проміжку - 2 рамки - 1 запасу = 1985 на панель і колонки;
        // запас потрібен, щоб рамка правого краю не лягла рівно на межу прокрутки
        expect(slotOf(wrapper)).toBe(57);
        expect(paneOf(wrapper)).toBe(1985 - 57 * 31);
    });

    it("на дробовому масштабі ширина кратна пристроєвому пікселю", async () => {
        // 125%: цілий CSS-піксель — це 1.25 пристроєвих, тож «ціла ширина»
        // розкладає лінії по різних частках пікселя, і кожна четверта різка.
        // 57.6 замість 58 — це рівно 72 пристроєвих пікселі.
        const ratio = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
        Object.defineProperty(window, "devicePixelRatio", { value: 1.25, configurable: true });

        try {
            const wrapper = renderSized(2000);
            await wrapper.vm.$nextTick();

            expect(slotOf(wrapper)).toBe(57.6);
            expect(slotOf(wrapper) * 1.25).toBe(72);
        } finally {
            if (ratio === undefined) Reflect.deleteProperty(window, "devicePixelRatio");
            else Object.defineProperty(window, "devicePixelRatio", ratio);
        }
    });

    it("задана ширина лишається нижньою межею", async () => {
        // місця менше, ніж треба: колонки не стискаються, зʼявляється прокрутка
        const wrapper = renderSized(600);
        await wrapper.vm.$nextTick();

        expect(wrapper.attributes("style")).toContain("--rt-slot-width: 40px");
    });

    it("stretch: false лишає рівно задану ширину", async () => {
        const wrapper = renderSized(2000, { stretch: false });
        await wrapper.vm.$nextTick();

        expect(wrapper.attributes("style")).toContain("--rt-slot-width: 40px");
    });

    it("прокручує вісь до заданої дати", async () => {
        const wrapper = renderSized(1000, { scrollTo: "2026-03-20" });
        await wrapper.vm.$nextTick();
        (wrapper.vm as unknown as { scrollToDate: (date: string) => void }).scrollToDate("2026-03-20");

        expect(wrapper.find(".rt__scroller").element.scrollLeft).toBeGreaterThan(0);
    });

    it("мінімальна висота рядка перекриває розрахунок за доріжками", () => {
        const wrapper = mount(Timeline, {
            props: { resources, items: [], range, barHeight: 20, barGap: 2, minRowHeight: 60 },
        });

        expect(wrapper.find(".rt__row").attributes("style")).toContain("height: 60px");
    });
});

describe("хуки застосунку на колонки", () => {
    it("власний клас робить колонку позначеною й малює накладку", () => {
        const wrapper = render({
            slotClass: (slot: { start: string }) => (slot.start === "2026-03-11" ? "is-holiday" : undefined),
        });

        expect(wrapper.findAll(".rt__column.is-holiday")).toHaveLength(1);
        expect(wrapper.findAll(".rt__axis-cell.is-holiday")).toHaveLength(1);
    });

    it("без класів у DOM лишаються тільки вихідні", () => {
        const withHoliday = render({ slotClass: () => "is-holiday" }).findAll(".rt__column").length;
        const plain = render().findAll(".rt__column").length;

        expect(withHoliday).toBeGreaterThan(plain);
    });
});

describe("нативна подія в payload", () => {
    it("клік по бару несе елемент, до якого можна прив'язати попап", async () => {
        const items: Item[] = [{ id: "a", resourceId: "r1", start: "2026-03-05", end: "2026-03-06" }];
        const wrapper = render({ items });
        await wrapper.find(".rt__bar").trigger("click");

        const payload = wrapper.emitted("item-click")?.[0]?.[0] as { event: MouseEvent; target: HTMLElement };
        expect(payload.event).toBeInstanceOf(Event);
        expect(payload.target.className).toContain("rt__bar");
    });

    it("клік по підпису колонки несе свій елемент", async () => {
        const wrapper = render();
        await wrapper.findAll(".rt__axis-cell")[3].trigger("click");

        const payload = wrapper.emitted("slot-click")?.[0]?.[0] as { target: HTMLElement; slot: { start: string } };
        expect(payload.slot.start).toBe("2026-03-04");
        expect(payload.target.className).toContain("rt__axis-cell");
    });
});

describe("режим прокрутки", () => {
    it("типово скролиться всередині заданої висоти", () => {
        const wrapper = render();

        expect(wrapper.classes()).toContain("rt--container-scroll");
        expect(wrapper.find(".rt__scrollbar").exists()).toBe(false);
    });

    it("у режимі сторінки шапка липне до вікна з відступом застосунку", () => {
        const wrapper = render({ scroll: "page", stickyOffset: 71 });

        expect(wrapper.classes()).toContain("rt--page-scroll");
        expect(wrapper.find(".rt__header").attributes("style")).toContain("top: 71px");
    });

    it("у режимі сторінки зʼявляється прилипла смуга прокрутки", () => {
        // справжня лежить у кінці таблиці, тобто поза екраном
        const wrapper = render({ scroll: "page" });

        expect(wrapper.find(".rt__scrollbar").exists()).toBe(true);
    });

    it("вісь дат їде за сіткою трансформацією, без другого скролера", async () => {
        const wrapper = render({ scroll: "page" });
        const scroller = wrapper.find(".rt__scroller");

        scroller.element.scrollLeft = 120;
        await scroller.trigger("scroll");

        expect(wrapper.find(".rt__axis").attributes("style")).toContain("translateX(-120px)");
    });

    it("обрізає тіло на прокрутку, щоб сітка не лізла в проміжок між панелями", async () => {
        // Тіло їде під липку панель ресурсів, але між панелями лишається
        // проміжок — крізь нього видно лінії сітки, ніби календар вилазить
        // із-під власної картки. Шапці те саме дає її вікно з overflow.
        const wrapper = render();
        const scroller = wrapper.find(".rt__scroller");
        const body = wrapper.find(".rt__body");

        expect(body.attributes("style") ?? "").not.toContain("inset");

        scroller.element.scrollLeft = 90;
        await scroller.trigger("scroll");

        expect(body.attributes("style")).toContain("inset(0 0 0 90px)");
    });
});

describe("тема", () => {
    it("за замовчуванням віддається системній темі", () => {
        const classes = render().classes();

        expect(classes).not.toContain("rt--dark");
        expect(classes).not.toContain("rt--light");
    });

    it("явна тема ставить клас, за яким перевизначаються токени", () => {
        expect(render({ theme: "dark" }).classes()).toContain("rt--dark");
        expect(render({ theme: "light" }).classes()).toContain("rt--light");
    });
});

describe("віртуалізація рядків", () => {
    const many: Resource[] = Array.from({ length: 200 }, (_, index) => ({
        id: `r${index}`,
        title: `Ресурс ${index}`,
    }));

    /** jsdom не рахує розміри, тож висоту вікна підставляємо руками. */
    function renderScrollable(clientHeight: number) {
        const wrapper = mount(Timeline, {
            props: { resources: many, items: [], range, barHeight: 28, barGap: 4, overscan: 2 },
            attachTo: document.body,
        });

        const scroller = wrapper.find(".rt__scroller").element;
        Object.defineProperty(scroller, "clientHeight", { value: clientHeight, configurable: true });
        (wrapper.vm as unknown as { syncViewport: () => void }).syncViewport();

        return wrapper;
    }

    it("без відомої висоти вікна рендерить перший екран, а не все", () => {
        // SSR і тестове середовище: висоту міряють після першого рендера, тож
        // на ньому її ще нема. Порожній екран був би гірший, але й малювати
        // дві сотні рядків, щоб лишити двадцять, теж: 40 — це стеля.
        const rows = mount(Timeline, { props: { resources: many, items: [], range } }).findAll(".rt__row");

        expect(rows).toHaveLength(40);
        expect(rows.length).toBeLessThan(many.length);
    });

    it("коли рядків менше за стелю — рендерить усі", () => {
        const few = many.slice(0, 7);
        const wrapper = mount(Timeline, { props: { resources: few, items: [], range } });

        expect(wrapper.findAll(".rt__row")).toHaveLength(7);
    });

    it("рендерить лише видимі рядки плюс запас", async () => {
        const wrapper = renderScrollable(360);
        await wrapper.vm.$nextTick();

        const rendered = wrapper.findAll(".rt__row").length;
        expect(rendered).toBeGreaterThan(5);
        expect(rendered).toBeLessThan(20);
    });

    it("панель ресурсів рендерить той самий зріз, що й сітка", async () => {
        const wrapper = renderScrollable(360);
        await wrapper.vm.$nextTick();

        expect(wrapper.findAll(".rt__resource")).toHaveLength(wrapper.findAll(".rt__row").length);
    });

    it("тримає повну висоту, щоб смуга прокрутки не брехала", async () => {
        const wrapper = renderScrollable(360);
        await wrapper.vm.$nextTick();

        // 200 рядків по одній доріжці: 28 + 4 + 4 = 36 px кожен
        expect(wrapper.find(".rt__body").attributes("style")).toContain("height: 7200px");
    });

    it("прокрутка зсуває зріз далі по списку", async () => {
        const wrapper = renderScrollable(360);
        const scroller = wrapper.find(".rt__scroller");
        scroller.element.scrollTop = 3600;
        await scroller.trigger("scroll");

        const first = wrapper.find(".rt__row").attributes("data-resource");
        expect(first).not.toBe("r0");
    });
});

describe("слоти рендеру", () => {
    it("за замовчуванням показує назву ресурсу", () => {
        expect(render().find(".rt__resource").text()).toBe("Перший");
    });

    it("власний слот перекриває вміст за замовчуванням", () => {
        const wrapper = mount(Timeline, {
            props: { resources, items: [], range },
            slots: { resource: '<span class="custom">{{ params.resource.title }}</span>' },
        });

        expect(wrapper.find(".rt__resource .custom").exists()).toBe(true);
    });
});

describe("плагіни", () => {
    /** Ловить контекст, щоб перевіряти гачки ззовні. */
    function probe(): { plugin: Plugin; ctx: () => PluginContext } {
        let captured: PluginContext | null = null;
        return {
            plugin: {
                name: "probe",
                setup(context) {
                    captured = context;
                },
            },
            ctx: () => {
                if (captured === null) throw new Error("setup не викликано");
                return captured;
            },
        };
    }

    it("дають влучання вказівника: точка стає ресурсом і датою", async () => {
        const { plugin, ctx } = probe();
        const wrapper = render({ plugins: [plugin] });
        await wrapper.vm.$nextTick();

        // 100px при колонці 40px — третій день діапазону; 40px по вертикалі —
        // другий рядок, бо порожній рядок усе одно має одну доріжку: 28 + 2×4
        const hit = ctx().hitTest({ x: 100, y: 40 });

        expect(hit?.date).toBe("2026-03-03");
        expect(hit?.resource.id).toBe("r2");
        expect(hit?.resourceIndex).toBe(1);
    });

    it("не рахує влучанням те, що сховане під панеллю ресурсів", async () => {
        const { plugin, ctx } = probe();
        const wrapper = render({ plugins: [plugin] });
        await wrapper.vm.$nextTick();

        // Панель липка: при прокрутці сітка їде під неї, і те, що під нею,
        // користувач не бачить — отже, туди не можна ані клікнути, ані кинути.
        const pane = wrapper.find(".rt__resources").element;
        pane.getBoundingClientRect = () => ({ right: 200 }) as DOMRect;

        expect(ctx().hitTest({ x: 100, y: 40 })).toBeNull();
        expect(ctx().hitTest({ x: 300, y: 40 })?.date).toBe("2026-03-08");
    });

    it("дають геометрію тими самими числами, якими малює сітка", async () => {
        const { plugin, ctx } = probe();
        const wrapper = render({ plugins: [plugin] });
        await wrapper.vm.$nextTick();

        const geometry = ctx().getGeometry();

        expect(geometry.slotWidth).toBe(40);
        expect(geometry.rowOffsets).toEqual([0, 36, 72]);
    });

    it("дають шар накладок і впізнаваний бар", async () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-04" }];
        const wrapper = render({ items, minRowHeight: 30 });
        await wrapper.vm.$nextTick();

        // Без data-item плагін не знає, що саме схопили: у рядка ідентичність
        // є, у бара її не було.
        expect(wrapper.find(".rt__bar").attributes("data-item")).toBe("i1");
        expect(wrapper.find(".rt__body .rt__overlay").exists()).toBe(true);
    });

    describe("перетягування (pro)", () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" }];

        /** jsdom не має PointerEvent; слухачам вистачає координат миші. */
        function fire(type: string, x: number, y: number, target: EventTarget) {
            target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
        }

        function dragTo(wrapper: ReturnType<typeof render>, x: number, y: number) {
            const bar = wrapper.find(".rt__bar").element;
            // Хапаємо за перший день бара: 2026-03-02 — це другий слот, 40..80px
            fire("pointerdown", 60, 10, bar);
            fire("pointermove", x, y, window);
            fire("pointerup", x, y, window);
        }

        it("оголошує ввімкнені жести — інакше про них нема звідки дізнатись", async () => {
            const wrapper = render({
                items,
                plugins: [drag({ onMove: () => {}, onResize: () => {} })],
            });
            await wrapper.vm.$nextTick();

            const root = wrapper.find(".rt").element as HTMLElement;
            expect(root.dataset.gestures).toBe("move resize");
            expect(root.style.getPropertyValue("--rt-edge-size")).toBe("6px");
        });

        it("оголошує лише те, що справді ввімкнено", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            expect((wrapper.find(".rt").element as HTMLElement).dataset.gestures).toBe("move");
        });

        it("без плагіна бар не обіцяє нічого", async () => {
            const wrapper = render({ items });
            await wrapper.vm.$nextTick();

            expect((wrapper.find(".rt").element as HTMLElement).dataset.gestures).toBeUndefined();
        });

        it("ширина вушка дорівнює зоні, яка справді відповідає", async () => {
            const wrapper = render({
                items,
                plugins: [drag({ onResize: () => {}, edgeSize: 10 })],
            });
            await wrapper.vm.$nextTick();

            expect((wrapper.find(".rt").element as HTMLElement).style.getPropertyValue("--rt-edge-size")).toBe(
                "10px",
            );
        });

        it("знятий плагін прибирає за собою обіцянку", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();
            const root = wrapper.find(".rt").element as HTMLElement;

            wrapper.unmount();

            expect(root.dataset.gestures).toBeUndefined();
            expect(root.style.getPropertyValue("--rt-edge-size")).toBe("");
        });

        it("віддає новий діапазон і ресурс, а даних не чіпає", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            // Три дні праворуч і рядок униз: 60 -> 180 по осі, 10 -> 50 по рядках
            dragTo(wrapper, 180, 50);

            expect(moves).toHaveLength(1);
            expect(moves[0].days).toBe(3);
            expect(moves[0].start).toBe("2026-03-05");
            expect(moves[0].end).toBe("2026-03-08");
            expect(moves[0].from.id).toBe("r1");
            expect(moves[0].to.id).toBe("r2");
            // Плагін нічого не мутує: дані лишаються за застосунком
            expect(items[0].start).toBe("2026-03-02");
        });

        it("не переносить туди, де правило застосунку забороняє", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({
                items,
                plugins: [
                    drag({
                        onMove: (move) => moves.push(move),
                        // Забороняємо чужий рядок, дозволяємо зсув по днях
                        canMove: (move) => move.to.id === move.from.id,
                    }),
                ],
            });
            await wrapper.vm.$nextTick();

            // Три дні праворуч і рядок униз — чужий рядок, тож нічого
            dragTo(wrapper, 180, 50);
            expect(moves).toEqual([]);

            // Той самий зсув у своєму рядку проходить
            dragTo(wrapper, 180, 10);
            expect(moves).toHaveLength(1);
            expect(moves[0].to.id).toBe("r1");
        });

        it("показує заборонену ціль перекресленою, а не мовчить", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {}, canMove: () => false })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            fire("pointermove", 180, 50, window);

            const ghost = wrapper.find(".rt__ghost");
            expect(ghost.exists()).toBe(true);
            expect(ghost.classes()).toContain("rt__ghost--invalid");
        });

        it("жест не лишає по собі кліку — інакше форма відкривається сама", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            dragTo(wrapper, 180, 10);
            // Браузер після відпускання шле click на спільного предка
            // натискання й відпускання — це рядок.
            fire("click", 180, 10, wrapper.find(".rt__row").element);

            expect(wrapper.emitted("cell-click")).toBeUndefined();
            expect(wrapper.emitted("item-click")).toBeUndefined();
        });

        it("відхилений жест теж не лишає кліку", async () => {
            const wrapper = render({
                items,
                plugins: [drag({ onMove: () => {}, canMove: () => false })],
            });
            await wrapper.vm.$nextTick();

            dragTo(wrapper, 180, 50);
            fire("click", 180, 50, wrapper.findAll(".rt__row")[1].element);

            // Найгірший випадок: тягнули те, що не переїде, і замість тиші
            // отримували форму створення на порожньому місці.
            expect(wrapper.emitted("cell-click")).toBeUndefined();
        });

        it("клік без жесту лишається кліком", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            // Натиснули й відпустили на місці — порога не перейдено, жесту не
            // було, і забирати в застосунку клік нема за що.
            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            fire("pointerup", 60, 10, window);
            fire("click", 60, 10, wrapper.find(".rt__row").element);

            expect(wrapper.emitted("cell-click")).toHaveLength(1);
        });

        it("привид повторює силует бара, а не смугу рядка", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            // jsdom розкладки не рахує, тож бар описуємо самі: 20px згори в
            // рядку, 24 заввишки — при висоті рядка 40.
            const bar = wrapper.find(".rt__bar").element;
            Object.defineProperty(bar, "offsetTop", { value: 20, configurable: true });
            Object.defineProperty(bar, "offsetHeight", { value: 24, configurable: true });

            fire("pointerdown", 60, 10, bar);
            fire("pointermove", 180, 10, window);

            const ghost = wrapper.find(".rt__ghost").element as HTMLElement;
            expect(ghost.style.height).toBe("24px");
            expect(ghost.style.top).toBe("20px");
        });

        it("бар, який тягнуть, пригасає — і рівно поки триває жест", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;

            // Саме натискання ще нічого не міняє: це поки що може бути клік
            fire("pointerdown", 60, 10, bar);
            expect(bar.classList.contains("rt__bar--dragging")).toBe(false);

            fire("pointermove", 180, 10, window);
            expect(bar.classList.contains("rt__bar--dragging")).toBe(true);

            fire("pointerup", 180, 10, window);
            expect(bar.classList.contains("rt__bar--dragging")).toBe(false);
        });

        it("мовчить, коли бар лишився на місці", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            // Провезли достатньо, щоб перевищити поріг, але в межах свого ж дня
            dragTo(wrapper, 70, 10);

            expect(moves).toEqual([]);
        });

        /**
         * Зона краю рахується від прямокутника бара, а в jsdom він нульовий.
         * Бар на 3 дні по 40px від другої колонки — це 40..160.
         */
        function withBarRect(wrapper: ReturnType<typeof render>) {
            const bar = wrapper.find(".rt__bar").element;
            bar.getBoundingClientRect = () => ({ left: 40, right: 160, width: 120 }) as DOMRect;
            return bar;
        }

        it("тягне правий край, лишаючи початок на місці", async () => {
            const sizes: DragResize[] = [];
            const wrapper = render({ items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
            await wrapper.vm.$nextTick();
            const bar = withBarRect(wrapper);

            fire("pointerdown", 158, 10, bar);
            fire("pointermove", 250, 10, window);
            fire("pointerup", 250, 10, window);

            expect(sizes).toHaveLength(1);
            expect(sizes[0].edge).toBe("end");
            expect(sizes[0].start).toBe("2026-03-02");
            expect(sizes[0].end).toBe("2026-03-08");
        });

        it("тягне лівий край, лишаючи кінець на місці", async () => {
            const sizes: DragResize[] = [];
            const wrapper = render({ items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
            await wrapper.vm.$nextTick();
            const bar = withBarRect(wrapper);

            fire("pointerdown", 42, 10, bar);
            fire("pointermove", 10, 10, window);
            fire("pointerup", 10, 10, window);

            expect(sizes[0].edge).toBe("start");
            expect(sizes[0].start).toBe("2026-03-01");
            expect(sizes[0].end).toBe("2026-03-05");
        });

        it("не дає краю перескочити протилежний: мінімум один день", async () => {
            const sizes: DragResize[] = [];
            const wrapper = render({ items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
            await wrapper.vm.$nextTick();
            const bar = withBarRect(wrapper);

            // Тягнемо правий край далеко вліво, аж за початок бара
            fire("pointerdown", 158, 10, bar);
            fire("pointermove", 10, 10, window);
            fire("pointerup", 10, 10, window);

            expect(sizes[0].start).toBe("2026-03-02");
            expect(sizes[0].end).toBe("2026-03-03");
        });

        it("без обробника край не тягнеться, а бар переїжджає цілком", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();
            const bar = withBarRect(wrapper);

            // Захват у зоні правого краю, але onResize не передали
            fire("pointerdown", 158, 10, bar);
            fire("pointermove", 238, 10, window);
            fire("pointerup", 238, 10, window);

            expect(moves).toHaveLength(1);
            expect(moves[0].days).toBe(2);
        });

        /**
         * Курсор і вушка біля краю тепер малює таблиця стилів компонента, а не
         * плагін інлайном — те саме правило, що вже застосоване до привида:
         * інлайн не перебити нічим, крім !important, і застосунок лишався б без
         * права голосу. Сам вигляд у jsdom не перевірити: розкладки немає, а
         * псевдоелементи не беруть участі у влучаннях. Тому перевіряємо те, від
         * чого він залежить, і те, повернення чого було б регресом.
         */
        it("вигляд жесту не тримається інлайном", async () => {
            const wrapper = render({ items, plugins: [drag({ onResize: () => {} })] });
            await wrapper.vm.$nextTick();
            const bar = withBarRect(wrapper);

            fire("pointermove", 158, 10, bar);

            expect(bar.style.cursor).toBe("");
            expect((wrapper.find(".rt").element as HTMLElement).dataset.gestures).toBe("resize");
        });

        it("не починає тягнення, доки не перейдено поріг", async () => {
            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            fire("pointermove", 62, 10, window);

            // Привида немає — отже, клік по бару лишається кліком
            expect(wrapper.find(".rt__ghost").exists()).toBe(false);
        });
    });

    describe("створення виділенням (pro)", () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" }];

        function fire(type: string, x: number, y: number, target: EventTarget) {
            target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
        }

        function selectOn(wrapper: ReturnType<typeof render>, from: number, to: number) {
            const row = wrapper.find(".rt__row").element;
            fire("pointerdown", from, 10, row);
            fire("pointermove", to, 10, window);
            fire("pointerup", to, 10, window);
        }

        it("віддає діапазон від першої колонки до останньої вкритої", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ plugins: [create({ onCreate: (range) => created.push(range) })] });
            await wrapper.vm.$nextTick();

            // 100px -> третя колонка, 220px -> шоста
            selectOn(wrapper, 100, 220);

            expect(created).toHaveLength(1);
            expect(created[0].start).toBe("2026-03-03");
            expect(created[0].end).toBe("2026-03-07");
            expect(created[0].days).toBe(4);
            expect(created[0].resource.id).toBe("r1");
        });

        it("веде виділення в обидва боки однаково", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ plugins: [create({ onCreate: (range) => created.push(range) })] });
            await wrapper.vm.$nextTick();

            selectOn(wrapper, 220, 100);

            expect(created[0].start).toBe("2026-03-03");
            expect(created[0].end).toBe("2026-03-07");
        });

        it("не починається з бара — там територія перетягування", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ items, plugins: [create({ onCreate: (range) => created.push(range) })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            fire("pointermove", 220, 10, window);
            fire("pointerup", 220, 10, window);

            expect(created).toEqual([]);
        });

        it("не створює там, де правило застосунку забороняє", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({
                plugins: [
                    create({
                        onCreate: (range) => created.push(range),
                        // Дозволяємо лише перший тиждень місяця
                        canCreate: (range) => range.end <= "2026-03-08",
                    }),
                ],
            });
            await wrapper.vm.$nextTick();

            selectOn(wrapper, 100, 600);
            expect(created).toEqual([]);

            // Дозволена ціль після забороненої все одно спрацьовує
            selectOn(wrapper, 100, 220);
            expect(created).toHaveLength(1);
            expect(created[0].end).toBe("2026-03-07");
        });

        it("клік лишається кліком: без руху нічого не створюється", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ plugins: [create({ onCreate: (range) => created.push(range) })] });
            await wrapper.vm.$nextTick();

            selectOn(wrapper, 100, 102);

            expect(created).toEqual([]);
        });

        it("подвійний клік робить подію на один день", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({
                plugins: [create({ onCreate: (range) => created.push(range), doubleClick: true })],
            });
            await wrapper.vm.$nextTick();

            // 100px -> третя колонка
            fire("dblclick", 100, 10, wrapper.find(".rt__row").element);

            expect(created).toHaveLength(1);
            expect(created[0].start).toBe("2026-03-03");
            expect(created[0].end).toBe("2026-03-04");
            expect(created[0].days).toBe(1);
            expect(created[0].resource.id).toBe("r1");
        });

        it("без doubleClick подвійний клік нічого не робить", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ plugins: [create({ onCreate: (range) => created.push(range) })] });
            await wrapper.vm.$nextTick();

            fire("dblclick", 100, 10, wrapper.find(".rt__row").element);

            expect(created).toEqual([]);
        });

        it("подвійний клік по бару не створює: там уже щось лежить", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({
                items,
                plugins: [create({ onCreate: (range) => created.push(range), doubleClick: true })],
            });
            await wrapper.vm.$nextTick();

            fire("dblclick", 60, 10, wrapper.find(".rt__bar").element);

            expect(created).toEqual([]);
        });

        it("подвійний клік питає дозволу так само, як виділення", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({
                plugins: [
                    create({
                        onCreate: (range) => created.push(range),
                        canCreate: (range) => range.end <= "2026-03-08",
                        doubleClick: true,
                    }),
                ],
            });
            await wrapper.vm.$nextTick();

            fire("dblclick", 600, 10, wrapper.find(".rt__row").element);
            expect(created).toEqual([]);

            fire("dblclick", 100, 10, wrapper.find(".rt__row").element);
            expect(created).toHaveLength(1);
        });
    });

    describe("жести на дотик (pro)", () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" }];

        /**
         * jsdom не має PointerEvent; слухачам вистачає координат миші та двох
         * полів, якими палець відрізняється від курсора.
         */
        function fire(type: string, x: number, y: number, target: EventTarget) {
            const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 });
            Object.defineProperty(event, "pointerType", { value: "touch" });
            Object.defineProperty(event, "pointerId", { value: 7 });
            target.dispatchEvent(event);
        }

        /** Потримати палець довше за `longPress`. */
        const held = () => new Promise((resolve) => setTimeout(resolve, 5));

        it("не забирає перший рух пальця: це прокрутка, а не жест", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            // Палець поїхав, не дочекавшись кінця утримання
            fire("pointermove", 180, 50, window);
            fire("pointerup", 180, 50, window);

            expect(moves).toEqual([]);
        });

        it("після утримання веде бар і не дає сторінці прокрутитись", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move), longPress: 1 })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            await held();

            const scroll = new Event("touchmove", { bubbles: true, cancelable: true });
            window.dispatchEvent(scroll);
            expect(scroll.defaultPrevented).toBe(true);

            fire("pointermove", 180, 50, window);
            fire("pointerup", 180, 50, window);

            expect(moves).toHaveLength(1);
            expect(moves[0].days).toBe(3);
            expect(moves[0].to.id).toBe("r2");

            // Скінчився жест — скінчилась і заборона: сторінка знову їздить
            const after = new Event("touchmove", { bubbles: true, cancelable: true });
            window.dispatchEvent(after);
            expect(after.defaultPrevented).toBe(false);
        });

        it("утримання без руху не створює нічого — як і клік мишею", async () => {
            const created: DragCreate[] = [];
            const wrapper = render({ plugins: [create({ onCreate: (range) => created.push(range), longPress: 1 })] });
            await wrapper.vm.$nextTick();

            const row = wrapper.find(".rt__row").element;
            fire("pointerdown", 100, 10, row);
            await held();
            fire("pointerup", 100, 10, window);

            expect(created).toEqual([]);
        });

        it("скасування вказівника жест не застосовує", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move), longPress: 1 })] });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            fire("pointerdown", 60, 10, bar);
            await held();
            fire("pointermove", 180, 50, window);
            fire("pointercancel", 180, 50, window);

            expect(moves).toEqual([]);
        });

        it("зона краю під палець ширша: у шість пікселів він не влучає", async () => {
            const sizes: DragResize[] = [];
            const wrapper = render({
                items,
                plugins: [drag({ onResize: (size) => sizes.push(size), longPress: 1 })],
            });
            await wrapper.vm.$nextTick();

            const bar = wrapper.find(".rt__bar").element;
            bar.getBoundingClientRect = () => ({ left: 40, right: 160, width: 120 }) as DOMRect;

            // Десять пікселів від лівого краю: мишею це середина, пальцем — край
            fire("pointerdown", 50, 10, bar);
            await held();
            fire("pointermove", 10, 10, window);
            fire("pointerup", 10, 10, window);

            expect(sizes).toHaveLength(1);
            expect(sizes[0].edge).toBe("start");
            expect(sizes[0].start).toBe("2026-03-01");
        });
    });

    describe("жести з клавіатури (pro)", () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" }];

        const press = (bar: Element, key: string, extra: KeyboardEventInit) =>
            bar.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));

        it("Shift зі стрілкою переносить бронь на день", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            press(wrapper.find(".rt__bar").element, "ArrowRight", { shiftKey: true });

            expect(moves).toHaveLength(1);
            expect(moves[0].days).toBe(1);
            expect(moves[0].start).toBe("2026-03-03");
        });

        it("Shift зі стрілкою вниз переносить у сусідній рядок", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            press(wrapper.find(".rt__bar").element, "ArrowDown", { shiftKey: true });

            expect(moves[0].to.id).toBe("r2");
            expect(moves[0].days).toBe(0);
        });

        it("Alt зі стрілкою тягне край, лишаючи початок на місці", async () => {
            const sizes: DragResize[] = [];
            const wrapper = render({ items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
            await wrapper.vm.$nextTick();

            press(wrapper.find(".rt__bar").element, "ArrowRight", { altKey: true });

            expect(sizes).toHaveLength(1);
            expect(sizes[0].edge).toBe("end");
            expect(sizes[0].start).toBe("2026-03-02");
            expect(sizes[0].end).toBe("2026-03-06");
        });

        it("правила застосунку діють і тут — інакше клавіатура була б лазівкою", async () => {
            const moves: DragMove[] = [];
            const wrapper = render({
                items,
                plugins: [drag({ onMove: (move) => moves.push(move), canMove: () => false })],
            });
            await wrapper.vm.$nextTick();

            press(wrapper.find(".rt__bar").element, "ArrowRight", { shiftKey: true });

            expect(moves).toEqual([]);
        });
    });

    describe("ліцензія (pro)", () => {
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-05" }];

        it("без ключа позначає компонент — і не чіпає жодного жесту", async () => {
            vi.spyOn(console, "warn").mockImplementation(() => {});
            vi.useFakeTimers();

            const moves: DragMove[] = [];
            const wrapper = render({ items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
            await wrapper.vm.$nextTick();

            // Ключ могли дати й після монтування — секунду мовчимо
            expect(wrapper.find(".rt__license").exists()).toBe(false);
            await vi.advanceTimersByTimeAsync(1200);
            expect(wrapper.find(".rt__license").text()).toContain("unlicensed");

            const bar = wrapper.find(".rt__bar").element;
            bar.dispatchEvent(new MouseEvent("pointerdown", { clientX: 60, clientY: 10, bubbles: true }));
            window.dispatchEvent(new MouseEvent("pointermove", { clientX: 180, clientY: 50, bubbles: true }));
            window.dispatchEvent(new MouseEvent("pointerup", { clientX: 180, clientY: 50, bubbles: true }));

            // Позначка — це напис, а не замок
            expect(moves).toHaveLength(1);

            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        it("позначка зникає разом із компонентом", async () => {
            vi.spyOn(console, "warn").mockImplementation(() => {});
            vi.useFakeTimers();

            const wrapper = render({ items, plugins: [drag({ onMove: () => {} })] });
            await wrapper.vm.$nextTick();
            await vi.advanceTimersByTimeAsync(1200);
            expect(wrapper.find(".rt__license").exists()).toBe(true);

            wrapper.unmount();
            expect(document.querySelector(".rt__license")).toBeNull();

            vi.useRealTimers();
            vi.restoreAllMocks();
        });
    });

    it("отримують події, на які підписались", async () => {
        const seen: string[] = [];
        const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-04" }];
        const plugin: Plugin = {
            name: "listener",
            setup(ctx) {
                ctx.on("itemClick", (payload) => seen.push(`item:${payload.item.id}`));
                ctx.on("cellClick", (payload) => seen.push(`cell:${payload.date}`));
                ctx.on("layout", (layout) => seen.push(`layout:${layout.rows.length}`));
            },
        };

        const wrapper = render({ items, plugins: [plugin], minRowHeight: 30 });
        await wrapper.vm.$nextTick();

        // Перший сигнал приходить одразу після підписки
        expect(seen).toContain("layout:2");

        await wrapper.find(".rt__bar").trigger("click");
        expect(seen).toContain("item:i1");
    });

    describe("зв'язки (pro)", () => {
        const items: Item[] = [
            { id: "i1", resourceId: "r1", start: "2026-03-02", end: "2026-03-04" },
            { id: "i2", resourceId: "r2", start: "2026-03-06", end: "2026-03-08" },
        ];

        it("малює стрілку між барами й прибирає її при демонтажі", async () => {
            const wrapper = render({
                items,
                minRowHeight: 30,
                plugins: [links({ links: () => [{ from: "i1", to: "i2" }] })],
            });
            await wrapper.vm.$nextTick();

            const svg = wrapper.find(".rt__links");
            expect(svg.exists()).toBe(true);
            // Лінія плюс вістря
            expect(svg.element.querySelectorAll("path")).toHaveLength(2);

            wrapper.unmount();
            expect(document.querySelector(".rt__links")).toBeNull();
        });

        it("не малює зв'язку, якщо одного з кінців немає в розкладці", async () => {
            const wrapper = render({
                items,
                minRowHeight: 30,
                plugins: [links({ links: () => [{ from: "i1", to: "нема" }] })],
            });
            await wrapper.vm.$nextTick();

            expect(wrapper.find(".rt__links").element.querySelectorAll("path")).toHaveLength(0);
        });

        it("малює зв'язок до бару, якого нема в розмітці", async () => {
            // Місце бару завжди обчислюване, навіть коли сам бар за межами
            // видимого зрізу. Якби якорі збирали лише з намальованих рядків,
            // стрілка на 60-й рядок зникла б — а зникати їй нема від чого.
            const far = Array.from({ length: 60 }, (_, index) => ({
                id: `r${index}`,
                title: `Ресурс ${index}`,
            }));
            const ends: Item[] = [
                { id: "first", resourceId: "r0", start: "2026-03-02", end: "2026-03-04" },
                { id: "last", resourceId: "r59", start: "2026-03-06", end: "2026-03-08" },
            ];

            const wrapper = render({
                resources: far,
                items: ends,
                minRowHeight: 30,
                plugins: [links({ links: () => [{ from: "first", to: "last" }] })],
            });
            await wrapper.vm.$nextTick();

            expect(wrapper.findAll(".rt__row").length).toBeLessThan(far.length);
            expect(wrapper.find(".rt__links").element.querySelectorAll("path")).toHaveLength(2);
        });

        it("перемальовує, коли дані змінились", async () => {
            const wrapper = render({
                items,
                minRowHeight: 30,
                plugins: [links({ links: () => [{ from: "i1", to: "i2" }] })],
            });
            await wrapper.vm.$nextTick();

            await wrapper.setProps({ items: [items[0]] });
            await wrapper.vm.$nextTick();

            // Другий бар зник — зв'язку теж нема
            expect(wrapper.find(".rt__links").element.querySelectorAll("path")).toHaveLength(0);
        });
    });

    it("отримують контекст і знімаються при демонтажі", () => {
        const seen: string[] = [];
        const plugin: Plugin = {
            name: "test",
            setup(ctx) {
                seen.push(`slots:${ctx.getLayout().slots.length}`);
                return () => {
                    seen.push("teardown");
                };
            },
        };

        const wrapper = render({ plugins: [plugin] });
        expect(seen).toEqual(["slots:31"]);

        wrapper.unmount();
        expect(seen).toEqual(["slots:31", "teardown"]);
    });
});

/**
 * Тижневий крок — окремо від денного навмисно: саме тут колонка перестає
 * дорівнювати дню, і саме тут жести ламались. Подія, коротша за тиждень, ні
 * звужувалась, ні розтягувалась, а коли край таки перестрибував колонку,
 * кінець опинявся раніше за початок — тобто плагін віддавав застосунку
 * елемент, що порушує власний контракт.
 */
describe("жести при тижневому кроці (pro)", () => {
    // 2026-03-01 — неділя, тож вісь починається з понеділка 2026-02-23.
    // Колонка 70px на сім днів дає рівно 10px на день: 2026-03-03 — день 8.
    const weekly = { step: "week" as const, slotWidth: 70, stretch: false };
    const items: Item[] = [{ id: "i1", resourceId: "r1", start: "2026-03-03", end: "2026-03-06" }];

    function fire(type: string, x: number, y: number, target: EventTarget) {
        target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
    }

    /** Бар займає всю колонку тижня: 70..140. jsdom розмірів сам не дає. */
    function withBarRect(wrapper: ReturnType<typeof render>) {
        const bar = wrapper.find(".rt__bar").element;
        bar.getBoundingClientRect = () => ({ left: 70, right: 140, width: 70 }) as DOMRect;
        return bar;
    }

    it("звужує подію на один день усередині тижня", async () => {
        const sizes: DragResize[] = [];
        const wrapper = render({ ...weekly, items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
        await wrapper.vm.$nextTick();
        const bar = withBarRect(wrapper);

        // Правий край на день ліворуч: 2026-03-05 — це день 9, тобто 90..100px
        fire("pointerdown", 138, 10, bar);
        fire("pointermove", 94, 10, window);
        fire("pointerup", 94, 10, window);

        expect(sizes).toHaveLength(1);
        expect(sizes[0].start).toBe("2026-03-03");
        expect(sizes[0].end).toBe("2026-03-05");
    });

    it("не дає кінцю опинитись раніше за початок", async () => {
        const sizes: DragResize[] = [];
        const wrapper = render({ ...weekly, items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
        await wrapper.vm.$nextTick();
        const bar = withBarRect(wrapper);

        // Правий край тягнемо аж за лівий край осі
        fire("pointerdown", 138, 10, bar);
        fire("pointermove", 0, 10, window);
        fire("pointerup", 0, 10, window);

        expect(sizes[0].start).toBe("2026-03-03");
        expect(sizes[0].end).toBe("2026-03-04");
    });

    it("тягне лівий край по днях, а не по тижнях", async () => {
        const sizes: DragResize[] = [];
        const wrapper = render({ ...weekly, items, plugins: [drag({ onResize: (size) => sizes.push(size) })] });
        await wrapper.vm.$nextTick();
        const bar = withBarRect(wrapper);

        fire("pointerdown", 72, 10, bar);
        fire("pointermove", 64, 10, window);
        fire("pointerup", 64, 10, window);

        expect(sizes[0].edge).toBe("start");
        expect(sizes[0].start).toBe("2026-03-01");
        expect(sizes[0].end).toBe("2026-03-06");
    });

    it("переїзд рахує дні, а не колонки", async () => {
        const moves: DragMove[] = [];
        const wrapper = render({ ...weekly, items, plugins: [drag({ onMove: (move) => moves.push(move) })] });
        await wrapper.vm.$nextTick();
        const bar = wrapper.find(".rt__bar").element;
        // Захват посередині бара, щоб це був переїзд, а не край
        bar.getBoundingClientRect = () => ({ left: 70, right: 140, width: 70 }) as DOMRect;

        fire("pointerdown", 105, 10, bar);
        fire("pointermove", 125, 10, window);
        fire("pointerup", 125, 10, window);

        expect(moves).toHaveLength(1);
        expect(moves[0].days).toBe(2);
        expect(moves[0].start).toBe("2026-03-05");
        expect(moves[0].end).toBe("2026-03-08");
    });

    it("виділення віддає дні, а не кількість колонок", async () => {
        const created: DragCreate[] = [];
        const wrapper = render({ ...weekly, plugins: [create({ onCreate: (made) => created.push(made) })] });
        await wrapper.vm.$nextTick();
        const body = wrapper.find(".rt__body").element;

        fire("pointerdown", 84, 40, body);
        fire("pointermove", 104, 40, window);
        fire("pointerup", 104, 40, window);

        expect(created).toHaveLength(1);
        expect(created[0].days).toBe(3);
        expect(created[0].start).toBe("2026-03-03");
        expect(created[0].end).toBe("2026-03-06");
    });
});
