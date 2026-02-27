import { JOINTS } from "../constants";
import type { TargetSelection } from "../types";
import { DetectionPanel } from "./DetectionPanel";
import { GripperControl } from "./GripperControl";
import { JointSlider } from "./JointSlider";
import { StatusBar } from "./StatusBar";

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
}: Props) {
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

      <StatusBar isConnected={isConnected} message={lastStatus} />
    </div>
  );
}
