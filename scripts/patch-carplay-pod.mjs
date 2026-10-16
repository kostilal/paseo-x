// Правки в @g4rb4g3/react-native-carplay, которые нельзя сделать снаружи.
//
// 1. Инклюд Swift-моста. RNCarPlay.m включает сгенерированный заголовок «фреймворковой»
//    формой, с префиксом модуля: такой путь существует только когда под собран как
//    фреймворк. Paseo собирается статически, и тогда заголовок лежит в DerivedSources
//    самого таргета — доступен по имени без префикса. DEFINES_MODULE не помогает:
//    CocoaPods положил бы его в каталог имени пода (с дефисами), а инклюд просит имя
//    модуля (с подчёркиваниями).
// 2. Глифы кнопок навбара как template-картинки: иначе белый глиф в светлой теме машины
//    невидим. Система тонирует template-картинку под свою тему.
// 3. Анимированная картинка экрана прослушивания: библиотека принимает один кадр,
//    `images` + `duration` собираются в `animatedImageWithImages:duration:`.
//
// Как и сплайсы плагина голоса: отказываемся, если якоря нет или их больше одного;
// уже наложенная правка узнаётся по замене и пропускается.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ?? process.cwd();
const file = path.join(root, "node_modules/@g4rb4g3/react-native-carplay/ios/RNCarPlay.m");

const splices = [
  {
    title: "инклюд Swift-моста приведён к статической сборке",
    anchor: '#import "react_native_carplay/react_native_carplay-Swift.h"',
    replacement: '#import "react_native_carplay-Swift.h"',
  },
  {
    title: "глифы кнопок навбара — template-картинки",
    anchor: "            [_barButton setImage:_image];",
    replacement:
      "            [_barButton setImage:[_image imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate]];",
  },
  {
    title: "экран прослушивания принимает кадры анимации",
    anchor:
      '    return [[CPVoiceControlState alloc] initWithIdentifier:[RCTConvert NSString:json[@"identifier"]] titleVariants:[RCTConvert NSStringArray:json[@"titleVariants"]] image:[RCTConvert UIImage:json[@"image"]] repeats:[RCTConvert BOOL:json[@"repeats"]]];',
    replacement: `    UIImage *stateImage = [RCTConvert UIImage:json[@"image"]];
    NSArray *frameSources = [RCTConvert NSArray:json[@"images"]];
    if (frameSources.count > 0) {
        NSMutableArray<UIImage *> *frames = [NSMutableArray arrayWithCapacity:frameSources.count];
        for (id source in frameSources) {
            UIImage *frame = [RCTConvert UIImage:source];
            if (frame) {
                [frames addObject:frame];
            }
        }
        if (frames.count > 0) {
            NSTimeInterval duration = json[@"duration"] ? [RCTConvert NSTimeInterval:json[@"duration"]] : 1.0;
            stateImage = [UIImage animatedImageWithImages:frames duration:duration];
        }
    }
    return [[CPVoiceControlState alloc] initWithIdentifier:[RCTConvert NSString:json[@"identifier"]] titleVariants:[RCTConvert NSStringArray:json[@"titleVariants"]] image:stateImage repeats:[RCTConvert BOOL:json[@"repeats"]]];`,
  },
];

let source = await readFile(file, "utf8");
let changed = false;
for (const { title, anchor, replacement } of splices) {
  if (source.includes(replacement) && !source.includes(anchor)) {
    console.log(`  ✓ уже наложено: ${title}`);
    continue;
  }
  const count = source.split(anchor).length - 1;
  if (count !== 1) {
    console.error(
      `  ✗ ожидал один якорь в RNCarPlay.m для «${title}», нашёл ${count} — библиотека изменилась, правку надо пересмотреть`,
    );
    process.exit(1);
  }
  source = source.replace(anchor, replacement);
  changed = true;
  console.log(`  ✓ ${title}`);
}
if (changed) {
  await writeFile(file, source);
}
