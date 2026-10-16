import type { ImageSourcePropType } from "react-native";
import { STATES } from "./images";

/** Состояние проекта — самое важное из его чатов; им окрашена плашка. */
export type ProjectState = "need" | "work" | "quiet";

const COLORS: Record<ProjectState, { fill: string; ink: string }> = {
  need: { fill: "#FFA826", ink: "#2B1700" },
  work: { fill: "#7B5CF0", ink: "#FFFFFF" },
  quiet: { fill: "#5C5966", ink: "#F4F3F7" },
};

/** Холст 60×60 pt, рендер в @3x. */
const SIDE = 60;
const SCALE = 3;
const PX = SIDE * SCALE;

type SkiaModule = typeof import("@shopify/react-native-skia");

/**
 * Skia берётся лениво: в тестах её нет, а в приложении она нужна только когда на
 * экране машины впервые появляется проект с такими буквами.
 */
function loadSkia(): SkiaModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@shopify/react-native-skia") as SkiaModule;
  } catch {
    return null;
  }
}

/** SF Pro Rounded Bold, как в дизайне; без него — системный жирный. */
function pickFont(skia: SkiaModule, size: number) {
  try {
    const typeface = skia.Skia.FontMgr.System().matchFamilyStyle("SF Pro Rounded", {
      weight: skia.FontWeight.Bold,
    });
    if (typeface) {
      return skia.Skia.Font(typeface, size);
    }
  } catch {
    // Семейства нет на этой системе — ниже общий путь.
  }
  try {
    return skia.matchFont({ fontFamily: "system-ui", fontSize: size, fontWeight: "bold" });
  } catch {
    return null;
  }
}

/**
 * Правило плашки из дизайна: скруглённый квадрат на весь холст с радиусом 24 %, две
 * заглавные буквы в 36 % стороны, по центру.
 */
function render(initials: string, state: ProjectState): ImageSourcePropType | null {
  const skia = loadSkia();
  if (!skia) {
    return null;
  }
  const { Skia } = skia;
  const surface = Skia.Surface.MakeOffscreen(PX, PX);
  if (!surface) {
    return null;
  }
  const canvas = surface.getCanvas();
  const fill = Skia.Paint();
  fill.setAntiAlias(true);
  fill.setColor(Skia.Color(COLORS[state].fill));
  const radius = PX * 0.24;
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, PX, PX), radius, radius), fill);

  const font = pickFont(skia, PX * 0.36);
  if (font) {
    const ink = Skia.Paint();
    ink.setAntiAlias(true);
    ink.setColor(Skia.Color(COLORS[state].ink));
    const bounds = font.measureText(initials, ink);
    const x = (PX - bounds.width) / 2 - bounds.x;
    const y = (PX - bounds.height) / 2 - bounds.y;
    canvas.drawText(initials, x, y, ink, font);
  }

  const image = surface.makeImageSnapshot();
  const base64 = image.encodeToBase64();
  return { uri: `data:image/png;base64,${base64}`, scale: SCALE, width: SIDE, height: SIDE };
}

const cache = new Map<string, ImageSourcePropType | null>();

const FALLBACK: Record<ProjectState, ImageSourcePropType | undefined> = {
  need: STATES.needReply,
  work: STATES.work,
  quiet: STATES.ready,
};

/**
 * Плашка проекта: буквы узнаются по форме, цвет показывает состояние. Рисуется один
 * раз на пару «буквы + состояние» и дальше отдаётся из памяти; если нарисовать нечем —
 * значок состояния, чтобы строка не осталась без картинки.
 */
export function projectPlate(
  initials: string,
  state: ProjectState,
): ImageSourcePropType | undefined {
  const key = `${initials}:${state}`;
  if (!cache.has(key)) {
    let plate: ImageSourcePropType | null = null;
    try {
      plate = render(initials, state);
    } catch {
      plate = null;
    }
    cache.set(key, plate);
  }
  return cache.get(key) ?? FALLBACK[state];
}
