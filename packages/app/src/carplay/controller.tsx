import { useEffect } from "react";
import { ListTemplate } from "@g4rb4g3/react-native-carplay";
import { onCarPlayConnect, onCarPlayDisconnect, setRoot } from "./connection";
import { S } from "./strings";

/** Ничего не рисует на телефоне: живёт в дереве провайдеров ради доступа к сторам и голосу. */
export function CarPlayController(): null {
  useEffect(() => {
    const offConnect = onCarPlayConnect(() => {
      setRoot(
        new ListTemplate({
          id: "root",
          title: S.rootTitle,
          sections: [],
          emptyViewTitleVariants: [S.noAgents],
        }),
      );
    });
    const offDisconnect = onCarPlayDisconnect(() => {});
    return () => {
      offConnect();
      offDisconnect();
    };
  }, []);

  return null;
}
