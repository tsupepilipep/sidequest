"use client";

interface Props {
  onClick: () => void;
}

/** Opens the add-a-point flow (elevator, ramp or underpass). */
export default function AddButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Add an elevator, ramp or underpass here"
      aria-label="Add an elevator, ramp or underpass"
      className="absolute right-4 top-[10.5rem] z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg transition-colors hover:bg-gray-50"
    >
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
