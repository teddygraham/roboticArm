import type { TargetSelection } from "../types";

interface Props {
  isActive: boolean;
  isLoading: boolean;
  inferenceMs: number;
  target: TargetSelection | null;
  onToggle: () => void;
  onSendTarget: () => void;
  onClear: () => void;
  labels: {
    enableDetect: string;
    disableDetect: string;
    loadingModel: string;
    moveToTarget: string;
    clearTarget: string;
  };
}

export function DetectionPanel({
  isActive,
  isLoading,
  inferenceMs,
  target,
  onToggle,
  onSendTarget,
  onClear,
  labels,
}: Props) {
  let btnText = labels.enableDetect;
  if (isLoading) btnText = labels.loadingModel;
  else if (isActive) btnText = labels.disableDetect;

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 my-4">
      <button
        onClick={onToggle}
        disabled={isLoading}
        className={`w-full font-bold py-2 px-4 rounded-md text-sm transition-colors ${
          isLoading
            ? "bg-slate-600 text-slate-400 cursor-wait"
            : isActive
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-emerald-500 hover:bg-emerald-600 text-slate-900"
        }`}
      >
        {btnText}
      </button>

      {isActive && inferenceMs > 0 && (
        <p className="text-slate-500 text-xs text-center mt-2">
          {inferenceMs}ms @ 5fps
        </p>
      )}

      {target && (
        <div className="bg-slate-900 border border-amber-500/50 rounded-md p-3 mt-3">
          <p className="text-amber-400 text-sm mb-2">
            {target.detection.class}{" "}
            {Math.round(target.detection.score * 100)}% ({target.center[0]},{" "}
            {target.center[1]})
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onSendTarget}
              className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold py-1.5 px-3 rounded text-xs transition-colors"
            >
              {labels.moveToTarget}
            </button>
            <button
              onClick={onClear}
              className="bg-slate-700 hover:bg-slate-600 text-emerald-400 border border-emerald-500/50 font-bold py-1.5 px-3 rounded text-xs transition-colors"
            >
              {labels.clearTarget}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
