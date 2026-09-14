"use client";

interface Props {
  loading: boolean;
  active: boolean;
  error: string | null;
  onClick: () => void;
}

export default function LocateButton({
  loading,
  active,
  error,
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      title={error ?? "Find my location"}
      className="absolute bottom-20 right-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      {loading ? (
        <svg
          className="h-5 w-5 animate-spin text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <svg
          className={`h-5 w-5 ${active ? "text-blue-600" : "text-gray-600"}`}
          fill={active ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 2v2m0 16v2m10-10h-2M4 12H2"
          />
        </svg>
      )}
    </button>
  );
}
