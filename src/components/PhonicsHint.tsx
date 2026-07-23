import { phonicsOf } from "@/lib/phonics";
import { cn } from "@/lib/utils";

/**
 * 自然拼读提示行：em·PER·or 风格，重读音节大写+Valorant 红。
 * 单音节词不显示（没有拆分意义）。
 */
export function PhonicsHint({ word, className }: { word: string; className?: string }) {
  const { syllables, stress } = phonicsOf(word);
  if (syllables.length < 2) return null;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-0 text-sm leading-relaxed", className)}>
      <span className="val-title mr-1.5 text-[9px] tracking-[0.2em] text-val-dim">PHONICS</span>
      {syllables.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-0.5 text-val-dim">·</span>}
          {i === stress ? (
            <span className="font-black uppercase text-val-red">{s}</span>
          ) : (
            <span className="text-val-text/85">{s}</span>
          )}
        </span>
      ))}
    </p>
  );
}
