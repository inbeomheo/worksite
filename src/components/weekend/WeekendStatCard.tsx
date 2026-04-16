interface Props {
  label: string;
  value: string | number;
  icon?: string;
}

export default function WeekendStatCard({ label, value, icon }: Props) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-border">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {icon && <div className="text-sm opacity-60">{icon}</div>}
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
