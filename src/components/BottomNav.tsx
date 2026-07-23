import { cn } from "@/lib/utils";

export type TabId = "home" | "study" | "quiz" | "reading" | "profile";

const TABS: Array<{ id: TabId; icon: string; label: string; en: string }> = [
  { id: "home", icon: "🛰️", label: "基地", en: "BASE" },
  { id: "study", icon: "🃏", label: "词卡", en: "CARDS" },
  { id: "quiz", icon: "🎯", label: "测验", en: "QUIZ" },
  { id: "reading", icon: "📡", label: "阅读", en: "READ" },
  { id: "profile", icon: "🏅", label: "战绩", en: "OPS" },
];

export function BottomNav({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-val-line bg-val-panel/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-3xl grid-cols-5">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 transition-colors",
                active ? "text-val-red" : "text-val-dim active:text-val-text"
              )}
            >
              {active && <span className="absolute top-0 h-0.5 w-10 bg-val-red" />}
              <span className="text-xl leading-none">{t.icon}</span>
              <span className="val-title text-[10px]">{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
