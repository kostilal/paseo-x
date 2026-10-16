import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import type { ListItem, ListSection } from "@g4rb4g3/react-native-carplay";
import { S } from "./strings";

export const rootSections = (rows: ListItem[]): ListSection[] => [{ items: rows }];

/**
 * Первый экран — проекты. Пустой экран всегда объясняет себя: на экране машины
 * молчаливая пустота неотличима от поломки, а разбираться за рулём нечем.
 */
export function createRootTemplate(input: {
  rows: ListItem[];
  connected: boolean;
  onPick: (key: string) => void;
}): ListTemplate {
  return new ListTemplate({
    id: "root",
    title: S.rootTitle,
    // Библиотека вешает кнопку «Назад» на каждый шаблон, и на корне она выкидывает из
    // приложения на домашний экран машины — одним случайным тапом.
    backButtonHidden: true,
    sections: rootSections(input.rows),
    emptyViewTitleVariants: [input.connected ? S.noProjects : S.noConnection],
    emptyViewSubtitleVariants: [input.connected ? S.startOnDesktop : S.noConnectionHint],
    onItemSelect: async ({ id }) => {
      if (typeof id === "string" && id) {
        input.onPick(id);
      }
    },
  });
}
