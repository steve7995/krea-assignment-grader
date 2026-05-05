interface ScoreBarProps {
  percentage: number;
  label?: string;
  showLabel?: boolean;
  height?: string;
}

export default function ScoreBar({
  percentage,
  label,
  showLabel = true,
  height = 'h-3',
}: ScoreBarProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const colorClass =
    clamped >= 75
      ? 'bg-green-500'
      : clamped >= 50
      ? 'bg-yellow-500'
      : 'bg-red-500';

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between mb-1 text-sm">
          {label && <span className="text-gray-600">{label}</span>}
          <span className="font-semibold ml-auto">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className={`w-full bg-gray-200 rounded-full overflow-hidden ${height}`}>
        <div
          className={`${height} ${colorClass} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
