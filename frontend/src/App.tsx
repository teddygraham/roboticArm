import { Settings } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityLog } from "./components/ActivityLog";
import { LiveCameraView } from "./components/LiveCameraView";
import { RackNavigator } from "./components/RackNavigator";
import { RobotArmController } from "./components/RobotArmController";
import { RobotBasicInfo } from "./components/RobotBasicInfo";
import { TargetSystemInfo } from "./components/TargetSystemInfo";
import { WiFiPanel } from "./components/WiFiPanel";
import { useActivityLog } from "./hooks/useActivityLog";
import { useArm } from "./hooks/useArm";
import { useDetection } from "./hooks/useDetection";
import { useI18n } from "./hooks/useI18n";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWiFi } from "./hooks/useWiFi";
import type { WsIncoming } from "./types";

export function App() {
  const { t, lang } = useI18n();
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [inferenceUrl, setInferenceUrl] = useState<string>("");

  useEffect(() => {
    document.title = lang === "en" ? "MechArm Dashboard" : "MechArm 控制台";
  }, [lang]);

  // Fetch runtime config (inference URL) from Pi
  useEffect(() => {
    fetch("/config")
      .then((r) => r.json())
      .then((data) => setInferenceUrl(data.inference_url || ""))
      .catch(() => {});
  }, []);

  // Activity log
  const activityLog = useActivityLog();

  // WebSocket
  const armHandlerRef = useRef<((msg: WsIncoming) => void) | null>(null);
  const { send, isConnected } = useWebSocket(
    useCallback((msg: WsIncoming) => {
      armHandlerRef.current?.(msg);
    }, []),
  );

  // Log connection changes
  const prevConnected = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevConnected.current === null) {
      prevConnected.current = isConnected;
      return;
    }
    if (isConnected !== prevConnected.current) {
      activityLog.addEvent(
        "connection",
        isConnected ? "Connected to arm controller" : "Disconnected — arm moving to safe position",
      );
      prevConnected.current = isConnected;
    }
  }, [isConnected, activityLog]);

  // Arm
  const arm = useArm(send, isConnected);

  // Wrap arm handler to log acks
  const wrappedHandleMessage = useCallback(
    (msg: WsIncoming) => {
      arm.handleMessage(msg);
      if (msg.type === "ack") activityLog.addEvent("joint", msg.m);
      if (msg.type === "target_ack") activityLog.addEvent("detection", msg.m);
    },
    [arm, activityLog],
  );
  armHandlerRef.current = wrappedHandleMessage;

  // Wrap arm actions for logging (debounced — only log reset/sync immediately)
  const jointLogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleJointChange = useCallback(
    (id: number, value: number) => {
      arm.setJoint(id, value);
      if (jointLogTimer.current) clearTimeout(jointLogTimer.current);
      jointLogTimer.current = setTimeout(() => {
        activityLog.addEvent("joint", `J${id} → ${value}°`);
      }, 500);
    },
    [arm, activityLog],
  );

  const handleGripperChange = useCallback(
    (value: number) => {
      arm.setGripperValue(value);
    },
    [arm],
  );

  const handleReset = useCallback(() => {
    arm.reset();
    activityLog.addEvent("system", "All joints reset to zero");
  }, [arm, activityLog]);

  const handleSync = useCallback(() => {
    arm.requestSync();
    activityLog.addEvent("system", "Sync requested");
  }, [arm, activityLog]);

  const handleGripperOpen = useCallback(() => {
    arm.openGripper();
    activityLog.addEvent("gripper", "Gripper opened (100%)");
  }, [arm, activityLog]);

  const handleGripperClose = useCallback(() => {
    arm.closeGripper();
    activityLog.addEvent("gripper", "Gripper closed (0%)");
  }, [arm, activityLog]);

  // Detection
  const detection = useDetection(send, inferenceUrl || undefined);

  // Log detections
  const prevDetectionCount = useRef(0);
  useEffect(() => {
    if (!detection.isActive) return;
    const count = detection.detections.length;
    if (count !== prevDetectionCount.current && count > 0) {
      const classes = detection.detections.map((d) => d.class).join(", ");
      activityLog.addEvent("detection", `Detected: ${classes}`);
    }
    prevDetectionCount.current = count;
  }, [detection.detections, detection.isActive, activityLog]);

  const wifi = useWiFi();
  const disconnectedMsg = t("disconnected");

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold">M</span>
          </div>
          <h1 className="text-sm font-bold text-gray-800">MechArm Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          }`}>
            {isConnected ? "● Connected" : "● Disconnected"}
          </span>
          <button
            onClick={() => setShowSystemModal(true)}
            title="System Settings"
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* 3×2 Dashboard grid */}
      <div className="p-3 grid grid-cols-4 grid-rows-2 gap-3 h-[calc(100vh-52px)]">
        {/* Row 1, Col 1 */}
        <div className="col-span-1">
          <TargetSystemInfo
            wifiStatus={wifi.status}
            isConnected={isConnected}
            onManageSystem={() => setShowSystemModal(true)}
          />
        </div>

        {/* Row 1, Col 2-3 */}
        <div className="col-span-2">
          <LiveCameraView
            streamUrl="/video"
            isConnected={isConnected}
            detections={detection.detections}
            selectedTarget={detection.selectedTarget}
            isDetecting={detection.isActive}
            detectLoading={detection.isLoading}
            inferenceMs={detection.inferenceMs}
            detectMode={detection.detectionMode}
            hasInferenceServer={detection.hasInferenceServer}
            onCanvasClick={detection.selectDetection}
            onRefs={detection.setRefs}
            onSetDetectMode={detection.setDetectionMode}
            onToggleDetection={detection.toggleDetection}
            onSendTarget={detection.sendTarget}
            onClearTarget={detection.clearTarget}
            t={t as (key: string) => string}
          />
        </div>

        {/* Row 1, Col 4 */}
        <div className="col-span-1">
          <RobotBasicInfo
            isConnected={isConnected}
            angles={arm.angles}
            gripper={arm.gripper}
            lastStatus={isConnected ? arm.lastStatus : disconnectedMsg}
          />
        </div>

        {/* Row 2, Col 1 */}
        <div className="col-span-1">
          <RackNavigator />
        </div>

        {/* Row 2, Col 2-3 */}
        <div className="col-span-2">
          <RobotArmController
            t={t as (key: string) => string}
            angles={arm.angles}
            gripper={arm.gripper}
            coords={arm.coords}
            onJointChange={handleJointChange}
            onGripperChange={handleGripperChange}
            onGripperOpen={handleGripperOpen}
            onGripperClose={handleGripperClose}
            onReset={handleReset}
            onSync={handleSync}
            onSendCoords={arm.sendCoords}
            onSyncCoords={arm.syncCoords}
            isConnected={isConnected}
            lastStatus={isConnected ? arm.lastStatus : disconnectedMsg}
          />
        </div>

        {/* Row 2, Col 4 */}
        <div className="col-span-1">
          <ActivityLog entries={activityLog.entries} />
        </div>
      </div>

      {/* System modal (WiFi) */}
      {showSystemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-800">System Management</h2>
              <button
                onClick={() => setShowSystemModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <WiFiPanel
                  networks={wifi.networks}
                  status={wifi.status}
                  isScanning={wifi.isScanning}
                  isConnecting={wifi.isConnecting}
                  error={wifi.error}
                  onScan={wifi.scan}
                  onConnect={wifi.connect}
                  onDisconnect={wifi.disconnect}
                  onRestartServer={() => fetch("/api/system/restart", { method: "POST" }).catch(() => {})}
                  onRebootPi={() => {
                    if (confirm(t("confirmReboot") as string)) {
                      fetch("/api/system/reboot", { method: "POST" }).catch(() => {});
                    }
                  }}
                  labels={{
                    connectedTo: t("wifiConnectedTo"),
                    notConnected: t("wifiNotConnected"),
                    scan: t("scanBtn"),
                    scanning: t("scanning"),
                    connect: t("connectBtn"),
                    disconnect: t("disconnectBtn"),
                    connecting: t("connecting"),
                    password: t("passwordLabel"),
                    noNetworks: t("noNetworks"),
                    error: t("wifiError"),
                    restartServer: t("restartServer"),
                    restartHint: t("restartHint"),
                    rebootPi: t("rebootPi"),
                    rebootHint: t("rebootHint"),
                    systemTitle: t("systemTitle"),
                  }}
                />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
