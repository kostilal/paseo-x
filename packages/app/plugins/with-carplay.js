const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const DELEGATE = "CarPlaySceneDelegate";
const PHONE_DELEGATE = "PhoneSceneDelegate";

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

/**
 * Делегат телефонной сцены.
 *
 * Как только в Info.plist появляется манифест сцен, UIKit перестаёт показывать окно,
 * которое Expo создаёт по-старому в `AppDelegate.didFinishLaunching`: оно не привязано
 * ни к одной сцене, и на телефоне остаётся чёрный экран со статус-баром. Этот делегат
 * забирает уже созданное окно и связывает его со сценой — так и CarPlay-роль работает,
 * и телефон остаётся живым, без переписывания AppDelegate под сцены.
 */
const PHONE_HEADER = `#import <UIKit/UIKit.h>

@interface ${PHONE_DELEGATE} : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end
`;

const PHONE_SOURCE = `#import "${PHONE_DELEGATE}.h"

@implementation ${PHONE_DELEGATE}

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions {
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }
  UIWindowScene *windowScene = (UIWindowScene *)scene;

  // Окно создаём из самой сцены. Переиспользовать то, что собрал AppDelegate, нельзя:
  // оно сделано через UIWindow(frame:) до появления сцен, и проставленный ему
  // windowScene экран не оживляет — остаётся чернота. А вот корневой контроллер,
  // в котором уже живёт React Native, переносим как есть.
  UIWindow *window = [[UIWindow alloc] initWithWindowScene:windowScene];

  UIViewController *root = nil;
  id<UIApplicationDelegate> appDelegate = UIApplication.sharedApplication.delegate;
  if ([appDelegate respondsToSelector:@selector(window)]) {
    root = appDelegate.window.rootViewController;
  }
  if (root == nil) {
    for (UIWindow *candidate in UIApplication.sharedApplication.windows) {
      if (candidate.rootViewController != nil) {
        root = candidate.rootViewController;
        break;
      }
    }
  }

  window.rootViewController = root;
  self.window = window;
  [window makeKeyAndVisible];

  if (root == nil) {
    NSLog(@"[paseo-x] корневой контроллер не найден — экран телефона останется пустым");
  }
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
      fs.writeFileSync(path.join(dir, `${PHONE_DELEGATE}.h`), PHONE_HEADER);
      fs.writeFileSync(path.join(dir, `${PHONE_DELEGATE}.m`), PHONE_SOURCE);
      return cfg;
    },
  ]);

  // Файл, не добавленный в таргет, не компилируется: Xcode собирает только то,
  // что перечислено в проекте.
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = cfg.modRequest.projectName;
    const group = project.findPBXGroupKey({ name });
    for (const file of [`${name}/${DELEGATE}.m`, `${name}/${PHONE_DELEGATE}.m`]) {
      if (!project.hasFile(file)) {
        project.addSourceFile(file, { target: project.getFirstTarget().uuid }, group);
      }
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
        // Без роли окна телефон остаётся чёрным: манифест сцен отменяет старый путь,
        // которым Expo показывает своё окно.
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: PHONE_DELEGATE,
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
