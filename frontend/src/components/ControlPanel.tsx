import { useState } from "react";
import { JOINTS } from "../constants";
import type { TargetSelection, WiFiNetwork, WiFiStatus } from "../types";
import { DetectionPanel } from "./DetectionPanel";
import { GripperControl } from "./GripperControl";
import { JointSlider } from "./JointSlider";
import { StatusBar } from "./StatusBar";
import { WiFiPanel } from "./WiFiPanel";

interface Props {
  // i18n
  t: (key: string) => string;
  onToggleLang: () => void;
  langToggleLabel: string;
  // Arm state
  angles: number[];
  gripper: number;
  onJointChange: (id: number, value: number) => void;
  onGripperChange: (value: number) => void;
  onGripperOpen: () => void;
  onGripperClose: () => void;
  onReset: () => void;
  onSync: () => void;
  // Detection
  detectActive: boolean;
  detectLoading: boolean;
  inferenceMs: number;
  selectedTarget: TargetSelection | null;
  onToggleDetection: () => void;
  onSendTarget: () => void;
  onClearTarget: () => void;
  // Status
  isConnected: boolean;
  lastStatus: string;
  // WiFi
  wifiNetworks: WiFiNetwork[];
  wifiStatus: WiFiStatus;
  wifiScanning: boolean;
  wifiConnecting: boolean;
  wifiError: string | null;
  onWifiScan: () => void;
  onWifiConnect: (ssid: string, password: string) => void;
  onWifiDisconnect: () => void;
  onRestartServer: () => void;
  onRebootPi: () => void;
}

export function ControlPanel({
  t,
  onToggleLang,
  langToggleLabel,
  angles,
  gripper,
  onJointChange,
  onGripperChange,
  onGripperOpen,
  onGripperClose,
  onReset,
  onSync,
  detectActive,
  detectLoading,
  inferenceMs,
  selectedTarget,
  onToggleDetection,
  onSendTarget,
  onClearTarget,
  isConnected,
  lastStatus,
  wifiNetworks,
  wifiStatus,
  wifiScanning,
  wifiConnecting,
  wifiError,
  onWifiScan,
  onWifiConnect,
  onWifiDisconnect,
  onRestartServer,
  onRebootPi,
}: Props) {
  const [activeTab, setActiveTab] = useState<"control" | "wifi">("control");

  return (
    <div className="bg-slate-900 p-5 overflow-y-auto relative">
      <div className="bg-emerald-500 text-slate-900 px-4 py-3 -mx-5 -mt-5 mb-5 text-center text-lg font-bold">
        {t("header")}
      </div>

      <button
        onClick={onToggleLang}
        className="absolute top-3 right-3 bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-500 px-3 py-1 text-xs rounded transition-colors z-10"
      >
        {langToggleLabel}
      </button>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setActiveTab("control")}
          className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${
            activeTab === "control"
              ? "bg-emerald-500 text-slate-900"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
          }`}
        >
          {t("controlTab")}
        </button>
        <button
          onClick={() => setActiveTab("wifi")}
          className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${
            activeTab === "wifi"
              ? "bg-emerald-500 text-slate-900"
              : "bg-slate-700 text-slate-300 hover:bg-slate-600"
          }`}
        >
          {t("wifiTab")}
        </button>
      </div>

      {activeTab === "control" ? (
        <>
          <h2 className="text-emerald-400 text-sm font-semibold mb-3 pb-1 border-b border-slate-700">
            {t("jointControl")}
          </h2>

          {JOINTS.map((joint, i) => (
            <JointSlider
              key={joint.id}
              config={joint}
              value={angles[i]!}
              label={t(joint.label)}
              onChange={onJointChange}
            />
          ))}

          <h2 className="text-emerald-400 text-sm font-semibold mb-3 pb-1 border-b border-slate-700 mt-5">
            {t("gripperControl")}
          </h2>

          <GripperControl
            value={gripper}
            onChange={onGripperChange}
            onOpen={onGripperOpen}
            onClose={onGripperClose}
            labels={{
              gripperLabel: t("gripperLabel"),
              fullyOpen: t("fullyOpen"),
              fullyClosed: t("fullyClosed"),
              openBtn: t("openBtn"),
              closeBtn: t("closeBtn"),
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onReset}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold py-2 px-4 rounded-md text-sm transition-colors"
            >
              {t("resetBtn")}
            </button>
            <button
              onClick={onSync}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-bold py-2 px-4 rounded-md text-sm transition-colors"
            >
              {t("syncBtn")}
            </button>
          </div>

          <h2 className="text-emerald-400 text-sm font-semibold mb-3 pb-1 border-b border-slate-700 mt-5">
            {t("detectTitle")}
          </h2>

          <DetectionPanel
            isActive={detectActive}
            isLoading={detectLoading}
            inferenceMs={inferenceMs}
            target={selectedTarget}
            onToggle={onToggleDetection}
            onSendTarget={onSendTarget}
            onClear={onClearTarget}
            labels={{
              enableDetect: t("enableDetect"),
              disableDetect: t("disableDetect"),
              loadingModel: t("loadingModel"),
              moveToTarget: t("moveToTarget"),
              clearTarget: t("clearTarget"),
            }}
          />
        </>
      ) : (
        <WiFiPanel
          networks={wifiNetworks}
          status={wifiStatus}
          isScanning={wifiScanning}
          isConnecting={wifiConnecting}
          error={wifiError}
          onScan={onWifiScan}
          onConnect={onWifiConnect}
          onDisconnect={onWifiDisconnect}
          onRestartServer={onRestartServer}
          onRebootPi={onRebootPi}
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
      )}

      <StatusBar isConnected={isConnected} message={lastStatus} />
    </div>
  );
}
