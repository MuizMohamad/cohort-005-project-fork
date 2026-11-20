// PROTOTYPE: throwaway variant switcher. Never merge to main.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
}

export function PrototypeSwitcher({
  variants,
  current,
}: PrototypeSwitcherProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current)
  );

  function go(offset: number) {
    const next = variants[(index + offset + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) return null;

  const v = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1.5 text-sm text-white shadow-2xl ring-2 ring-yellow-400">
      <button
        onClick={() => go(-1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Previous variant"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-48 text-center font-mono">
        {v.key} ({v.name})
      </span>
      <button
        onClick={() => go(1)}
        className="rounded-full p-1 hover:bg-white/20"
        aria-label="Next variant"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
