import type { JointConfig } from "../types";

interface Props {
  config: JointConfig;
  value: number;
  label: string;
  onChange: (id: number, value: number) => void;
}

export function JointSlider({ config, value, label, onChange }: Props) {
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 mb-3">
      <div className="flex justify-between mb-2 text-sm font-semibold">
        <span className="text-slate-200">{label}</span>
        <span className="text-amber-400 min-w-[60px] text-right">
          {value}&deg;
        </span>
      </div>
      <input
        type="range"
        className="w-full"
        min={config.min}
        max={config.max}
        value={value}
        onInput={(e) =>
          onChange(config.id, parseInt((e.target as HTMLInputElement).value))
        }
      />
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{config.min}&deg;</span>
        <span>+{config.max}&deg;</span>
      </div>
    </div>
  );
}
