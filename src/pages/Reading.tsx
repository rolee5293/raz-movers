import { useEffect, useMemo, useRef, useState } from "react";
import type { Passage, SaveState } from "@/types";
import { SectionHeader, ValButton } from "@/components/ValBits";
import { speakAsync, stopAllAudio } from "@/lib/speech";
import { cn } from "@/lib/utils";

interface Props {
  save: SaveState;
  passages: Passage[];
  onFinish: (passageId: number, correct: number, total: number) => void;
  onExit: () => void;
}

const DIFF_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "★ 入门", color: "#3DDBD9" },
  2: { label: "★★ 标准", color: "#FFC24B" },
  3: { label: "★★★ 高难", color: "#FF4655" },
};

export function ReadingPage({ save, passages, onFinish, onExit }: Props) {
  const passage: Passage | undefined = useMemo(
    () => (passages.length > 0 ? passages[save.stats.readingsDone % passages.length] : undefined),
    [passages, save.stats.readingsDone]
  );

  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showText, setShowText] = useState(true);
  const [readingAloud, setReadingAloud] = useState(false);
  const finishedRef = useRef(false);

  // 离开页面时停止朗读
  useEffect(() => () => stopAllAudio(), []);

  const toggleReadAloud = async () => {
    if (readingAloud) {
      stopAllAudio();
      setReadingAloud(false);
      return;
    }
    setReadingAloud(true);
    await speakAsync(passage?.text ?? "", 0.85); // 整篇 TTS 朗读（优质英文 voice）
    setReadingAloud(false);
  };

  const total = passage?.questions.length ?? 0;
  const correct = useMemo(
    () => (passage ? answers.filter((a, i) => a === passage.questions[i].answer).length : 0),
    [answers, passage]
  );

  useEffect(() => {
    if (submitted && !finishedRef.current && passage) {
      finishedRef.current = true;
      onFinish(passage.id, correct, total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);

  if (!passage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-val-dim">
        📡 正在接收战术简报…
      </div>
    );
  }

  const diff = DIFF_LABEL[passage.difficulty] ?? DIFF_LABEL[1];

  const pick = (optIdx: number) => {
    if (answers.length !== qIdx) return; // 已答过本题
    const next = [...answers, optIdx];
    setAnswers(next);
    if (qIdx + 1 < total) {
      setTimeout(() => setQIdx(qIdx + 1), 250);
    }
  };

  const allAnswered = answers.length === total;

  /* ---------- 交卷后：逐题解析 ---------- */
  if (submitted) {
    const perfect = correct === total;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="clip-card border border-val-line bg-val-panel bg-stripes p-6 text-center">
          <p className="val-title text-[10px] tracking-[0.4em] text-val-red">DEBRIEF // 任务复盘</p>
          <h2 className="val-title mt-2 text-3xl text-val-text">
            {correct} <span className="text-xl text-val-dim">/ {total}</span>
          </h2>
          <p className={cn("val-title mt-1 text-sm", perfect ? "text-val-gold" : "text-val-teal")}>
            {perfect ? "★ PERFECT RECON // 全对 +5 XP 奖励 ★" : `正确率 ${Math.round((correct / total) * 100)}%`}
          </p>
          <p className="mt-1 text-xs text-val-dim">获得 +{correct * 5 + 10 + (perfect ? 5 : 0)} XP</p>
          <ValButton className="mt-4 w-full" onClick={onExit}>
            返回基地 // BASE
          </ValButton>
        </div>

        {passage.questions.map((q, i) => {
          const mine = answers[i];
          const ok = mine === q.answer;
          return (
            <div
              key={i}
              className={cn(
                "clip-card border bg-val-panel p-4",
                ok ? "border-val-teal/50" : "border-val-red/60"
              )}
            >
              <p className="text-sm font-bold text-val-text">
                <span className={cn("val-title mr-2", ok ? "text-val-teal" : "text-val-red")}>
                  {ok ? "✓ HIT" : "✕ MISS"}
                </span>
                {i + 1}. {q.q}
              </p>
              <div className="mt-2 grid gap-1.5">
                {q.options.map((opt, j) => (
                  <div
                    key={j}
                    className={cn(
                      "clip-card-sm border px-3 py-2 text-xs",
                      j === q.answer
                        ? "border-val-teal/60 bg-val-teal/10 text-val-teal"
                        : j === mine
                          ? "border-val-red/60 bg-val-red/10 text-val-red"
                          : "border-val-line/50 text-val-dim"
                    )}
                  >
                    {["A", "B", "C", "D"][j]}. {opt}
                    {j === q.answer && " ✓"}
                    {j === mine && j !== q.answer && " ✕ 你的选择"}
                  </div>
                ))}
              </div>
              {q.explanation && (
                <div className="clip-card-sm mt-3 border border-val-line bg-val-bg p-3">
                  <p className="val-title text-[9px] tracking-[0.3em] text-val-gold">ANALYSIS // 解析</p>
                  <p className="mt-1 text-xs leading-relaxed text-val-text">{q.explanation}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------- 作答中 ---------- */
  const q = passage.questions[qIdx];
  return (
    <div className="mx-auto max-w-2xl">
      <div className="clip-card border border-val-line bg-val-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="clip-tag val-title px-2 py-0.5 text-[10px] border"
            style={{ color: diff.color, borderColor: `${diff.color}66`, background: `${diff.color}15` }}
          >
            {diff.label}
          </span>
          <span className="clip-tag val-title border border-val-line bg-val-panel2 px-2 py-0.5 text-[10px] text-val-dim">
            {passage.topic}
          </span>
          <span className="clip-tag val-title border border-val-line bg-val-panel2 px-2 py-0.5 text-[10px] text-val-dim">
            ~{passage.wordCount} 词
          </span>
        </div>
        <h2 className="val-title mt-2 text-lg text-val-text">{passage.title}</h2>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => setShowText(!showText)}
            className="val-title min-h-[36px] text-[10px] text-val-teal underline underline-offset-2"
          >
            {showText ? "收起正文 ▲" : "展开正文 ▼"}
          </button>
          <button
            onClick={toggleReadAloud}
            className={cn(
              "clip-tag val-title inline-flex min-h-[36px] items-center gap-1 border px-3 text-[10px]",
              readingAloud
                ? "border-val-gold/60 bg-val-gold/15 text-val-gold"
                : "border-val-line bg-val-panel2 text-val-text active:border-val-gold"
            )}
          >
            {readingAloud ? "⏹ 停止朗读" : "📖 听全文"}
          </button>
        </div>
        {showText && (
          <div className="nice-scroll mt-2 max-h-[42vh] overflow-y-auto pr-1 md:max-h-[50vh]">
            {passage.text.split("\n\n").map((para, i) => (
              <p key={i} className="mb-3 text-base leading-relaxed text-val-text/90">
                {para}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <SectionHeader
          title={`QUESTION ${qIdx + 1} / ${total}`}
          right={
            <span className="val-title text-[10px] text-val-dim">
              已答 {answers.length}/{total}
            </span>
          }
        />
        <div className="clip-tag mb-3 h-1.5 w-full bg-val-panel2">
          <div className="h-full bg-val-red transition-all" style={{ width: `${(answers.length / total) * 100}%` }} />
        </div>

        <div key={qIdx} className="anim-fade-up">
          <div className="clip-card border border-val-line bg-val-panel p-4">
            <p className="text-sm font-bold leading-snug text-val-text">{q.q}</p>
          </div>
          <div className="mt-3 grid gap-2">
            {q.options.map((opt, j) => {
              const answeredCurrent = answers.length > qIdx;
              const mine = answers[qIdx];
              return (
                <button
                  key={j}
                  disabled={answeredCurrent}
                  onClick={() => pick(j)}
                  className={cn(
                    "clip-card-sm min-h-[52px] border p-3 text-left text-sm transition-colors",
                    answeredCurrent && j === mine
                      ? "border-val-red bg-val-red/15 text-val-text"
                      : answeredCurrent
                        ? "border-val-line/50 text-val-dim/60"
                        : "border-val-line bg-val-panel2 text-val-text active:border-val-red"
                  )}
                >
                  <span className="val-title mr-2 text-val-dim">{["A", "B", "C", "D"][j]}</span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {allAnswered && (
          <ValButton className="anim-fade-up mt-4 w-full min-h-[52px] text-base" onClick={() => setSubmitted(true)}>
            交卷 // SUBMIT REPORT
          </ValButton>
        )}
      </div>
    </div>
  );
}
