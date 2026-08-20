import { useCallback, useEffect, useRef, useState } from "react";
import type { Passage, SaveState, Word } from "@/types";
import { loadReading, loadVocab } from "@/lib/data";
import {
  ensureDayRecord,
  gradeWord,
  isDayAllDone,
  loadSave,
  persist,
  recountMastered,
  todayStr,
  badgeHelpers,
  XP,
  migrateXpRate,
} from "@/lib/storage";
import { applyRewards, type AgentDef, type BadgeDef, type PeakDef, type RankDef } from "@/lib/game";
import {
  downloadSave,
  markAdoptedCloud,
  markInitialSyncSettled,
  scheduleUpload,
  uploadNow,
} from "@/lib/cloud";
import { mergeSaves } from "@/lib/merge";
import { TopBar } from "@/components/TopBar";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { PeakUpOverlay, RankUpOverlay, UnlockToasts } from "@/components/Celebrations";
import { HomePage, type MissionKind } from "@/pages/Home";
import { StudyPage, type GradeResult } from "@/pages/Study";
import { QuizPage } from "@/pages/Quiz";
import { ReadingPage } from "@/pages/Reading";
import { ProfilePage } from "@/pages/Profile";

/** 把任务 XP 记入当日记录（家长看板 14 天图用） */
function addDayXp(save: SaveState, date: string, amount: number): SaveState {
  const rec = save.daily[date];
  if (!rec || amount <= 0) return save;
  return { ...save, daily: { ...save.daily, [date]: { ...rec, xp: (rec.xp ?? 0) + amount } } };
}

/** 每日全任务完成奖励，计一次完美行动日。分值统一在 storage.ts 的 XP 常量里 */
function withDailyBonus(save: SaveState, date: string): { save: SaveState; bonusXp: number } {
  const rec = save.daily[date];
  if (!rec || rec.bonusGiven || !isDayAllDone(rec)) return { save, bonusXp: 0 };
  return {
    save: {
      ...save,
      daily: { ...save.daily, [date]: { ...rec, bonusGiven: true } },
      stats: { ...save.stats, perfectDays: save.stats.perfectDays + 1 },
    },
    bonusXp: XP.dailyBonus,
  };
}

export default function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  const [tab, setTab] = useState<TabId>("home");
  const [vocab, setVocab] = useState<Word[] | null>(null);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [rankUp, setRankUp] = useState<RankDef | null>(null);
  const [peakUp, setPeakUp] = useState<PeakDef | null>(null);
  const [toasts, setToasts] = useState<{ badges: BadgeDef[]; agents: AgentDef[] }>({
    badges: [],
    agents: [],
  });

  const saveRef = useRef(save);
  saveRef.current = save;

  // 本地保存 + 云端防抖上传（3s）；失败静默，不影响学习
  useEffect(() => {
    persist(save);
    scheduleUpload(() => saveRef.current);
  }, [save]);

  useEffect(() => {
    loadVocab().then(setVocab).catch(console.error);
    loadReading().then(setPassages).catch(console.error);
  }, []);

  // 启动时云端恢复：云端 updated_at 比本地同步点新 → 采用云端（换设备/清缓存恢复）；
  // 从未同步过的老存档用 XP 对比防止误覆盖本地进度
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const row = await downloadSave();
        if (cancelled || !row) return;
        const cloud = row.data as SaveState | null;
        if (!cloud || cloud.version !== 1) return;
        // 先把云端存档补差到统一费率再合并。本机存档在 loadSave 时已经补过，
        // 若直接合并未迁移的云端存档，取 max 拿到的会是旧费率的低分。
        const cloudMigrated = migrateXpRate(cloud);
        // 云端返回的已是各设备存档的合并结果，这里再与本机存档取并。
        // 相比原先"比时间戳决定是否整份覆盖"，合并不会丢任何一侧的进度，
        // 也不再受设备时钟偏差影响。
        setSave((prev) => mergeSaves([prev, cloudMigrated]) ?? prev);
        markAdoptedCloud(row.updated_at);
      } finally {
        // 无论成功失败都要放行上传，否则存档永远传不上去
        markInitialSyncSettled();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 数据就绪后生成今日任务记录
  useEffect(() => {
    if (!vocab) return;
    setSave((prev) => ensureDayRecord(prev, todayStr(), vocab.length).save);
  }, [vocab]);

  const commit = useCallback((next: SaveState, xp = 0) => {
    const fx = applyRewards(next, xp, badgeHelpers(next));
    setSave(fx.save);
    if (fx.rankUp) setRankUp(fx.rankUp);
    if (fx.peakUp) setPeakUp(fx.peakUp);
    if (fx.newBadges.length || fx.newAgents.length)
      setToasts((t) => ({ badges: [...t.badges, ...fx.newBadges], agents: [...t.agents, ...fx.newAgents] }));
    void uploadNow(() => fx.save); // 任务完成立即上传（不等防抖）
  }, []);

  // 解锁提示 5 秒自动消失
  useEffect(() => {
    if (toasts.badges.length === 0 && toasts.agents.length === 0) return;
    const t = setTimeout(() => setToasts({ badges: [], agents: [] }), 5000);
    return () => clearTimeout(t);
  }, [toasts]);

  /* ================= 任务完成回调 ================= */

  const finishNewTask = (results: GradeResult[]) => {
    const today = todayStr();
    const rec = save.daily[today];
    if (!rec) return;
    const words = { ...save.words };
    let newCount = 0;
    let known = 0;
    for (const r of results) {
      if (!words[r.word]) newCount++;
      if (r.known) known++;
      words[r.word] = gradeWord(words[r.word], r.known, today);
    }
    const lastIdx = rec.newTask.idxs[rec.newTask.idxs.length - 1];
    let next: SaveState = {
      ...save,
      words,
      wordCursor: lastIdx !== undefined ? Math.max(save.wordCursor, lastIdx + 1) : save.wordCursor,
      stats: {
        ...save.stats,
        wordsLearned: save.stats.wordsLearned + newCount,
        masteredCount: recountMastered(words),
      },
      daily: {
        ...save.daily,
        [today]: { ...rec, newTask: { ...rec.newTask, done: true, known } },
      },
    };
    const taskXp = known * XP.wordPerKnown + XP.wordBase;
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(addDayXp(withBonus, today, taskXp + bonusXp), taskXp + bonusXp);
  };

  const finishReviewTask = (results: GradeResult[]) => {
    const today = todayStr();
    const rec = save.daily[today];
    if (!rec) return;
    const words = { ...save.words };
    let known = 0;
    for (const r of results) {
      if (r.known) known++;
      words[r.word] = gradeWord(words[r.word], r.known, today);
    }
    const masteredNow = recountMastered(words);
    const newlyMastered = Math.max(0, masteredNow - save.stats.masteredCount);
    const next: SaveState = {
      ...save,
      words,
      stats: { ...save.stats, masteredCount: masteredNow },
      daily: {
        ...save.daily,
        [today]: { ...rec, reviewTask: { ...rec.reviewTask, done: true, known } },
      },
    };
    const taskXp =
      known * XP.reviewPerKnown +
      XP.wordBase +
      XP.reviewClearBonus +
      newlyMastered * XP.masteredBonus;
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(addDayXp(withBonus, today, taskXp + bonusXp), taskXp + bonusXp);
  };

  const finishQuiz = (score: number, total: number, bestCombo: number) => {
    const today = todayStr();
    const rec = save.daily[today];
    const perfect = score === total && total > 0;
    const next: SaveState = {
      ...save,
      stats: {
        ...save.stats,
        quizzesTaken: save.stats.quizzesTaken + 1,
        perfectQuizzes: save.stats.perfectQuizzes + (perfect ? 1 : 0),
        bestCombo: Math.max(save.stats.bestCombo, bestCombo),
        quizQuestions: save.stats.quizQuestions + total,
        quizCorrect: save.stats.quizCorrect + score,
      },
      daily: rec
        ? {
            ...save.daily,
            [today]: rec.quizTask.done
              ? rec
              : { ...rec, quizTask: { ...rec.quizTask, done: true, score, total } },
          }
        : save.daily,
    };
    const taskXp = score * XP.quizPerCorrect + (perfect ? XP.quizPerfect : 0);
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(addDayXp(withBonus, today, taskXp + bonusXp), taskXp + bonusXp);
  };

  const finishReading = (passageId: number, correct: number, total: number) => {
    const today = todayStr();
    const rec = save.daily[today];
    const perfect = correct === total && total > 0;
    const next: SaveState = {
      ...save,
      stats: {
        ...save.stats,
        readingsDone: save.stats.readingsDone + 1,
        readingsPerfect: save.stats.readingsPerfect + (perfect ? 1 : 0),
        readingCorrect: (save.stats.readingCorrect ?? 0) + correct,
      },
      daily: rec
        ? {
            ...save.daily,
            [today]: rec.readingTask.done
              ? rec
              : { ...rec, readingTask: { passageId, done: true, correct, total } },
          }
        : save.daily,
    };
    const taskXp = correct * XP.readPerCorrect + XP.readBase + (perfect ? XP.readPerfect : 0);
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(addDayXp(withBonus, today, taskXp + bonusXp), taskXp + bonusXp);
  };

  const onLaunch = (kind: MissionKind) => {
    setTab(kind === "new" || kind === "review" ? "study" : kind === "quiz" ? "quiz" : "reading");
  };

  const selectAgent = (id: string) => {
    commit({ ...save, agents: { ...save.agents, current: id } });
  };

  /* ================= 渲染 ================= */

  const loading = !vocab || !passages;

  return (
    <div className="min-h-screen bg-val-bg bg-grid pb-24">
      <TopBar save={save} />
      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-5">
        {loading ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
            <p className="anim-flame text-3xl">📻</p>
            <p className="val-title text-xs tracking-[0.3em] text-val-dim">
              ESTABLISHING UPLINK // 正在加载战术数据…
            </p>
          </div>
        ) : (
          <>
            {tab === "home" && <HomePage save={save} totalWords={vocab.length} onLaunch={onLaunch} />}
            {tab === "study" && (
              <StudyPage
                save={save}
                vocab={vocab}
                onFinishNew={finishNewTask}
                onFinishReview={finishReviewTask}
                onExit={() => setTab("home")}
              />
            )}
            {tab === "quiz" && (
              <QuizPage save={save} vocab={vocab} onFinish={finishQuiz} onExit={() => setTab("home")} />
            )}
            {tab === "reading" && (
              <ReadingPage
                save={save}
                passages={passages}
                onFinish={finishReading}
                onExit={() => setTab("home")}
              />
            )}
            {tab === "profile" && (
              <ProfilePage save={save} totalWords={vocab.length} onSelectAgent={selectAgent} />
            )}
          </>
        )}
      </main>
      <BottomNav tab={tab} onChange={setTab} />
      {rankUp && <RankUpOverlay rank={rankUp} onClose={() => setRankUp(null)} />}
      {!rankUp && peakUp && <PeakUpOverlay peak={peakUp} onClose={() => setPeakUp(null)} />}
      <UnlockToasts
        badges={toasts.badges}
        agents={toasts.agents}
        onDismiss={() => setToasts({ badges: [], agents: [] })}
      />
    </div>
  );
}
