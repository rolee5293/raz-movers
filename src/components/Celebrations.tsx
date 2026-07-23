import type { AgentDef, BadgeDef, RankDef } from "@/lib/game";
import { ValButton } from "@/components/ValBits";

/** 段位晋升全屏动画 */
export function RankUpOverlay({ rank, onClose }: { rank: RankDef; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 bg-grid px-6">
      <p className="val-title mb-6 text-sm tracking-[0.4em] text-val-red text-glow-red anim-fade-up">
        RANK UP // 段位晋升
      </p>
      <div className="relative flex h-48 w-48 items-center justify-center">
        <span
          className="anim-rankup-ring absolute inset-0 rotate-45 border-4"
          style={{ borderColor: rank.color }}
        />
        <span
          className="anim-rankup-ring absolute inset-4 rotate-45 border-2"
          style={{ borderColor: rank.color, animationDelay: "0.3s" }}
        />
        <div
          className="anim-rankup-in clip-card flex h-36 w-36 rotate-45 items-center justify-center border-4 bg-val-panel"
          style={{ borderColor: rank.color, boxShadow: `0 0 60px ${rank.color}88` }}
        >
          <div className="-rotate-45 text-center">
            <div className="text-4xl font-black" style={{ color: rank.color }}>
              {rank.tier.slice(0, 1)}
            </div>
            <div className="val-title text-lg" style={{ color: rank.color }}>
              {"I".repeat(rank.sub)}
            </div>
          </div>
        </div>
      </div>
      <h1
        className="val-title anim-fade-up mt-8 text-3xl font-black"
        style={{ color: rank.color, animationDelay: "0.35s", textShadow: `0 0 24px ${rank.color}` }}
      >
        {rank.name}
      </h1>
      <p className="val-title anim-fade-up mt-1 text-lg text-val-text" style={{ animationDelay: "0.45s" }}>
        {rank.cnName}
      </p>
      <p className="anim-fade-up mt-3 text-xs text-val-dim" style={{ animationDelay: "0.55s" }}>
        特工，你的实力已获得指挥部认可。继续执行任务！
      </p>
      <div className="anim-fade-up mt-8" style={{ animationDelay: "0.7s" }}>
        <ValButton onClick={onClose} className="px-10">
          确认 // CONFIRM
        </ValButton>
      </div>
    </div>
  );
}

/** 勋章 / 特工解锁提示条（底部弹出，自动消失） */
export function UnlockToasts({
  badges,
  agents,
  onDismiss,
}: {
  badges: BadgeDef[];
  agents: AgentDef[];
  onDismiss: () => void;
}) {
  if (badges.length === 0 && agents.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4">
      {badges.map((b) => (
        <div
          key={b.id}
          className="anim-slide-in clip-card pointer-events-auto flex w-full max-w-sm items-center gap-3 border border-val-gold/60 bg-val-panel px-4 py-3"
        >
          <span className="text-2xl">{b.icon}</span>
          <div className="flex-1">
            <p className="val-title text-[10px] tracking-[0.3em] text-val-gold">BADGE UNLOCKED</p>
            <p className="val-title text-sm text-val-text">
              {b.name} <span className="text-val-dim">// {b.en}</span>
            </p>
          </div>
          <button onClick={onDismiss} className="min-h-[44px] min-w-[44px] text-val-dim">
            ✕
          </button>
        </div>
      ))}
      {agents.map((a) => (
        <div
          key={a.id}
          className="anim-slide-in clip-card pointer-events-auto flex w-full max-w-sm items-center gap-3 border px-4 py-3 bg-val-panel"
          style={{ borderColor: `${a.color}99` }}
        >
          <span className="text-2xl">{a.emoji}</span>
          <div className="flex-1">
            <p className="val-title text-[10px] tracking-[0.3em]" style={{ color: a.color }}>
              AGENT UNLOCKED
            </p>
            <p className="val-title text-sm text-val-text">
              {a.codename} <span className="text-val-dim">// {a.role}</span>
            </p>
          </div>
          <button onClick={onDismiss} className="min-h-[44px] min-w-[44px] text-val-dim">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
