/**
 * Перевірка зібраного пакета: чи існує все, що обіцяє `exports`, і чи
 * імпортується те, що зібрано.
 *
 * Причина конкретна: перша ж збірка мовчки поклала в пакет `public/`
 * застосунку — фавікон, іконки, service worker. Збірка була «успішна».
 * Тому успіх тепер означає не «rollup не впав», а «карта експортів веде в
 * наявні файли, і вони вантажаться».
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(join(PACKAGE, "package.json"), "utf8"));

const problems = [];

/** Усі шляхи з карти експортів, хоч би як глибоко вона вкладена. */
function paths(node, found = []) {
    if (typeof node === "string") {
        if (node.startsWith("./")) found.push(node);
        return found;
    }
    for (const value of Object.values(node)) paths(value, found);
    return found;
}

for (const relative of paths(manifest.exports)) {
    if (!existsSync(join(PACKAGE, relative))) {
        problems.push(`exports веде в неіснуючий файл: ${relative}`);
    }
}

/** Точка входу має не просто існувати, а вантажитись і віддавати обіцяне. */
async function loads(relative, expected) {
    const path = join(PACKAGE, relative);
    if (!existsSync(path)) return;

    try {
        const module = await import(pathToFileURL(path).href);
        for (const name of expected) {
            if (module[name] === undefined) problems.push(`${relative} не віддає ${name}`);
        }
    } catch (error) {
        problems.push(`${relative} не імпортується: ${error.message}`);
    }
}

await loads("./dist/index.js", ["Timeline", "buildLayout", "useTimelineRange"]);
await loads("./dist/pro.js", ["drag", "create", "history", "links"]);

if (problems.length > 0) {
    for (const problem of problems) console.error(`ЗЛАМАНО  ${problem}`);
    process.exit(1);
}

console.log(`ok   пакет ${manifest.name}@${manifest.version}: карта експортів ціла, точки входу вантажаться`);
