// Biblioteca de músicas importadas, guardada só neste browser (IndexedDB).
// Os ficheiros nunca saem do dispositivo: isto é só para não ter de os voltar a carregar.

export interface SongMeta {
  /** Identificador estável da música (título | artista | nº de compassos). */
  id: string;
  fileName: string;
  title: string;
  artist: string;
  bars: number;
  addedAt: number;
  openedAt: number;
}
interface SongRecord extends SongMeta { bytes: ArrayBuffer }

const DB = 'mapa-de-compassos';
const STORE = 'songs';

function open(idb: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>, idb?: IDBFactory): Promise<T> {
  return open(idb).then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req.result); };
    t.onerror = () => { db.close(); reject(t.error ?? req.error); };
    t.onabort = () => { db.close(); reject(t.error ?? new Error('Operação cancelada')); };
  }));
}

/** Guarda (ou atualiza) uma música. Mantém a data em que foi adicionada pela primeira vez. */
export async function saveSong(meta: Omit<SongMeta, 'addedAt' | 'openedAt'>, bytes: Uint8Array, idb?: IDBFactory): Promise<void> {
  const prev = await getSong(meta.id, idb).catch(() => null);
  const now = Date.now();
  const copy = bytes.slice().buffer as ArrayBuffer;
  const rec: SongRecord = { ...meta, bytes: copy, addedAt: prev?.addedAt ?? now, openedAt: now };
  await tx('readwrite', s => s.put(rec), idb);
}

/** Lista as músicas (sem os ficheiros), da aberta mais recentemente para a mais antiga. */
export async function listSongs(idb?: IDBFactory): Promise<SongMeta[]> {
  const all = await tx<SongRecord[]>('readonly', s => s.getAll() as IDBRequest<SongRecord[]>, idb);
  return all
    .map(({ bytes: _bytes, ...meta }) => meta)
    .sort((a, b) => b.openedAt - a.openedAt);
}

export async function getSong(id: string, idb?: IDBFactory): Promise<(SongMeta & { bytes: Uint8Array }) | null> {
  const rec = await tx<SongRecord | undefined>('readonly', s => s.get(id) as IDBRequest<SongRecord | undefined>, idb);
  return rec ? { ...rec, bytes: new Uint8Array(rec.bytes) } : null;
}

/** Marca a música como aberta agora (para aparecer em primeiro e abrir ao voltar ao site). */
export async function touchSong(id: string, idb?: IDBFactory): Promise<void> {
  const rec = await tx<SongRecord | undefined>('readonly', s => s.get(id) as IDBRequest<SongRecord | undefined>, idb);
  if (rec) await tx('readwrite', s => s.put({ ...rec, openedAt: Date.now() }), idb);
}

export async function deleteSong(id: string, idb?: IDBFactory): Promise<void> {
  await tx('readwrite', s => s.delete(id), idb);
}

/** Pede ao browser para não apagar estes dados quando falta espaço (sobretudo no Safari). */
export function askPersistentStorage(): void {
  try { void navigator.storage?.persist?.(); } catch { /* sem suporte */ }
}

/** "há 3 dias", "hoje", … */
export function relativeDay(ts: number, now = Date.now()): string {
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return 'há ' + days + ' dias';
  const months = Math.floor(days / 30);
  return months === 1 ? 'há 1 mês' : 'há ' + months + ' meses';
}
