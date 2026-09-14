"use client";

interface Props {
  active: boolean;
  /** Location is currently unavailable, so live mode cannot follow. */
  error: string | null;
  onToggle: () => void;
}

/**
 * One-tap toggle for live mode: the map follows your position and the
 * nearest sidewalk is selected automatically every few seconds.
 */
export default function LiveButton({ active, error, onToggle }: Props) {
  const broken = active && !!error;
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      title={
        error && active
          ? error
          : active
            ? "Live: following you. Tap to stop."
            : "Live: follow my location and pick the nearest sidewalk automatically"
      }
      className={`absolute right-4 top-[4.5rem] z-[1000] flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg transition-colors ${
        active
          ? broken
            ? "bg-red-600 text-white"
            : "bg-green-600 text-white hover:bg-green-700"
          : "bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="relative flex h-2.5 w-2.5">
        {active && !broken && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            active ? "bg-white" : "bg-gray-400"
          }`}
        />
      </span>
      Live
    </button>
  );
}
