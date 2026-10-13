// Правка одного инклюда в @g4rb4g3/react-native-carplay.
//
// Его RNCarPlay.m включает сгенерированный Swift-мост «фреймворковой» формой,
// с префиксом модуля: такой путь существует только когда под собран как фреймворк.
// Paseo собирается статически (use_frameworks! включается лишь по ios.useFrameworks
// или USE_FRAMEWORKS), и тогда заголовок лежит в DerivedSources самого таргета —
// то есть доступен по имени без префикса. Выставить DEFINES_MODULE не помогает:
// CocoaPods положил бы его в каталог имени пода (`react-native-carplay`, с дефисами),
// а инклюд просит имя модуля (`react_native_carplay`, с подчёркиваниями).
//
// Как и сплайсы плагина голоса: отказываемся, если якоря нет или их больше одного.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ?? process.cwd();
const file = path.join(root, "node_modules/@g4rb4g3/react-native-carplay/ios/RNCarPlay.m");
const anchor = '#import "react_native_carplay/react_native_carplay-Swift.h"';
const replacement = '#import "react_native_carplay-Swift.h"';

const source = await readFile(file, "utf8");
if (source.includes(replacement) && !source.includes(anchor)) {
  console.log("  ✓ инклюд CarPlay уже поправлен");
  process.exit(0);
}
const count = source.split(anchor).length - 1;
if (count !== 1) {
  console.error(
    `  ✗ ожидал один якорь в RNCarPlay.m, нашёл ${count} — библиотека изменилась, правку надо пересмотреть`,
  );
  process.exit(1);
}
await writeFile(file, source.replace(anchor, replacement));
console.log("  ✓ инклюд Swift-моста CarPlay приведён к статической сборке");
