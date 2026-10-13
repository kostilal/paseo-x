const { withInfoPlist, withEntitlementsPlist } = require("expo/config-plugins");

/**
 * CarPlay требует UIApplicationSceneManifest с ролью
 * CPTemplateApplicationSceneSessionRoleApplication. У Expo-апки манифеста нет вообще,
 * поэтому телефонную роль описываем тоже — без неё окно телефона остаётся чёрным.
 * Делегат CarPlay-сцены берётся из библиотеки (RNCarPlayApp.swift).
 */
const withCarPlay = (config) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: true,
      UISceneConfigurations: {
        CPTemplateApplicationSceneSessionRoleApplication: [
          {
            UISceneClassName: "CPTemplateApplicationScene",
            UISceneConfigurationName: "CarPlay",
            UISceneDelegateClassName: "RNCarPlaySceneDelegate",
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
