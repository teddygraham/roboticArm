// Rack Navigator — static SVG diagram of a server rack
// highlightUnit: which rack unit (1-indexed from top) to highlight

interface Props {
  highlightUnit?: number;
}

const TOTAL_UNITS = 12;
const HIGHLIGHTED_UNITS = [3, 4]; // Server Node-042 occupies 2U

export function RackNavigator({ highlightUnit }: Props) {
  const activeUnits = highlightUnit ? [highlightUnit] : HIGHLIGHTED_UNITS;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Rack Navigator</p>
          <h2 className="text-sm font-semibold text-gray-800 mt-0.5">Rack A</h2>
        </div>
        <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
          A-03
        </span>
      </div>

      {/* Rack diagram */}
      <div className="flex-1 flex items-center justify-center px-4 py-3">
        <div className="w-full max-w-[140px]">
          {/* Rack frame */}
          <div className="border-2 border-gray-400 rounded-sm bg-gray-100 p-1 space-y-0.5">
            {Array.from({ length: TOTAL_UNITS }, (_, i) => {
              const unit = i + 1;
              const isActive = activeUnits.includes(unit);
              const isTop = unit === activeUnits[0];
              return (
                <div
                  key={unit}
                  className={`flex items-center gap-1.5 h-5 px-1.5 rounded-sm text-xs transition-colors ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "bg-white border border-gray-200 text-gray-400"
                  }`}
                >
                  <span className="font-mono text-[10px] w-4 text-right opacity-60">{unit}</span>
                  {isActive && (
                    <span className="text-[10px] font-semibold truncate">
                      {isTop ? "Node-042" : ""}
                    </span>
                  )}
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-3 justify-center">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-blue-500" />
              <span className="text-xs text-gray-400">Target</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-white border border-gray-300" />
              <span className="text-xs text-gray-400">Empty</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 pb-4">
        <div className="flex justify-between text-xs text-gray-500">
          <span>Units: {TOTAL_UNITS}U</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Navigating
          </span>
        </div>
      </div>
    </div>
  );
}
