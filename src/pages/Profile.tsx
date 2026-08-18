import { AGENTS, BADGES, PEAKS, peakLevel, peakMet, rankForXp } from "@/lib/game";
import { badgeHelpers, streakInfo } from "@/lib/storage";
import type { SaveState } from "@/types";
import { PeakChip, RankChip, SectionHeader } from "@/components/ValBits";
import { cn } from "@/lib/utils";

export function ProfilePage({
  save,
  totalWords,
  onSelectAgent,
}: {
  save: SaveState;
  totalWords: number;
  onSelectAgent: (id: string) => void;
}) {
  const rank = rankForXp(save.xp);
  const streak = streakInfo(save);
  const s = save.stats;
  const helpers = badgeHelpers(save);
  const peak = peakLevel(save, helpers);

  const statItems = [
    { label: "总 XP", value: save.xp, icon: "⚡" },
    { label: "当前 streak", value: `${streak.current} 天`, icon: "🔥" },
    { label: "最长 streak", value: `${streak.max} 天`, icon: "🏔️" },
    { label: "已学单词", value: `${save.wordCursor}/${totalWords}`, icon: "📚" },
    { label: "已掌握", value: s.masteredCount, icon: "🗡️" },
    { label: "完美行动日", value: s.perfectDays, icon: "🌟" },
    { label: "测验场次", value: s.quizzesTaken, icon: "🎯" },
    { label: "测验满分", value: s.perfectQuizzes, icon: "🏆" },
    { label: "最高连击", value: `x${s.bestCombo}`, icon: "💥" },
    { label: "阅读完成", value: `${s.readingsDone}/41`, icon: "📡" },
    { label: "阅读全对", value: s.readingsPerfect, icon: "🎓" },
    { label: "勋章", value: `${save.badges.length}/${BADGES.length}`, icon: "🏅" },
  ];

  return (
    <div className="space-y-5">
      {/* 段位总览 */}
      <div className="clip-card border border-val-line bg-val-panel bg-stripes p-5 text-center">
        <p className="val-title text-[10px] tracking-[0.35em] text-val-dim">SERVICE RECORD // 战绩档案</p>
        <div
          className="mx-auto mt-4 flex h-24 w-24 rotate-45 items-center justify-center border-4 bg-val-bg"
          style={{ borderColor: rank.color, boxShadow: `0 0 30px ${rank.color}55` }}
        >
          <span className="-rotate-45 text-3xl font-black" style={{ color: rank.color }}>
            {rank.tier[0]}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <RankChip rank={rank} />
          <PeakChip level={peak} />
        </div>
        <p className="mt-1 text-[11px] text-val-dim">
          {rank.nextXp !== null ? `下一阶还需 ${rank.nextXp - save.xp} XP` : "段位已满级，转入巅峰层"}
        </p>
      </div>

      {/* 巅峰层：满级之后的目标。每级要 XP 与挑战同时达成，且逐级解锁 */}
      <div>
        <SectionHeader title="巅峰层 // ASCENSION" />
        <div className="space-y-1.5">
          {PEAKS.map((def) => {
            const { cur, need } = def.progress(save, helpers);
            const done = peakMet(def, save, helpers);
            const unlocked = def.level <= peak;
            const isNext = def.level === peak + 1;
            return (
              <div
                key={def.level}
                className={cn(
                  "clip-card flex items-center gap-3 border p-2.5",
                  unlocked
                    ? "border-val-gold/60 bg-val-gold/10"
                    : isNext
                      ? "border-val-red/60 bg-val-panel"
                      : "border-val-line bg-val-panel opacity-60",
                )}
              >
                <span className="val-title w-14 shrink-0 text-[11px] text-val-dim">巅峰 {def.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="val-title truncate text-xs text-val-text">
                    {unlocked ? "👑 " : isNext ? "▶ " : "🔒 "}
                    {def.name} · {def.en}
                  </p>
                  <p className="truncate text-[10px] text-val-dim">{def.challenge}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("val-title text-[11px]", done ? "text-val-teal" : "text-val-dim")}>
                    {cur}/{need}
                  </p>
                  <p className="text-[9px] text-val-dim">
                    {save.xp >= def.minXp ? "XP ✓" : `XP ${def.minXp}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 统计 */}
      <div>
        <SectionHeader title="作战统计 // STATS" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {statItems.map((it) => (
            <div key={it.label} className="clip-card-sm border border-val-line bg-val-panel p-3 text-center">
              <p className="text-lg">{it.icon}</p>
              <p className="val-title mt-0.5 truncate text-sm text-val-text">{it.value}</p>
              <p className="text-[9px] text-val-dim">{it.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 勋章墙 */}
      <div>
        <SectionHeader
          title="勋章墙 // BADGES"
          right={
            <span className="val-title text-[10px] text-val-gold">
              {save.badges.length}/{BADGES.length}
            </span>
          }
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BADGES.map((b) => {
            const got = save.badges.includes(b.id);
            return (
              <div
                key={b.id}
                className={cn(
                  "clip-card-sm border p-3 text-center",
                  got ? "border-val-gold/60 bg-val-gold/5" : "border-val-line/50 bg-val-panel opacity-50"
                )}
              >
                <p className={cn("text-2xl", !got && "grayscale")}>{b.icon}</p>
                <p className={cn("val-title mt-1 text-[11px]", got ? "text-val-gold" : "text-val-dim")}>
                  {b.name}
                </p>
                <p className="text-[8px] uppercase tracking-wider text-val-dim">{b.en}</p>
                <p className="mt-1 text-[9px] leading-tight text-val-dim">{b.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 特工库 */}
      <div>
        <SectionHeader title="特工库 // AGENTS" />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {AGENTS.map((a) => {
            const unlocked = save.agents.unlocked.includes(a.id);
            const current = save.agents.current === a.id;
            return (
              <button
                key={a.id}
                disabled={!unlocked}
                onClick={() => onSelectAgent(a.id)}
                className={cn(
                  "clip-card-sm border p-3 text-center transition-colors",
                  current
                    ? "border-val-red bg-val-red/10"
                    : unlocked
                      ? "border-val-line bg-val-panel hover:border-val-red/60"
                      : "border-val-line/40 bg-val-panel opacity-45"
                )}
              >
                <p className={cn("text-3xl", !unlocked && "grayscale")}>{a.emoji}</p>
                <p className="val-title mt-1 text-[11px]" style={{ color: unlocked ? a.color : "#9AA5AD" }}>
                  {a.codename}
                </p>
                <p className="text-[8px] text-val-dim">{a.role}</p>
                <p className="mt-1 text-[9px] leading-tight text-val-dim">
                  {unlocked ? (current ? "▸ 出战中" : "点击出战") : `🔒 ${a.unlockDesc}`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <p className="pb-2 text-center text-[10px] text-val-dim/60">
        RAZ MOVERS v1.0 // 阅读特工队 · YLE Movers + RAZ E-G · 数据保存在本机
      </p>
    </div>
  );
}
