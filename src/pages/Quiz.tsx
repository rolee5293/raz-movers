import { useEffect, useMemo, useRef, useState } from "react";
import type { SaveState, Word } from "@/types";
import { generateQuiz, todayStr, type QuizItem } from "@/lib/storage";
import { speakWord, unlockAudio, prefetchPron } from "@/lib/speech";
import { SectionHeader, SpeakerButton, ValButton } from "@/components/ValBits";
import { PhonicsHint } from "@/components/PhonicsHint";
import { cn } from "@/lib/utils";

interface Props {
  save: SaveState;
  vocab: Word[];
  onFinish: (score: number, total: number, bestCombo: number) => void;
  onExit: () => void;
}

type Phase = "intro" | "playing" | "feedback" | "result";

export function QuizPage({ save, vocab, onFinish, onExit }: Props) {
  const learnedPool = useMemo(() => vocab.slice(0, save.wordCursor), [vocab, save.wordCursor]);
  const [quiz, setQuiz] = useState<QuizItem[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [spellInput, setSpellInput] = useState("");
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [missed, setMissed] = useState<Word[]>([]);
  const [audioDead, setAudioDead] = useState(false);
  const finishedRef = useRef(false);

  const current: QuizItem | undefined = quiz[idx];
  const locked = learnedPool.length < 4;

  const start = () => {
    unlockAudio(); // 在真实点击的同步栈里解锁音频，听音题才能自动出声
    const q = generateQuiz(learnedPool);
    q.filter((it) => it.type === "listen").forEach((it) => prefetchPron(it.word.word));
    setQuiz(q);
    setPhase("playing");
    setIdx(0);
    setPicked(null);
    setSpellInput("");
    setCombo(0);
    setBestCombo(0);
    setScore(0);
    setLastCorrect(null);
    setMissed([]);
    finishedRef.current = false;
  };

  // 听音题自动播放（真人录音优先）；完全放不出声时要让孩子知道，
  // 否则这道题既听不到又不知道为什么，只能瞎猜
  useEffect(() => {
    if (phase === "playing" && current?.type === "listen") {
      setAudioDead(false);
      const t = setTimeout(
        () => void speakWord(current.word.word, (p) => setAudioDead(p === "unavailable")),
        350
      );
      return () => clearTimeout(t);
    }
  }, [phase, idx, current]);

  const answer = (correct: boolean, pickedIdx: number | null) => {
    if (phase !== "playing") return;
    setPicked(pickedIdx);
    setLastCorrect(correct);
    setPhase("feedback");
    if (correct) {
      const nc = combo + 1;
      setCombo(nc);
      setBestCombo((b) => Math.max(b, nc));
      setScore((s) => s + 1);
    } else {
      setCombo(0);
      setMissed((m) => [...m, current.word]);
      if (navigator.vibrate) navigator.vibrate(180);
    }
    setTimeout(() => {
      if (idx + 1 < quiz.length) {
        setIdx(idx + 1);
        setPicked(null);
        setSpellInput("");
        setLastCorrect(null);
        setPhase("playing");
      } else {
        setPhase("result");
      }
    }, correct ? 750 : 1300);
  };

  // 结算时上报一次
  useEffect(() => {
    if (phase === "result" && !finishedRef.current && quiz.length > 0) {
      finishedRef.current = true;
      onFinish(score, quiz.length, bestCombo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ---------- 入口 ---------- */
  if (phase === "intro") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <div className="clip-card w-full max-w-md border border-val-line bg-val-panel p-6 text-center">
          <p className="text-4xl">🎯</p>
          <h2 className="val-title mt-2 text-2xl text-val-text">靶场测验 // RANGE TRIAL</h2>
          <p className="mt-2 text-sm text-val-dim">
            从已学 {learnedPool.length} 词中抽 5 题：英译中 / 中译英 / 听音选词 / 拼写填空混合。
          </p>
          {save.daily[todayStr()]?.quizTask.done && (
            <p className="mt-2 text-xs text-val-teal">✓ 今日测验任务已完成，可以继续加练刷 XP。</p>
          )}
          {locked ? (
            <p className="mt-4 text-sm text-val-red">⚠ 已学词汇不足 4 个，先去完成今日新词学习。</p>
          ) : (
            <ValButton className="mt-5 w-full" onClick={start}>
              开始测验 // DEPLOY
            </ValButton>
          )}
          <ValButton variant="ghost" className="mt-2 w-full" onClick={onExit}>
            返回基地 // BASE
          </ValButton>
        </div>
      </div>
    );
  }

  /* ---------- 结算 ---------- */
  if (phase === "result") {
    const total = quiz.length;
    const pct = Math.round((score / total) * 100);
    const grade = pct === 100 ? "S" : pct >= 80 ? "A" : pct >= 60 ? "B" : "C";
    const xp = score * 8 + (score === total ? 10 : 0);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <div className="clip-card w-full max-w-md border border-val-line bg-val-panel bg-stripes p-6 text-center">
          <p className="val-title text-[10px] tracking-[0.4em] text-val-red">MATCH COMPLETE</p>
          <div
            className={cn(
              "anim-rankup-in mx-auto mt-4 flex h-28 w-28 rotate-45 items-center justify-center border-4",
              score === total ? "border-val-gold bg-val-gold/10" : "border-val-teal/70 bg-val-teal/5"
            )}
          >
            <span
              className={cn(
                "-rotate-45 text-6xl font-black",
                score === total ? "text-val-gold text-glow-red" : "text-val-teal"
              )}
            >
              {grade}
            </span>
          </div>
          <h2 className="val-title mt-5 text-3xl text-val-text">
            {score} <span className="text-val-dim text-xl">/ {total}</span>
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="clip-card-sm border border-val-line bg-val-bg p-3">
              <p className="text-xl font-black text-val-teal">{pct}%</p>
              <p className="val-title mt-0.5 text-[9px] text-val-dim">命中率</p>
            </div>
            <div className="clip-card-sm border border-val-line bg-val-bg p-3">
              <p className="text-xl font-black text-val-red">x{bestCombo}</p>
              <p className="val-title mt-0.5 text-[9px] text-val-dim">最高连击</p>
            </div>
            <div className="clip-card-sm border border-val-line bg-val-bg p-3">
              <p className="text-xl font-black text-val-gold">+{xp}</p>
              <p className="val-title mt-0.5 text-[9px] text-val-dim">XP</p>
            </div>
          </div>
          {score === total && (
            <p className="val-title anim-combo-pop mt-3 text-sm text-val-gold">★ FLAWLESS // 满分 +10 XP ★</p>
          )}

          {/* 失误复盘：错题单词 + 拼读提示 + 真人发音 */}
          {missed.length > 0 && (
            <div className="mt-4 text-left">
              <p className="val-title mb-2 text-[10px] tracking-[0.3em] text-val-red">
                MISS REPORT // 失误复盘（{missed.length}）
              </p>
              <div className="grid gap-1.5">
                {missed.map((mw) => (
                  <div
                    key={mw.idx}
                    className="clip-card-sm flex items-center gap-2 border border-val-red/40 bg-val-red/5 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-val-text">
                        {mw.word}
                        <span className="ml-2 text-xs font-normal text-val-dim">{mw.meaning}</span>
                      </p>
                      <PhonicsHint word={mw.word} className="mt-0.5 text-xs" />
                    </div>
                    <SpeakerButton text={mw.word} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <ValButton onClick={start}>再来一局</ValButton>
            <ValButton variant="ghost" onClick={onExit}>
              返回基地
            </ValButton>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const w = current.word;

  const typeLabel = {
    en2zh: "英译中 // TRANSLATE",
    zh2en: "中译英 // RECALL",
    listen: "听音选词 // INTERCEPT",
    spell: "拼写填空 // DECODE",
  }[current.type];

  return (
    <div className="mx-auto max-w-lg">
      <SectionHeader
        title={typeLabel}
        right={
          <span className="val-title text-xs text-val-dim">
            {idx + 1} / {quiz.length}
          </span>
        }
      />
      <div className="clip-tag mb-3 h-1.5 w-full bg-val-panel2">
        <div className="h-full bg-val-red transition-all" style={{ width: `${(idx / quiz.length) * 100}%` }} />
      </div>

      {/* COMBO */}
      <div className="mb-3 flex h-8 items-center justify-center">
        {combo >= 2 && (
          <span key={combo} className="anim-combo-pop val-title text-lg text-val-red text-glow-red">
            COMBO x{combo} 🔥
          </span>
        )}
      </div>

      {/* 题干 */}
      <div
        className={cn(
          "clip-card border bg-val-panel p-5 text-center transition-colors",
          phase === "feedback" && lastCorrect === true && "border-val-teal",
          phase === "feedback" && lastCorrect === false && "border-val-red anim-shake",
          phase === "playing" && "border-val-line"
        )}
      >
        {current.type === "en2zh" && (
          <>
            <div className="flex items-center justify-center gap-3">
              <h2 className="text-3xl font-black text-val-text">{w.word}</h2>
              <SpeakerButton text={w.word} />
            </div>
            {w.phonetic && <p className="mt-1 text-sm text-val-teal">/{w.phonetic}/</p>}
            <PhonicsHint word={w.word} className="mt-1 justify-center" />
          </>
        )}
        {current.type === "zh2en" && (
          <>
            {w.pos && (
              <span className="clip-tag val-title mb-2 inline-block border border-val-red/40 bg-val-red/15 px-2 py-0.5 text-xs text-val-red">
                {w.pos}
              </span>
            )}
            <h2 className="text-2xl font-bold leading-snug text-val-text">{w.meaning}</h2>
          </>
        )}
        {current.type === "listen" && (
          <div className="py-3">
            <SpeakerButton text={w.word} size="lg" className="mx-auto" />
            {audioDead ? (
              <div className="mt-3">
                <p className="text-sm text-val-gold">🔇 这台设备暂时发不出声音</p>
                <p className="mt-1 text-xs text-val-dim">
                  本题的单词是 <span className="font-bold text-val-text">{w.word}</span>，先照着选，回头让家长检查一下设备声音
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-val-dim">📻 听无线电录音，选出你听到的单词</p>
            )}
          </div>
        )}
        {current.type === "spell" && (
          <>
            <p className="text-sm text-val-dim">根据释义拼出单词（{w.word.length} 个字母）</p>
            <h2 className="mt-2 text-2xl font-bold leading-snug text-val-text">{w.meaning}</h2>
            {w.pos && <p className="mt-1 text-xs text-val-red">{w.pos}</p>}
          </>
        )}
      </div>

      {/* 选项 / 拼写 */}
      {current.type === "spell" ? (
        <div className="mt-4">
          <input
            value={spellInput}
            onChange={(e) => setSpellInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && spellInput.trim() && phase === "playing")
                answer(spellInput.trim().toLowerCase() === w.word.toLowerCase(), null);
            }}
            disabled={phase !== "playing"}
            placeholder={`首字母：${w.word[0]}…`}
            autoCapitalize="none"
            autoCorrect="off"
            className="val-input clip-card-sm min-h-[52px] w-full px-4 text-center text-2xl font-bold tracking-[0.2em]"
          />
          {phase === "feedback" && !lastCorrect && (
            <div className="anim-fade-up mt-2 text-center">
              <p className="text-lg font-black text-val-teal">正确拼写：{w.word}</p>
              <PhonicsHint word={w.word} className="mt-0.5 justify-center" />
            </div>
          )}
          <ValButton
            className="mt-3 w-full min-h-[52px]"
            disabled={!spellInput.trim() || phase !== "playing"}
            onClick={() => answer(spellInput.trim().toLowerCase() === w.word.toLowerCase(), null)}
          >
            确认 // CONFIRM
          </ValButton>
        </div>
      ) : (
        <div className="mt-4 grid gap-2">
          {current.options!.map((opt, i) => {
            const isAnswer = i === current.answer;
            const isPicked = i === picked;
            const showPhonics = current.type === "zh2en" || current.type === "listen";
            return (
              <button
                key={i}
                disabled={phase !== "playing"}
                onClick={() => answer(isAnswer, i)}
                className={cn(
                  "clip-card-sm flex min-h-[52px] items-center gap-2 border p-3 text-left text-sm transition-colors",
                  phase === "feedback" && isAnswer && "border-val-teal bg-val-teal/15 text-val-teal",
                  phase === "feedback" && isPicked && !isAnswer && "border-val-red bg-val-red/15 text-val-red anim-shake",
                  phase === "feedback" && !isAnswer && !isPicked && "border-val-line/50 text-val-dim/50",
                  phase === "playing" && "border-val-line bg-val-panel2 text-val-text active:border-val-red"
                )}
              >
                <span className="val-title shrink-0 text-val-dim">{["A", "B", "C", "D"][i]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug">{opt}</span>
                  {showPhonics && <PhonicsHint word={opt} className="mt-0.5 text-xs opacity-80" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
