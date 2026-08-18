import { useEffect, useMemo, useRef, useState } from "react";
import type { SaveState, Word } from "@/types";
import { todayStr, XP } from "@/lib/storage";
import { SectionHeader, SpeakerButton, ValButton } from "@/components/ValBits";
import { PhonicsHint } from "@/components/PhonicsHint";
import { cn } from "@/lib/utils";

export interface GradeResult {
  word: string;
  known: boolean;
}

interface Props {
  save: SaveState;
  vocab: Word[];
  onFinishNew: (results: GradeResult[]) => void;
  onFinishReview: (results: GradeResult[]) => void;
  onExit: () => void;
}

/** 词卡页：先新词（教学模式），后复习（翻面模式） */
export function StudyPage({ save, vocab, onFinishNew, onFinishReview, onExit }: Props) {
  const today = todayStr();
  const rec = save.daily[today];

  const wordMap = useMemo(() => {
    const m = new Map<string, Word>();
    for (const w of vocab) m.set(w.word, w);
    return m;
  }, [vocab]);

  const newWords: Word[] = useMemo(
    () => (rec && !rec.newTask.done ? rec.newTask.idxs.map((i) => vocab[i]).filter(Boolean) : []),
    [rec, vocab]
  );
  const reviewWords: Word[] = useMemo(
    () =>
      rec && !rec.reviewTask.done
        ? rec.reviewTask.words.map((w) => wordMap.get(w)).filter((w): w is Word => !!w)
        : [],
    [rec, wordMap]
  );

  const [phase, setPhase] = useState<"new" | "review" | "done">(
    newWords.length > 0 ? "new" : reviewWords.length > 0 ? "review" : "done"
  );
  const queue = phase === "new" ? newWords : phase === "review" ? reviewWords : [];
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showCn, setShowCn] = useState(false);
  const [results, setResults] = useState<GradeResult[]>([]);
  const [summary, setSummary] = useState<GradeResult[] | null>(null);

  const current: Word | undefined = queue[idx];
  const touchX = useRef<number | null>(null);

  // 切换卡片时重置翻面状态
  useEffect(() => {
    setFlipped(false);
    setShowCn(false);
  }, [idx, phase]);

  const grade = (known: boolean) => {
    if (!current) return;
    // 复习模式必须先翻面才能评分（新词模式直接评分）
    if (phase === "review" && !flipped) {
      setFlipped(true);
      return;
    }
    const next = [...results, { word: current.word, known }];
    setResults(next);
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
    } else {
      setSummary(next);
    }
  };

  const finishPhase = () => {
    if (!summary) return;
    if (phase === "new") {
      onFinishNew(summary);
      if (reviewWords.length > 0) {
        setPhase("review");
        setIdx(0);
        setResults([]);
        setSummary(null);
      } else {
        setPhase("done");
        setSummary(null);
      }
    } else {
      onFinishReview(summary);
      setPhase("done");
      setSummary(null);
    }
  };

  /* ---------- 完成态 ---------- */
  if (phase === "done" || !rec) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <div className="clip-card border border-val-teal/50 bg-val-panel p-8">
          <p className="text-4xl">✅</p>
          <h2 className="val-title mt-3 text-lg text-val-teal">CARDS CLEAR // 词卡任务完成</h2>
          <p className="mt-2 text-sm text-val-dim">今日的新词与复习已全部完成，去靶场测验检验一下吧。</p>
          <ValButton className="mt-5 w-full" onClick={onExit}>
            返回基地 // BASE
          </ValButton>
        </div>
      </div>
    );
  }

  /* ---------- 阶段结算 ---------- */
  if (summary) {
    const known = summary.filter((r) => r.known).length;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <div className="clip-card w-full max-w-md border border-val-line bg-val-panel p-6 text-center">
          <p className="val-title text-[10px] tracking-[0.35em] text-val-red">PHASE COMPLETE</p>
          <h2 className="val-title mt-2 text-2xl text-val-text">
            {phase === "new" ? "新词学习完成" : "复习完成"}
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="clip-card-sm border border-val-teal/40 bg-val-teal/10 p-4">
              <p className="text-3xl font-black text-val-teal">{known}</p>
              <p className="val-title mt-1 text-[10px] text-val-dim">认识了 ✓</p>
            </div>
            <div className="clip-card-sm border border-val-red/40 bg-val-red/10 p-4">
              <p className="text-3xl font-black text-val-red">{summary.length - known}</p>
              <p className="val-title mt-1 text-[10px] text-val-dim">还不熟 ✕</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-val-dim">
            获得 <span className="text-val-gold">+{known * XP.wordPerKnown + XP.wordBase} XP</span>
            {phase === "new" && reviewWords.length > 0 ? " · 接下来是今日复习" : ""}
          </p>
          <ValButton className="mt-5 w-full" onClick={finishPhase}>
            {phase === "new" && reviewWords.length > 0 ? "继续复习 // REVIEW" : "确认 // CONFIRM"}
          </ValButton>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const isNew = phase === "new";
  const gradable = isNew || flipped;

  return (
    <div className="mx-auto max-w-lg px-1">
      <SectionHeader
        title={isNew ? "新词学习 // INTEL" : "战术复习 // REVIEW"}
        right={
          <span className="val-title text-xs text-val-dim">
            {idx + 1} / {queue.length}
          </span>
        }
      />
      <div className="clip-tag mb-4 h-1.5 w-full bg-val-panel2">
        <div
          className="h-full bg-val-red transition-all duration-300"
          style={{ width: `${((idx + 1) / queue.length) * 100}%` }}
        />
      </div>

      {/* 词卡 */}
      <div
        className="flip-scene"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (!gradable && Math.abs(dx) > 50) {
            setFlipped(true);
            return;
          }
          if (dx > 70) grade(true);
          else if (dx < -70) grade(false);
        }}
      >
        <div className={cn("flip-inner min-h-[340px] sm:min-h-[380px]", flipped && "flipped")}>
          {/* 正面 —— 用 div + role 而非 button：卡片内含喇叭按钮，
              button 套 button 是无效 HTML，浏览器对内层按钮的点击行为不确定，
              可访问性树上内层按钮的名称还会被并进外层，导致点喇叭实际点到了卡片 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => (!isNew ? setFlipped(true) : setShowCn(!showCn))}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (!isNew) setFlipped(true);
              else setShowCn(!showCn);
            }}
            className="flip-face clip-card block w-full cursor-pointer border border-val-line bg-val-panel bg-stripes p-6 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="val-title text-[10px] tracking-[0.3em] text-val-dim">
                  WORD LIST {current.listId}
                </p>
                <h2 className="mt-2 break-words text-5xl font-black tracking-wide text-val-text sm:text-6xl">
                  {current.word}
                </h2>
                {current.phonetic && <p className="mt-2 text-sm text-val-teal">/{current.phonetic}/</p>}
                <PhonicsHint word={current.word} className="mt-1.5" />
              </div>
              <SpeakerButton text={current.word} size="lg" />
            </div>

            {isNew ? (
              <div className="mt-6 space-y-3">
                {current.pos && (
                  <span className="clip-tag val-title inline-block bg-val-red/15 px-2 py-0.5 text-xs text-val-red border border-val-red/40">
                    {current.pos}
                  </span>
                )}
                <p className="text-xl leading-snug text-val-text">{current.meaning}</p>
                {current.example && (
                  <div className="clip-card-sm border border-val-line bg-val-bg p-3">
                    <p className="text-sm leading-relaxed text-val-dim">{current.example}</p>
                    {showCn && <p className="anim-fade-up mt-2 text-sm text-val-teal">{current.exampleCn}</p>}
                    {!showCn && current.exampleCn && (
                      <p className="mt-2 text-[10px] text-val-dim/60">▸ 点击卡片查看例句中文</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-10 text-center">
                <p className="text-sm text-val-dim">🔄 点击卡片翻面查看释义</p>
                <p className="mt-1 text-[10px] text-val-dim/60">（也可以左右滑动评分）</p>
              </div>
            )}
          </div>

          {/* 背面（复习模式翻面后） */}
          <div className="flip-back clip-card flex w-full flex-col border border-val-teal/50 bg-val-panel p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-4xl font-black text-val-text">{current.word}</h2>
                {current.phonetic && <p className="mt-1 text-sm text-val-teal">/{current.phonetic}/</p>}
                <PhonicsHint word={current.word} className="mt-1" />
              </div>
              <SpeakerButton text={current.word} />
            </div>
            <div className="mt-4">
              {current.pos && (
                <span className="clip-tag val-title inline-block border border-val-red/40 bg-val-red/15 px-2 py-0.5 text-xs text-val-red">
                  {current.pos}
                </span>
              )}
              <p className="mt-2 text-lg text-val-text">{current.meaning}</p>
              {current.example && <p className="mt-3 text-sm text-val-dim">{current.example}</p>}
              {current.exampleCn && <p className="mt-1 text-sm text-val-teal">{current.exampleCn}</p>}
            </div>
            <p className="mt-auto pt-4 text-center text-[10px] text-val-dim">现在评分：认识 → / 不认识 ←</p>
          </div>
        </div>
      </div>

      {/* 评分按钮 */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <ValButton
          variant="danger"
          className="min-h-[60px] text-lg"
          onClick={() => (gradable ? grade(false) : setFlipped(true))}
        >
          ✕ 还不熟
        </ValButton>
        <ValButton
          variant="teal"
          className="min-h-[60px] text-lg"
          onClick={() => (gradable ? grade(true) : setFlipped(true))}
        >
          ✓ 认识了
        </ValButton>
      </div>
      <p className="mt-3 text-center text-[10px] text-val-dim">
        {isNew ? "滑动卡片：右滑认识 / 左滑不熟" : flipped ? "滑动或点击按钮评分" : "先翻面回忆释义，再评分"}
      </p>
    </div>
  );
}
