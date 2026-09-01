import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RentalDemo from "@/lanes/demo/RentalDemo.vue";

/**
 * Це не тест демо, а тест загальності контракту: другий домен має рендеритись
 * тим самим ядром, без жодної правки в core/ і vue/.
 */
describe("другий домен на тому самому ядрі", () => {
    it("рендерить кімнати замість людей, без правок ядра", () => {
        const wrapper = mount(RentalDemo);

        expect(wrapper.findAll(".rt__row")).toHaveLength(10);
        expect(wrapper.find(".rt__resource").text()).toContain("Кімната 101");
        expect(wrapper.find(".rt__resource").text()).toContain("поверх");
    });

    it("фарбує бари з даних через itemClass", () => {
        const wrapper = mount(RentalDemo);
        const classes = wrapper.findAll(".rt__bar").map((bar) => bar.classes().join(" "));

        expect(classes.some((value) => value.includes("demo__booking--confirmed"))).toBe(true);
        expect(classes.some((value) => value.includes("demo__booking--pending"))).toBe(true);
    });

    it("підпис колонки й вміст бара приходять зі слотів застосунку", () => {
        const wrapper = mount(RentalDemo);

        expect(wrapper.find(".demo__day").exists()).toBe(true);
        expect(wrapper.find(".rt__bar").text()).not.toBe("");
    });

    it("клік по бару доходить до застосунку", async () => {
        const wrapper = mount(RentalDemo);
        await wrapper.find(".rt__bar").trigger("click");

        expect(wrapper.find(".demo__log").text()).toContain("броня");
    });

    it("навігація рухає період", async () => {
        const wrapper = mount(RentalDemo);
        const before = wrapper.find(".demo__title").text();

        await wrapper.findAll(".demo__nav button")[2].trigger("click");

        expect(wrapper.find(".demo__title").text()).not.toBe(before);
    });
});

describe("бюджет DOM", () => {
    it("300 рядків на місяць не породжують DOM на клітинку", async () => {
        const wrapper = mount(RentalDemo);
        await wrapper.find("select").setValue(300);

        const rows = wrapper.findAll(".rt__row").length;
        const total = wrapper.element.querySelectorAll("*").length;

        // У jsdom висоту вікна не зміряти, тож працює стеля нерозміряного
        // рендера: 300 обраних рядків не означають 300 рядків у DOM.
        expect(rows).toBeLessThanOrEqual(40);
        // 300 × 31 клітинка дала б 9300 елементів лише на сітку;
        // тримаємо стелю з запасом на бари й підписи
        expect(total).toBeLessThan(3000);
    });
});
