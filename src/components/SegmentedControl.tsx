"use client";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A small pill-shaped radio group. One tap switches; no precision needed. */
export default function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className = "",
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex rounded-full bg-white p-1 shadow-lg ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
