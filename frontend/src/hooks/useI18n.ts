import { useCallback, useState } from "react";

const translations = {
  en: {
    videoHeader: "Live Video Feed",
    header: "Robot Arm Control",
    jointControl: "Joint Control",
    j1: "J1 Base",
    j2: "J2",
    j3: "J3",
    j4: "J4",
    j5: "J5",
    j6: "J6 End",
    gripperControl: "Gripper Control",
    gripperLabel: "Gripper",
    fullyOpen: "Fully Open",
    fullyClosed: "Fully Closed",
    openBtn: "Open",
    closeBtn: "Close",
    resetBtn: "Reset All",
    syncBtn: "Sync Status",
    ready: "Ready",
    synced: "Synced",
    toggleLabel: "\u4E2D\u6587",
    disconnected: "Disconnected \u2014 arm going to safe position",
    detectTitle: "Object Detection",
    enableDetect: "Enable Detection",
    disableDetect: "Disable Detection",
    loadingModel: "Loading model...",
    moveToTarget: "Move to Target",
    clearTarget: "Clear",
  },
  zh: {
    videoHeader: "\u5B9E\u65F6\u89C6\u9891\u76D1\u63A7",
    header: "\u673A\u68B0\u81C2\u5B8C\u6574\u63A7\u5236",
    jointControl: "\u5173\u8282\u63A7\u5236",
    j1: "J1 \u5E95\u5EA7",
    j2: "J2",
    j3: "J3",
    j4: "J4",
    j5: "J5",
    j6: "J6 \u672B\u7AEF",
    gripperControl: "\u5939\u5177\u63A7\u5236",
    gripperLabel: "\u5939\u5177\u5F00\u5408",
    fullyOpen: "\u5B8C\u5168\u5F20\u5F00",
    fullyClosed: "\u5B8C\u5168\u95ED\u5408",
    openBtn: "\u5F20\u5F00",
    closeBtn: "\u95ED\u5408",
    resetBtn: "\u5168\u90E8\u5F52\u96F6",
    syncBtn: "\u540C\u6B65\u72B6\u6001",
    ready: "\u5C31\u7EEA",
    synced: "\u5DF2\u540C\u6B65",
    toggleLabel: "EN",
    disconnected:
      "\u8FDE\u63A5\u65AD\u5F00 \u2014 \u673A\u68B0\u81C2\u56DE\u5230\u5B89\u5168\u4F4D\u7F6E",
    detectTitle: "\u76EE\u6807\u68C0\u6D4B",
    enableDetect: "\u542F\u7528\u68C0\u6D4B",
    disableDetect: "\u7981\u7528\u68C0\u6D4B",
    loadingModel: "\u52A0\u8F7D\u6A21\u578B\u4E2D...",
    moveToTarget: "\u79FB\u52A8\u5230\u76EE\u6807",
    clearTarget: "\u6E05\u9664",
  },
} as const;

type Lang = keyof typeof translations;
type TranslationKey = keyof (typeof translations)["en"];

export function useI18n() {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem("mecharm_lang");
    return stored === "zh" ? "zh" : "en";
  });

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("mecharm_lang", newLang);
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "zh" : "en");
  }, [lang, setLang]);

  const t = useCallback(
    (key: TranslationKey): string => {
      return translations[lang][key];
    },
    [lang],
  );

  return { lang, setLang, toggleLang, t };
}
