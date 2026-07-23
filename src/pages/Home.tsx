import { useMemo, useState } from "react";
import type { DayRecord, SaveState } from "@/types";
import { addDaysStr, isDayAllDone, todayStr } from "@/lib/storage";
import { SectionHeader, StatusTag, ValButton } from "@/components/ValBits";
import { cn } from "@/lib/utils";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** 当前 streak 覆盖的日期集合（用于日历上的 🔥 标记） */
function streakDates(save: SaveState): Set<string> {
  const set = new Set<string>();
  const today = todayStr();
  let cursor = isDayAllDone(save.daily[today]) ? today : addDaysStr(today, -1);
  while (isDayAllDone(save.daily[cursor])) {
    set.add(cursor);
    cursor = addDaysStr(cursor, -1);
  }
  return set;
}

export function Calendar({
  save,
  selected,
  onSelect,
}: {
  save: SaveState;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const today = todayStr();
  const [cursor, setCursor] = useState(() => new Date());
  const flames = useMemo(() => streakDates(save), [save]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // 周一起始
    const arr: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < offset; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push({ date: todayStr(new Date(cursor.getFullYear(), cursor.getMonth(), d)), day: d });
    }
    return arr;
  }, [cursor]);

  const move = (delta: number) => {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
  };
  const canGoNext = monthKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) <= monthKey(new Date());

  return (
    <div className="p-2.5 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => move(-1)}
          className="clip-card-sm flex h-12 w-12 items-center justify-center border border-val-line text-lg text-val-dim hover:border-val-red hover:text-val-red"
          aria-label="上个月"
        >
          ◀
        </button>
        <p className="val-title text-sm text-val-text">
          {cursor.getFullYear()} / {String(cursor.getMonth() + 1).padStart(2, "0")}
          <span className="ml-2 text-[10px] text-val-dim">OPS CALENDAR</span>
        </p>
        <button
          onClick={() => move(1)}
          disabled={!canGoNext}
          className="clip-card-sm flex h-12 w-12 items-center justify-center border border-val-line text-lg text-val-dim hover:border-val-red hover:text-val-red disabled:opacity-30"
          aria-label="下个月"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-val-dim">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <div key={d} className="val-title py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={`e${i}`} />;
          const rec: DayRecord | undefined = save.daily[c.date];
          const isFuture = c.date > today;
          const isToday = c.date === today;
          const allDone = isDayAllDone(rec);
          const partial =
            !allDone &&
            !!rec &&
            (rec.newTask.done || rec.reviewTask.done || rec.quizTask.done || rec.readingTask.done);
          return (
            <button
              key={c.date}
              onClick={() => onSelect(c.date)}
              className={cn(
                "clip-card-sm relative flex min-h-[44px] flex-col items-center justify-center border transition-colors md:min-h-[56px]",
                isToday
                  ? "border-val-red bg-val-red/15"
                  : selected === c.date
                    ? "border-val-teal/70 bg-val-teal/10"
                    : isFuture
                      ? "border-val-line/40"
                      : "border-val-line/70 active:border-val-red/60"
              )}
            >
              {flames.has(c.date) && (
                <span className="absolute right-0.5 top-0 text-[9px] leading-none">🔥</span>
              )}
              <span
                className={cn(
                  "val-title text-sm md:text-base",
                  isToday ? "text-val-red" : isFuture ? "text-val-dim/40" : "text-val-text"
                )}
              >
                {c.day}
              </span>
              <span className="mt-0.5 text-[10px] leading-none">
                {allDone ? (
                  <span className="text-val-red">✓</span>
                ) : partial ? (
                  <span className="text-val-gold">◐</span>
                ) : isFuture ? (
                  <span className="text-val-dim/30">·</span>
                ) : (
                  <span className="text-val-dim/60">○</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type MissionKind = "new" | "review" | "quiz" | "reading";

interface Mission {
  kind: MissionKind;
  icon: string;
  title: string;
  en: string;
  desc: string;
  done: boolean;
}

function missionsOf(rec: DayRecord): Mission[] {
  return [
    {
      kind: "new",
      icon: "🃏",
      title: "新词学习",
      en: "INTEL",
      desc: rec.newTask.idxs.length > 0 ? `${rec.newTask.idxs.length} 个新单词` : "无新词",
      done: rec.newTask.done,
    },
    {
      kind: "review",
      icon: "🔁",
      title: "战术复习",
      en: "REVIEW",
      desc: rec.reviewTask.words.length > 0 ? `${rec.reviewTask.words.length} 词到期` : "无到期",
      done: rec.reviewTask.done,
    },
    {
      kind: "quiz",
      icon: "🎯",
      title: "靶场测验",
      en: "QUIZ",
      desc: rec.quizTask.locked
        ? "先学新词"
        : rec.quizTask.done
          ? `${rec.quizTask.score}/${rec.quizTask.total} 命中`
          : "5 题混合",
      done: rec.quizTask.done,
    },
    {
      kind: "reading",
      icon: "📡",
      title: "阅读理解",
      en: "READ",
      desc: rec.readingTask.done ? `${rec.readingTask.correct}/${rec.readingTask.total} 正确` : "1 篇简报",
      done: rec.readingTask.done,
    },
  ];
}

/** 今日行动面板 —— 首屏最显眼位置，大按钮直接开始 */
function TodayPanel({ save, onLaunch }: { save: SaveState; onLaunch: (k: MissionKind) => void }) {
  const today = todayStr();
  const rec = save.daily[today];
  if (!rec) return null;
  const missions = missionsOf(rec);
  const next: Mission | undefined = missions.find((m) => !m.done);
  const allDone = isDayAllDone(rec);

  return (
    <div className="clip-card border-2 border-val-red/70 bg-gradient-to-b from-val-red/15 to-val-panel">
      <div className="bg-stripes p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="val-title text-[10px] tracking-[0.35em] text-val-red">RAZ MOVERS // 阅读特工队</p>
            <h2 className="val-title mt-0.5 text-lg text-val-text">今日行动 // {today.slice(5)}</h2>
          </div>
          {allDone ? (
            <span className="val-title text-xs text-val-teal">ALL CLEAR ✓</span>
          ) : (
            <span className="val-title text-xs text-val-gold">
              {missions.filter((m) => m.done).length}/4
            </span>
          )}
        </div>

        {/* 紧凑任务行 */}
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {missions.map((m) => (
            <button
              key={m.kind}
              onClick={() => onLaunch(m.kind)}
              className={cn(
                "clip-card-sm flex min-h-[52px] items-center gap-2 border px-2.5 py-1.5 text-left transition-colors",
                m.done ? "border-val-teal/40 bg-val-teal/5" : "border-val-line bg-val-panel2 active:border-val-red"
              )}
            >
              <span className="text-lg">{m.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="val-title block truncate text-[11px] text-val-text">{m.title}</span>
                <span className="block truncate text-[9px] text-val-dim">{m.desc}</span>
              </span>
              <span className={cn("text-xs", m.done ? "text-val-teal" : "text-val-dim/50")}>
                {m.done ? "✓" : "○"}
              </span>
            </button>
          ))}
        </div>

        {/* 大按钮：直接开始下一个未完成任务 */}
        {allDone ? (
          <div className="clip-btn mt-3 bg-val-teal/15 border border-val-teal/50 px-4 py-3 text-center">
            <p className="val-title text-sm text-val-teal">★ 今日行动全部完成，特工！明天见 ★</p>
          </div>
        ) : (
          <button
            onClick={() => next && onLaunch(next.kind)}
            className="clip-btn val-title mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 bg-val-red text-base text-white transition-colors active:bg-val-red2"
          >
            ▸ 开始行动：{next?.title} // DEPLOY
          </button>
        )}
        {!allDone && (
          <p className="mt-2 text-center text-[10px] text-val-dim">
            全清 4 项任务 +20 XP · 计入连续打卡 🔥
          </p>
        )}
      </div>
    </div>
  );
}

/** 非今日日期的任务记录面板 */
export function DayMissions({
  save,
  date,
}: {
  save: SaveState;
  date: string;
}) {
  const today = todayStr();
  const rec = save.daily[date];
  const isFuture = date > today;

  return (
    <div className="clip-card border border-val-line bg-val-panel p-4">
      <SectionHeader
        title={`行动记录 // ${date}`}
        right={rec && isDayAllDone(rec) ? <span className="val-title text-[10px] text-val-teal">ALL CLEAR ✓</span> : undefined}
      />
      {isFuture ? (
        <p className="py-4 text-center text-sm text-val-dim">🔒 该区域尚未解锁 —— 未来的任务到时才会下达。</p>
      ) : !rec ? (
        <p className="py-4 text-center text-sm text-val-dim">这一天没有行动记录。</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {missionsOf(rec).map((m) => (
            <div
              key={m.kind}
              className={cn(
                "clip-card-sm flex min-h-[56px] items-center gap-3 border p-3",
                m.done ? "border-val-teal/40 bg-val-teal/5" : "border-val-line bg-val-panel2"
              )}
            >
              <span className="text-xl">{m.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="val-title block text-xs text-val-text">
                  {m.title} <span className="text-[9px] text-val-dim">// {m.en}</span>
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-val-dim">{m.desc}</span>
              </span>
              <StatusTag done={m.done} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HomePage({
  save,
  totalWords,
  onLaunch,
}: {
  save: SaveState;
  totalWords: number;
  onLaunch: (kind: MissionKind) => void;
}) {
  const [selected, setSelected] = useState(todayStr());
  const [calOpen, setCalOpen] = useState(false); // 手机端默认收起，md+ 始终展开
  const learned = save.wordCursor;
  const pct = totalWords > 0 ? Math.round((learned / totalWords) * 100) : 0;
  const isToday = selected === todayStr();

  return (
    <div className="space-y-3">
      {/* 1. 今日行动 —— 首屏最显眼 */}
      <TodayPanel save={save} onLaunch={onLaunch} />

      {/* 2. 总进度条（紧凑） */}
      <div className="clip-card border border-val-line bg-val-panel px-3 py-2.5">
        <div className="flex items-center justify-between text-[10px] text-val-dim">
          <span className="val-title tracking-[0.25em]">MISSION PROGRESS</span>
          <span>
            已部署 {learned}/{totalWords} 词 · {pct}%
          </span>
        </div>
        <div className="clip-tag mt-1.5 h-1.5 w-full bg-val-panel2">
          <div
            className="h-full bg-gradient-to-r from-val-teal to-val-red transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 3. 日历：手机端可折叠面板，平板完整展示 */}
      <div className="clip-card border border-val-line bg-val-panel">
        <button
          onClick={() => setCalOpen(!calOpen)}
          className="val-title flex min-h-[48px] w-full items-center justify-between px-3 text-xs text-val-text md:hidden"
        >
          <span className="flex items-center gap-2">
            <span className="inline-block h-4 w-1 bg-val-red" />
            📅 行动日历 // OPS CALENDAR
          </span>
          <span className="text-val-red">{calOpen ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        <div className={cn(calOpen ? "block" : "hidden", "md:block")}>
          <Calendar
            save={save}
            selected={selected}
            onSelect={(d) => {
              setSelected(d);
              if (d !== todayStr()) setCalOpen(false); // 选了历史日期后收起日历，直接看记录
            }}
          />
        </div>
      </div>

      {/* 4. 选中的非今日日期详情 */}
      {!isToday && (
        <>
          <DayMissions save={save} date={selected} />
          <ValButton variant="ghost" className="w-full" onClick={() => setSelected(todayStr())}>
            返回今日 // BACK TO TODAY
          </ValButton>
        </>
      )}
    </div>
  );
}
