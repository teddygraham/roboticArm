interface Props {
  isConnected: boolean;
  message: string;
}

export function StatusBar({ isConnected, message }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg p-3 mt-3 md:mt-4 text-center text-sm">
      <span
        className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
          isConnected
            ? "bg-emerald-400 shadow-[0_0_4px_theme(colors.emerald.400)]"
            : "bg-red-500 shadow-[0_0_4px_theme(colors.red.500)]"
        }`}
      />
      <span className="text-slate-300">{message}</span>
    </div>
  );
}
