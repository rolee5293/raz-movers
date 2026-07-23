/**
 * Supabase 云同步（纯 fetch REST，无 SDK，零新增依赖）。
 * - 上传：存档变化 debounce 3s upsert；任务完成/启动时立即上传
 * - 下载：启动时按 updated_at 与本地 lastCloudSync 比较，云端更新则覆盖本地
 * - 全部失败静默回退 localStorage，绝不影响学习流程
 * anon key 为公开设计；service_role 严禁出现在此。
 */

const SUPA_URL = "https://rzpdymowshzgnmckzebi.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6cGR5bW93c2h6Z25tY2t6ZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODE1MzEsImV4cCI6MjEwMDM1NzUzMX0.b7l91Tj-zdF5PVT6tMnfFHemsLBYpvzE7UpPy4dgfE8";

/** 每个项目填入各自的 app 标识 */
export const CLOUD_APP_ID = "raz";

const LS_LAST_SYNC = `${CLOUD_APP_ID}-last-cloud-sync`;
const TABLE = `${SUPA_URL}/rest/v1/progress`;

const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

/* ================= 同步状态（顶栏小圆点） ================= */

export type CloudState = "idle" | "syncing" | "ok" | "error";

type Listener = (s: CloudState) => void;
const listeners = new Set<Listener>();
let state: CloudState = "idle";

function setState(s: CloudState) {
  state = s;
  listeners.forEach((f) => f(s));
}

export function onCloudState(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/* ================= 本地同步时间戳 ================= */

export function lastCloudSync(): string | null {
  try {
    return localStorage.getItem(LS_LAST_SYNC);
  } catch {
    return null;
  }
}

function markSynced() {
  try {
    localStorage.setItem(LS_LAST_SYNC, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/* ================= 上传 ================= */

let timer: ReturnType<typeof setTimeout> | null = null;

/** 存档变化后调用：3 秒防抖上传 */
export function scheduleUpload(getSave: () => object) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void uploadNow(getSave), 3000);
}

/** 立即上传（任务完成/启动时调用）；会取消等待中的防抖 */
export async function uploadNow(getSave: () => object): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  setState("syncing");
  try {
    const res = await fetch(TABLE, {
      method: "POST",
      headers: {
        ...HEADERS,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ app: CLOUD_APP_ID, data: getSave() }),
    });
    if (!res.ok) throw new Error(`upsert ${res.status}`);
    markSynced();
    setState("ok");
  } catch {
    setState("error"); // 静默失败，本地 localStorage 仍是主存储
  }
}

/* ================= 下载 ================= */

export interface CloudRow {
  data: unknown;
  updated_at: string;
}

/** 启动时调用。返回云端行（无则 null），失败也返回 null（静默回退） */
export async function downloadSave(): Promise<CloudRow | null> {
  setState("syncing");
  try {
    const res = await fetch(`${TABLE}?app=eq.${CLOUD_APP_ID}&select=data,updated_at`, {
      headers: HEADERS,
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const rows = (await res.json()) as CloudRow[];
    setState("ok");
    return rows?.[0] ?? null;
  } catch {
    setState("error");
    return null;
  }
}

/** 采纳云端存档后记录同步点（避免下次启动误判） */
export function markAdoptedCloud(updatedAt: string) {
  try {
    localStorage.setItem(LS_LAST_SYNC, updatedAt);
  } catch {
    /* ignore */
  }
}
