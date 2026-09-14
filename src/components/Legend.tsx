"use client";

const ITEMS = [
  { color: "#22c55e", label: "Good (1.34–2)" },
  { color: "#eab308", label: "Passable (0.67–1.33)" },
  { color: "#ef4444", label: "Terrible (0–0.66)" },
  { color: "#888888", label: "Not rated" },
];

export default function Legend({ offsetBottom = false }: { offsetBottom?: boolean }) {
  return (
    <div className={`absolute left-4 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-sm shadow-md backdrop-blur-sm ${offsetBottom ? "bottom-48" : "bottom-4"}`}>
      <div className="mb-1 font-semibold text-gray-700">Sidewalk Quality</div>
      {ITEMS.map(({ color, label }) => (
        <div key={color} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-3 w-6 rounded-sm"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-600">{label}</span>
        </div>
      ))}
    </div>
  );
}
