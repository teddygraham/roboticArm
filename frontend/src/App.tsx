import { useCallback, useEffect, useRef } from "react";
import { ControlPanel } from "./components/ControlPanel";
import { VideoFeed } from "./components/VideoFeed";
import { useArm } from "./hooks/useArm";
import { useDetection } from "./hooks/useDetection";
import { useI18n } from "./hooks/useI18n";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWiFi } from "./hooks/useWiFi";
import type { WsIncoming } from "./types";

export function App() {
  const { t, toggleLang, lang } = useI18n();

  useEffect(() => {
    document.title = lang === "en" ? "MechArm Control" : "MechArm \u5B8C\u6574\u63A7\u5236";
  }, [lang]);

  // WS message handler is built after arm/detection hooks exist, so we use a
  // stable callback ref that dispatches to both.
  const armHandlerRef = useRef<((msg: WsIncoming) => void) | null>(null);
  const { send, isConnected } = useWebSocket(
    useCallback((msg: WsIncoming) => {
      armHandlerRef.current?.(msg);
    }, []),
  );

  const arm = useArm(send, isConnected);
  armHandlerRef.current = arm.handleMessage;

  const detection = useDetection(send);
  const wifi = useWiFi();

  const disconnectedMsg = t("disconnected");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_450px] h-screen">
      <VideoFeed
        streamUrl="/video"
        headerText={t("videoHeader")}
        detections={detection.detections}
        selectedTarget={detection.selectedTarget}
        isDetecting={detection.isActive}
        onCanvasClick={detection.selectDetection}
        onRefs={detection.setRefs}
      />
      <ControlPanel
        t={t as (key: string) => string}
        onToggleLang={toggleLang}
        langToggleLabel={lang === "en" ? "\u4E2D\u6587" : "EN"}
        angles={arm.angles}
        gripper={arm.gripper}
        onJointChange={arm.setJoint}
        onGripperChange={arm.setGripperValue}
        onGripperOpen={arm.openGripper}
        onGripperClose={arm.closeGripper}
        onReset={arm.reset}
        onSync={arm.requestSync}
        detectActive={detection.isActive}
        detectLoading={detection.isLoading}
        inferenceMs={detection.inferenceMs}
        selectedTarget={detection.selectedTarget}
        onToggleDetection={detection.toggleDetection}
        onSendTarget={detection.sendTarget}
        onClearTarget={detection.clearTarget}
        isConnected={isConnected}
        lastStatus={isConnected ? arm.lastStatus : disconnectedMsg}
        wifiNetworks={wifi.networks}
        wifiStatus={wifi.status}
        wifiScanning={wifi.isScanning}
        wifiConnecting={wifi.isConnecting}
        wifiError={wifi.error}
        onWifiScan={wifi.scan}
        onWifiConnect={wifi.connect}
        onWifiDisconnect={wifi.disconnect}
        onRestartServer={() => {
          fetch("/api/system/restart", { method: "POST" }).catch(() => {});
        }}
        onRebootPi={() => {
          if (confirm(t("confirmReboot") as string)) {
            fetch("/api/system/reboot", { method: "POST" }).catch(() => {});
          }
        }}
      />
    </div>
  );
}
