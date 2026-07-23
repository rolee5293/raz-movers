import { useEffect, useState } from "react";
import { AGENTS, rankForXp } from "@/lib/game";
import { onCloudState, type CloudState } from "@/lib/cloud";
import { streakInfo } from "@/lib/storage";
import type { SaveState } from "@/types";
import { RankChip, XpBar } from "@/components/ValBits";

const DOT: Record<CloudState, { color: string; title: string }> = {
  idle: { color: "#5A6068", title: "未同步" },
  syncing: { color: "#FFC24B", title: "同步中…" },
  ok: { color: "#3DDB9A", title: "已同步到云端" },
  error: { color: "#FF4655", title: "离线，进度仅保存在本机" },
};

/** 云同步状态小圆点（灰=未同步/黄=同步中/绿=已同步/红=离线失败） */
function CloudDot() {
  const [s, setS] = useState<CloudState>("idle");
  useEffect(() => onCloudState(setS), []);
  return (
    <span
      title={DOT[s].title}
      aria-label={DOT[s].title}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{
        background: DOT[s].color,
        boxShadow: s === "syncing" || s === "ok" ? `0 0 6px ${DOT[s].color}` : "none",
      }}
    />
  );
}

export function TopBar({ save }: { save: SaveState }) {
  const rank = rankForXp(save.xp);
  const agent = AGENTS.find((a) => a.id === save.agents.current) ?? AGENTS[0];
  const streak = streakInfo(save).current;
  return (
    <header className="sticky top-0 z-30 border-b border-val-line bg-val-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
        <div
          className="clip-card-sm flex h-11 w-11 shrink-0 items-center justify-center border text-2xl"
          style={{ borderColor: `${agent.color}88`, background: `${agent.color}18` }}
        >
          {agent.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CloudDot />
            <span className="val-title truncate text-xs text-val-text">{agent.codename}</span>
            <RankChip rank={rank} size="sm" />
          </div>
          <div className="mt-1">
            <XpBar rank={rank} xp={save.xp} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <span className={streak > 0 ? "anim-flame text-xl" : "text-xl grayscale opacity-50"}>🔥</span>
          <span className="val-title text-[10px] text-val-gold">{streak} 天</span>
        </div>
      </div>
    </header>
  );
}
