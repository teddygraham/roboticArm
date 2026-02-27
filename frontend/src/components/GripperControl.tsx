interface Props {
  value: number;
  onChange: (value: number) => void;
  onOpen: () => void;
  onClose: () => void;
  labels: {
    gripperLabel: string;
    fullyOpen: string;
    fullyClosed: string;
    openBtn: string;
    closeBtn: string;
  };
}

export function GripperControl({
  value,
  onChange,
  onOpen,
  onClose,
  labels,
}: Props) {
  return (
    <div className="bg-slate-800 border border-amber-500/50 rounded-lg p-4 my-4">
      <div className="flex justify-between mb-2 text-sm font-semibold">
        <span className="text-slate-200">{labels.gripperLabel}</span>
        <span className="text-amber-400 min-w-[60px] text-right">
          {value}%
        </span>
      </div>
      <input
        type="range"
        className="w-full gripper-slider"
        min={0}
        max={100}
        value={value}
        onInput={(e) =>
          onChange(parseInt((e.target as HTMLInputElement).value))
        }
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{labels.fullyClosed}</span>
        <span>{labels.fullyOpen}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <button
          onClick={onClose}
          className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold py-2.5 px-4 rounded-md text-sm transition-colors"
        >
          {labels.closeBtn}
        </button>
        <button
          onClick={onOpen}
          className="bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold py-2.5 px-4 rounded-md text-sm transition-colors"
        >
          {labels.openBtn}
        </button>
      </div>
    </div>
  );
}
