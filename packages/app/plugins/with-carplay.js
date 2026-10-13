const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const DELEGATE = "CarPlaySceneDelegate";

/**
 * Делегат сцены CarPlay.
 *
 * Библиотека его не содержит: она ждёт, что приложение само позовёт
 * `+[RNCarPlay connectWithInterfaceController:window:]`, когда машина подключится.
 * Без этого вызова сцена поднимается, но `didConnect` не приходит, корневой шаблон
 * никогда не ставится, и на экране машины пусто.
 *
 * На Objective-C, а не на Swift: заголовок пода виден отсюда напрямую, и не нужен
 * мост через bridging header, который Expo генерирует сам и перегенерирует при каждом
 * prebuild.
 */
const HEADER = `#import <UIKit/UIKit.h>
#import <CarPlay/CarPlay.h>

@interface ${DELEGATE} : UIResponder <CPTemplateApplicationSceneDelegate>
@end
`;

const SOURCE = `#import "${DELEGATE}.h"
#import "RNCarPlay.h"

@implementation ${DELEGATE}

// iOS 14 и новее: окно берётся у самой сцены.
- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene
    didConnectInterfaceController:(CPInterfaceController *)interfaceController {
  [RNCarPlay connectWithInterfaceController:interfaceController window:scene.carWindow];
}

// iOS 13: окно приходит отдельным аргументом.
- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene
    didConnectInterfaceController:(CPInterfaceController *)interfaceController
                         toWindow:(CPWindow *)window {
  [RNCarPlay connectWithInterfaceController:interfaceController window:window];
}

- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene
 didDisconnectInterfaceController:(CPInterfaceController *)interfaceController {
  [RNCarPlay disconnect];
}

- (void)templateApplicationScene:(CPTemplateApplicationScene *)scene
 didDisconnectInterfaceController:(CPInterfaceController *)interfaceController
                       fromWindow:(CPWindow *)window {
  [RNCarPlay disconnect];
}

@end
`;

const withCarPlay = (config) => {
  // Файлы делегата кладём рядом с AppDelegate — prebuild пересоздаёт каталог,
  // поэтому пишем их на каждом прогоне.
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${DELEGATE}.h`), HEADER);
      fs.writeFileSync(path.join(dir, `${DELEGATE}.m`), SOURCE);
      return cfg;
    },
  ]);

  // Файл, не добавленный в таргет, не компилируется: Xcode собирает только то,
  // что перечислено в проекте.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = cfg.modRequest.projectName;
    const relative = `${name}/${DELEGATE}.m`;
    if (!project.hasFile(relative)) {
      const group = project.findPBXGroupKey({ name });
      project.addSourceFile(relative, { target: project.getFirstTarget().uuid }, group);
    }
    return cfg;
  });

  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneClassName: "CPTemplateApplicationScene",
            UISceneConfigurationName: "CarPlay",
            UISceneDelegateClassName: DELEGATE,
          },
        ],
      },
    };
    // Голос в машине продолжается при погасшем экране телефона.
    const modes = new Set(cfg.modResults.UIBackgroundModes ?? []);
    modes.add("audio");
    cfg.modResults.UIBackgroundModes = [...modes];
    return cfg;
  });

  // Для симулятора: ключ нужен локально, настоящий придёт в профиле от Apple.
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults["com.apple.developer.carplay-voice-based-conversation"] = true;
    return cfg;
  });
};

module.exports = withCarPlay;
