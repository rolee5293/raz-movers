/**
 * Supabase 云同步（纯 fetch REST，无 SDK，零新增依赖）。
 * - 上传：存档变化 debounce 3s upsert；任务完成/启动时立即上传
 * - 下载：启动时按 updated_at 与本地 lastCloudSync 比较，云端更新则覆盖本地
 * - 全部失败静默回退 localStorage，绝不影响学习流程
 * anon key 为公开设计；service_role 严禁出现在此。
 */

import { mergeSaves } from "./merge";
import type { SaveState } from "@/types";

const SUPA_URL = "https://rzpdymowshzgnmckzebi.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ6cGR5bW93c2h6Z25tY2t6ZWJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3ODE1MzEsImV4cCI6MjEwMDM1NzUzMX0.b7l91Tj-zdF5PVT6tMnfFHemsLBYpvzE7UpPy4dgfE8";

/** 每个项目填入各自的 app 标识 */
export const CLOUD_APP_ID = "raz";

const LS_LAST_SYNC = `${CLOUD_APP_ID}-last-cloud-sync`;
const LS_DEVICE_ID = `${CLOUD_APP_ID}-device-id`;
const TABLE = `${SUPA_URL}/rest/v1/progress`;

/** 启动下载超时：网络不通时也要尽快放行本地流程与上传 */
const DOWNLOAD_TIMEOUT_MS = 6000;

/**
 * 本机设备标识。每台设备在云端独占一行 app = "<appId>#<deviceId>"，
 * 因此任何设备的写入都不会覆盖另一台设备的存档；
 * 读取时把该应用的所有行合并，进度依旧连续。
 *
 * 迁移前的历史行 app = "<appId>"（无后缀）保留只读并参与合并，不再写入，
 * 所以升级不会丢任何既有进度，前端回滚也不受影响。
 */
function deviceId(): string {
  try {
    const cached = localStorage.getItem(LS_DEVICE_ID);
    if (cached) return cached;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(LS_DEVICE_ID, id);
    return id;
  } catch {
    // localStorage 不可用时退化为会话内临时 ID（本次会话仍能正常上传）
    return "nostorage";
  }
}

/** 本设备在云端的行标识 */
export const ROW_KEY = `${CLOUD_APP_ID}#${deviceId()}`;

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

/**
 * 记录同步点。务必优先存服务端回传的 updated_at：
 * 下载时是拿 row.updated_at 与这里比大小，两边必须是同一个时钟，
 * 否则设备时钟稍有偏差就会永久判错、再也不采纳云端存档。
 */
function markSynced(serverStamp?: string | null) {
  try {
    localStorage.setItem(LS_LAST_SYNC, serverStamp ?? new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/* ================= 上传 ================= */

let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * 启动时的首次下载是否已结束。
 * 未结束前禁止防抖上传：否则本地旧存档会先于下载完成把云端覆盖掉，
 * 随后下载又把刚被覆盖的数据取回来，云端进度就此丢失。
 */
let initialSyncSettled = false;
let pendingGetSave: (() => object) | null = null;

/** 首次下载结束（成功或失败都要调用），放行被压住的上传 */
export function markInitialSyncSettled() {
  if (initialSyncSettled) return;
  initialSyncSettled = true;
  if (pendingGetSave) {
    const getSave = pendingGetSave;
    pendingGetSave = null;
    scheduleUpload(getSave);
  }
}

/** 存档变化后调用：3 秒防抖上传 */
export function scheduleUpload(getSave: () => object) {
  if (!initialSyncSettled) {
    pendingGetSave = getSave; // 压住，等首次下载有结果再传
    return;
  }
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
        // return=representation：拿回服务端写入后的 updated_at 当同步点
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      // 必须显式带上 updated_at：该列的 DEFAULT now() 只在 INSERT 时生效，
      // upsert 命中冲突走的是 UPDATE，不带这个字段时间戳会永远停在首次写入那一刻，
      // 结果就是家长端误报"已超过 N 天未同步"，且换设备后永远拉不回云端存档。
      // 只写本设备那一行，绝不触碰其他设备的行
      body: JSON.stringify({
        app: ROW_KEY,
        data: getSave(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`upsert ${res.status}`);
    let serverStamp: string | null = null;
    try {
      const rows = (await res.json()) as Array<{ updated_at?: string }>;
      serverStamp = rows?.[0]?.updated_at ?? null;
    } catch {
      /* 服务端未回传内容时退回本地时间 */
    }
    markSynced(serverStamp);
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
/**
 * 拉取该应用**所有设备**的行并合并成一份存档。
 * updated_at 取各行最大值——历史行时间戳很旧，取最小或取首行会误判为长期未同步。
 */
export async function downloadSave(): Promise<CloudRow | null> {
  setState("syncing");
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    // like.<appId>* 同时命中历史行 "raz" 与各设备行 "raz#xxx"
    const res = await fetch(`${TABLE}?app=like.${CLOUD_APP_ID}*&select=data,updated_at`, {
      headers: HEADERS,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const rows = (await res.json()) as CloudRow[];
    setState("ok");
    if (!rows || rows.length === 0) return null;
    const merged = mergeSaves(rows.map((r) => r.data as SaveState | null));
    if (!merged) return null;
    const newest = rows.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), rows[0].updated_at);
    return { data: merged, updated_at: newest };
  } catch {
    setState("error");
    return null;
  } finally {
    clearTimeout(timeout);
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
