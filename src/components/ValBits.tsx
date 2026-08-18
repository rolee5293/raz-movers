import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BadgeHelpers, RankDef } from "@/lib/game";
import { nextPeak } from "@/lib/game";
import type { SaveState } from "@/types";
import { speakWord, speakAsync } from "@/lib/speech";

/* 小红色竖条 + 大写标题 */
export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="inline-block h-4 w-1 bg-val-red" />
        <h2 className="val-title text-sm text-val-text">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function ValButton({
  children,
  onClick,
  variant = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "teal";
  disabled?: boolean;
  className?: string;
}) {
  const styles = {
    primary: "bg-val-red text-white hover:bg-val-red2 active:bg-val-red2",
    teal: "bg-val-teal text-val-bg hover:brightness-110",
    ghost: "bg-transparent border border-val-line text-val-text hover:border-val-red hover:text-val-red",
    danger: "bg-[#3a1d24] border border-val-red/60 text-val-red hover:bg-val-red hover:text-white",
  } as const;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "clip-btn val-title min-h-[48px] px-5 py-2.5 text-base transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        styles[variant],
        className
      )}
    >
      {children}
    </button>
  );
}

export function RankChip({ rank, size = "md" }: { rank: RankDef; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "clip-tag val-title inline-flex items-center gap-1.5",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      )}
      style={{ background: `${rank.color}22`, color: rank.color, border: `1px solid ${rank.color}66` }}
    >
      <span
        className="inline-block h-2 w-2 rotate-45"
        style={{ background: rank.color, boxShadow: `0 0 6px ${rank.color}` }}
      />
      {rank.cnName}
    </span>
  );
}

const PEAK_COLOR = "#FFF3B0";

/** 巅峰等级徽章。满级之前不显示 */
export function PeakChip({ level }: { level: number }) {
  if (level <= 0) return null;
  return (
    <span
      className="clip-tag val-title inline-flex items-center gap-1 px-2 py-0.5 text-[10px]"
      style={{ background: `${PEAK_COLOR}22`, color: PEAK_COLOR, border: `1px solid ${PEAK_COLOR}66` }}
    >
      👑 巅峰 {level}
    </span>
  );
}

/**
 * 满级之后接替 XpBar。段位条焊死在 100% 时不再有任何反馈，
 * 这里明确告诉孩子下一级差什么——XP 和挑战分开显示，因为两者要同时满足。
 */
export function PeakBar({ save, helpers }: { save: SaveState; helpers: BadgeHelpers }) {
  const next = nextPeak(save, helpers);
  if (!next) {
    return (
      <div className="val-title text-[10px]" style={{ color: PEAK_COLOR }}>
        XP {save.xp} · 巅峰满级 // LEGEND
      </div>
    );
  }
  const { def, cur, need, xpGap } = next;
  const pct = Math.min(100, Math.round((cur / need) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-val-dim">
        <span className="val-title truncate">
          巅峰 {def.level} {def.name} · {def.challenge}
        </span>
        <span className="shrink-0" style={{ color: cur >= need ? "#3DDB9A" : undefined }}>
          {cur}/{need}
        </span>
      </div>
      <div className="clip-tag h-2 w-full bg-val-panel2">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PEAK_COLOR}, #ff4655)` }}
        />
      </div>
      <div className="mt-1 text-[10px] text-val-dim">
        XP {save.xp}
        {xpGap > 0 ? ` · 还差 ${xpGap} XP` : " · XP 已达标 ✓"}
      </div>
    </div>
  );
}

export function XpBar({ rank, xp }: { rank: RankDef; xp: number }) {
  const cur = xp - rank.minXp;
  const need = rank.nextXp !== null ? rank.nextXp - rank.minXp : 1;
  const pct = Math.min(100, Math.round((cur / need) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] text-val-dim">
        <span className="val-title">XP {xp}</span>
        <span>{rank.nextXp !== null ? `${cur}/${need}` : "MAX"}</span>
      </div>
      <div className="clip-tag h-2 w-full bg-val-panel2">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${rank.color}, #ff4655)` }}
        />
      </div>
    </div>
  );
}

export function SpeakerButton({ text, size = "md", className }: { text: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const dims = size === "lg" ? "h-14 w-14 text-2xl" : size === "md" ? "h-11 w-11 text-lg" : "h-9 w-9 text-sm";
  const [phase, setPhase] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");
  const busy = phase === "loading" || phase === "playing";

  // "没出声"的静音标记保持到下次点击为止，不做定时自动收起：
  // 一闪而过的提示孩子根本来不及看到，家长事后也无从判断是设备问题还是没点中
  const handle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return; // 播放/加载中防重复点击
    const isSingleWord = !/\s/.test(text.trim());
    if (isSingleWord) {
      // 单词：真人录音优先，内部自动回退 TTS
      setPhase("loading");
      await speakWord(text, (p) => setPhase(p === "done" ? "idle" : p));
    } else {
      // 例句等长文本：TTS
      setPhase("playing");
      const spoke = await speakAsync(text, 0.92);
      setPhase(spoke ? "idle" : "unavailable");
    }
  };

  return (
    <button
      aria-label="播放发音"
      title={phase === "unavailable" ? "这台设备暂时发不出声音" : undefined}
      disabled={busy}
      onClick={handle}
      className={cn(
        "clip-card-sm inline-flex shrink-0 items-center justify-center border bg-val-panel2 transition-colors",
        phase === "unavailable"
          ? "border-val-gold/60 text-val-gold"
          : "border-val-line text-val-teal",
        busy ? "cursor-wait opacity-90" : "hover:border-val-teal active:bg-val-teal active:text-val-bg",
        dims,
        className
      )}
    >
      {phase === "loading" ? (
        <span className="val-spinner" aria-hidden />
      ) : phase === "playing" ? (
        <span className="anim-flame" aria-hidden>📢</span>
      ) : phase === "unavailable" ? (
        <span aria-hidden>🔇</span>
      ) : (
        "🔊"
      )}
    </button>
  );
}

/* 任务状态徽标 */
export function StatusTag({ done, partial }: { done: boolean; partial?: boolean }) {
  if (done)
    return (
      <span className="clip-tag val-title bg-val-teal/15 px-2 py-0.5 text-[10px] text-val-teal border border-val-teal/40">
        ✓ 已完成
      </span>
    );
  if (partial)
    return (
      <span className="clip-tag val-title bg-val-gold/15 px-2 py-0.5 text-[10px] text-val-gold border border-val-gold/40">
        ◐ 进行中
      </span>
    );
  return (
    <span className="clip-tag val-title bg-val-panel2 px-2 py-0.5 text-[10px] text-val-dim border border-val-line">
      ○ 未开始
    </span>
  );
}
