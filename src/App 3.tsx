import { useCallback, useEffect, useState } from "react";
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
} from "@/lib/storage";
import { applyRewards, type AgentDef, type BadgeDef, type RankDef } from "@/lib/game";
import { TopBar } from "@/components/TopBar";
import { BottomNav, type TabId } from "@/components/BottomNav";
import { RankUpOverlay, UnlockToasts } from "@/components/Celebrations";
import { HomePage, type MissionKind } from "@/pages/Home";
import { StudyPage, type GradeResult } from "@/pages/Study";
import { QuizPage } from "@/pages/Quiz";
import { ReadingPage } from "@/pages/Reading";
import { ProfilePage } from "@/pages/Profile";

/** 每日全任务完成奖励：+50 XP，计一次完美行动日 */
function withDailyBonus(save: SaveState, date: string): { save: SaveState; bonusXp: number } {
  const rec = save.daily[date];
  if (!rec || rec.bonusGiven || !isDayAllDone(rec)) return { save, bonusXp: 0 };
  return {
    save: {
      ...save,
      daily: { ...save.daily, [date]: { ...rec, bonusGiven: true } },
      stats: { ...save.stats, perfectDays: save.stats.perfectDays + 1 },
    },
    bonusXp: 50,
  };
}

export default function App() {
  const [save, setSave] = useState<SaveState>(loadSave);
  const [tab, setTab] = useState<TabId>("home");
  const [vocab, setVocab] = useState<Word[] | null>(null);
  const [passages, setPassages] = useState<Passage[] | null>(null);
  const [rankUp, setRankUp] = useState<RankDef | null>(null);
  const [toasts, setToasts] = useState<{ badges: BadgeDef[]; agents: AgentDef[] }>({
    badges: [],
    agents: [],
  });

  useEffect(() => persist(save), [save]);

  useEffect(() => {
    loadVocab().then(setVocab).catch(console.error);
    loadReading().then(setPassages).catch(console.error);
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
    if (fx.newBadges.length || fx.newAgents.length)
      setToasts((t) => ({ badges: [...t.badges, ...fx.newBadges], agents: [...t.agents, ...fx.newAgents] }));
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
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(withBonus, known * 2 + 10 + bonusXp);
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
    const next: SaveState = {
      ...save,
      words,
      stats: { ...save.stats, masteredCount: recountMastered(words) },
      daily: {
        ...save.daily,
        [today]: { ...rec, reviewTask: { ...rec.reviewTask, done: true, known } },
      },
    };
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(withBonus, known * 2 + 10 + bonusXp);
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
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(withBonus, score * 10 + (perfect ? 50 : 0) + bonusXp);
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
    const { save: withBonus, bonusXp } = withDailyBonus(next, today);
    commit(withBonus, correct * 10 + 30 + (perfect ? 30 : 0) + bonusXp);
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
      <UnlockToasts
        badges={toasts.badges}
        agents={toasts.agents}
        onDismiss={() => setToasts({ badges: [], agents: [] })}
      />
    </div>
  );
}
