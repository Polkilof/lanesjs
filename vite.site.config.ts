/**
 * Збірка сторінки проєкту — тієї, що лежить на polkilof.github.io/lanesjs/.
 *
 * Окремий конфіг, а не режим у головному: там бібліотека збирається в dist/
 * двома точками входу й без HTML, тут — звичайний застосунок з одним
 * index.html. Спроба поєднати їх дала б купу if-ів на кожному полі.
 *
 * Сайт імпортує бібліотеку не з dist, а з вихідників — через ті самі назви,
 * що їх пише споживач: "lanesjs" і "lanesjs/pro". Тоді код у прикладах на
 * сторінці — це буквально код, який працює на сторінці, а не його переказ.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const manifest = JSON.parse(readFileSync(at("./package.json"), "utf8"));

export default defineConfig({
    root: at("./site"),

    // Сайт живе в підтеці репозиторію на GitHub Pages, тож усі посилання на
    // ассети мають бути від /lanesjs/, а не від кореня домену.
    base: "/lanesjs/",

    plugins: [vue()],

    resolve: {
        // Масив, а не об'єкт: рядковий аліас у Vite замінює префікс, тож
        // "lanesjs" з'їв би й "lanesjs/pro". Точні збіги знімають питання.
        alias: [
            { find: /^lanesjs\/pro$/, replacement: at("./pro/index.ts") },
            { find: /^lanesjs$/, replacement: at("./index.ts") },
        ],
    },

    // Ті самі константи, що їх підставляє збірка бібліотеки. Без них позначка
    // про ліцензію не знала б ні версії, ні дати збірки.
    define: {
        __LANES_VERSION__: JSON.stringify(manifest.version),
        __LANES_BUILT__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    },

    build: {
        outDir: at("./site-dist"),
        emptyOutDir: true,
        target: "es2020",
    },
});
