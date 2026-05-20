import { useState, useEffect, useRef, useContext, createContext, useCallback } from "react";
import QRCode from "qrcode";
import { supabase } from "./supabase";

/* ---------- seed ---------- */
const SEED = [{
  id: "ejemplo_fest", name: "FESTIVAL EJEMPLO",
  stages: [
    {
      id: "stage1", name: "ESCENARIO PRINCIPAL",
      days: [
        {
          id: "day1", label: "DÍA 1", artists: [
            { id: "s1", artist: "ARTISTA A", console: "SSL 9000", connection: "OPTO DUO 1/2 (point-point)", signal: "AES 1/2", preset: "ARTISTA A", presetOk: true, toLx: "SMPT 1 (naranja)", toMon: "", tecnico: "Local", comments: ["Mesa compartida con artista siguiente", "Señal de video directo desde FOH"], extraSlots: [{ id: "e1", label: "RF", value: "Shure ULXD4Q · CH 38-40" }] },
            { id: "s2", artist: "ARTISTA B", console: "DiGiCo SD10", connection: "MADI 1-4 Festival Box", signal: "MADI", preset: "INITIAL", presetOk: false, toLx: "TIMECODE", toMon: "CH16 → MON WORLD", tecnico: "Banda", comments: [], extraSlots: [] },
            { id: "s3", artist: "ARTISTA C", console: "Avid S6L", connection: "HMA 1/2 (ALL DAY)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", tecnico: "", comments: [], extraSlots: [] },
          ]
        },
        {
          id: "day2", label: "DÍA 2", artists: [
            { id: "s4", artist: "ARTISTA D", console: "Yamaha PM5", connection: "RJ 1/2 SP (Festival Box)", signal: "AES 1/2", preset: "ARTISTA D", presetOk: true, toLx: "SMPT 1 & 2", toMon: "", tecnico: "Local", comments: ["Comparte GAIN con monitor"], extraSlots: [] },
            { id: "s5", artist: "ARTISTA E", console: "DiGiCo SD7", connection: "OPTO DUO (anillo)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", tecnico: "", comments: [], extraSlots: [{ id: "e2", label: "IEM", value: "Sennheiser 2000 · CH 28" }] },
          ]
        },
      ]
    },
  ],
}];

/* ---------- migration: normaliza fest al modelo con stages ---------- */
function normalizeFest(f) {
  // Nuevo formato: days es { _stages: [...] }
  if (f.days && !Array.isArray(f.days) && Array.isArray(f.days._stages)) {
    return { ...f, stages: f.days._stages };
  }
  // Ya tiene stages (en memoria, tras normalizar)
  if (Array.isArray(f.stages)) return f;
  // Legacy: days es array → migrar a un stage por defecto
  return { ...f, stages: [{ id: "stage_default", name: "ESCENARIO PRINCIPAL", days: Array.isArray(f.days) ? f.days : [] }] };
}

/* ---------- theme ---------- */
const ThemeCtx = createContext({ dark: false, toggle: () => {} });
const useTheme = () => useContext(ThemeCtx);
const LT = { bg: "#f8fafc", card: "#fff", card2: "#f1f5f9", border: "#e2e8f0", border2: "#f1f5f9", text: "#0f172a", text2: "#334155", text3: "#64748b", text4: "#94a3b8" };
const DK = { bg: "#0f172a", card: "#1e293b", card2: "#0f172a", border: "#334155", border2: "#1e293b", text: "#f1f5f9", text2: "#cbd5e1", text3: "#94a3b8", text4: "#64748b" };

/* ---------- helpers ---------- */
function sigColor(s) {
  const t = (s || "").toUpperCase();
  if (t.includes("AES")) return "#2563eb";
  if (t.includes("MADI")) return "#ea580c";
  if (t.includes("OPTO")) return "#16a34a";
  if (t.includes("XLR")) return "#db2777";
  if (t.includes("RJ")) return "#7c3aed";
  return "#64748b";
}
const uid = () => Math.random().toString(36).slice(2, 9);
const noInfo = v => v === "?" ? "NO INFO" : v;

/* ---------- Supabase storage ---------- */
async function loadFests(userId) {
  const { data } = await supabase
    .from("festivals")
    .select("*")
    .or(`user_id.eq.${userId},members.cs.{${userId}}`)
    .order("created_at", { ascending: true });
  return (data || []).map(normalizeFest);
}

function festToDB(fest) {
  // Serializa stages en el campo days del schema existente
  return { _stages: fest.stages || [] };
}

async function insertFest(userId, fest) {
  const { error } = await supabase.from("festivals").insert({
    id: fest.id,
    user_id: userId,
    name: fest.name,
    days: festToDB(fest),
    members: [],
  });
  if (error) console.error("insertFest error:", error);
}

async function updateFestRow(fest) {
  const { error } = await supabase
    .from("festivals")
    .update({ name: fest.name, days: festToDB(fest) })
    .eq("id", fest.id);
  if (error) console.error("updateFestRow error:", error);
}

async function saveFest(userId, fest) {
  // Si la fila ya existe en DB (tiene user_id), UPDATE; si no, INSERT.
  if (fest.user_id) {
    await updateFestRow(fest);
  } else {
    await insertFest(userId, fest);
  }
}

async function deleteFest(festId) {
  await supabase.from("festivals").delete().eq("id", festId);
}

async function joinFestAsMember(festId) {
  // SECURITY DEFINER function bypasea RLS para que el usuario se pueda añadir
  // aunque aún no esté en members
  const { data, error } = await supabase.rpc("join_festival", { festival_id: festId });
  if (error) console.error("join_festival error:", error);
  return !error;
}

// Helpers para notes/checks/slots compartidos en la fila del festival
// Las keys tienen formato `${festId}__${dayId}__${artId}__...`
function pickFestId(key) {
  return (key || "").split("__")[0];
}
function filterByFest(obj, festId) {
  const out = {};
  for (const k in obj) if (pickFestId(k) === festId) out[k] = obj[k];
  return out;
}
function mergeSharedFromFests(fests) {
  const notes = {}, checks = {}, slots = {};
  for (const f of fests || []) {
    Object.assign(notes, f.notes || {});
    Object.assign(checks, f.checks || {});
    Object.assign(slots, f.slots || {});
  }
  return { notes, checks, slots };
}
async function saveFestShared(festId, notes, checks, slots) {
  const { error } = await supabase
    .from("festivals")
    .update({
      notes: filterByFest(notes, festId),
      checks: filterByFest(checks, festId),
      slots: filterByFest(slots, festId),
    })
    .eq("id", festId);
  if (error) console.error("saveFestShared error:", error);
}

async function loadUserData(userId) {
  const { data } = await supabase
    .from("user_data")
    .select("notes, checks, slots")
    .eq("user_id", userId)
    .maybeSingle();
  return data || { notes: {}, checks: {}, slots: {} };
}

async function saveUserData(userId, notes, checks, slots) {
  await supabase.from("user_data").upsert({
    user_id: userId,
    notes,
    checks,
    slots,
  });
}

/* ============================================================ */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash />;
  if (!session) return <LoginScreen />;
  return <Main session={session} />;
}

/* ---------- login ---------- */
function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function loginWithGoogle() {
    setLoading(true);
    setError(null);
    const festParam = new URLSearchParams(window.location.search).get("fest");
    const redirectTo = window.location.origin + "/FEST-HANDOVER/" + (festParam ? `?fest=${festParam}` : "");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) { setError(error.message); setLoading(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'JetBrains Mono',monospace" }}>
      <Style />
      <div style={{ marginBottom: 8, fontSize: 11, color: "#475569", letterSpacing: "0.2em" }}>FOH HANDOVER</div>
      <div style={{ fontSize: 42, fontFamily: "'Bebas Neue',sans-serif", color: "#fff", letterSpacing: "0.05em", marginBottom: 4 }}>
        TUS <span style={{ color: "#f59e0b" }}>FESTIVALES</span>
      </div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 48, textAlign: "center" }}>
        Inicia sesión para guardar y sincronizar tus festivales
      </div>
      <button onClick={loginWithGoogle} disabled={loading} style={{
        display: "flex", alignItems: "center", gap: 12,
        background: "#fff", border: "none", borderRadius: 14,
        padding: "14px 24px", fontSize: 14, fontWeight: 700,
        fontFamily: "'JetBrains Mono',monospace", cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1, color: "#0f172a",
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
        width: "100%", maxWidth: 320, justifyContent: "center",
      }}>
        <GoogleIcon />
        {loading ? "Conectando…" : "Continuar con Google"}
      </button>
      {error && <div style={{ marginTop: 16, color: "#f87171", fontSize: 12, textAlign: "center" }}>{error}</div>}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

/* ---------- main app (autenticado) ---------- */
function Main({ session }) {
  const userId = session.user.id;

  const [fests, setFests] = useState(null);
  const [festId, setFestId] = useState(null);
  const [stageId, setStageId] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [artIdx, setArtIdx] = useState(0);
  const [notes, setNotesState] = useState({});
  const [checks, setChecksState] = useState({});
  const [slots, setSlotsState] = useState({});
  const [screen, setScreen] = useState("home");
  const [lastSync, setLastSync] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const toggleDark = () => setDarkMode(d => { const n = !d; localStorage.setItem("theme", n ? "dark" : "light"); return n; });

  useEffect(() => {
    (async () => {
      try {
      // Check URL for shared festival (puede venir en search o en hash)
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
      const shared = searchParams.get("fest") || hashParams.get("fest");

      let f = await loadFests(userId);

      // Reemplazar seed antiguo si existe
      const oldSeedId = "cooltural25";
      if (f.some(x => x.id === oldSeedId)) {
        await deleteFest(oldSeedId);
        f = f.filter(x => x.id !== oldSeedId);
      }

      if (f.length === 0) {
        for (const fest of SEED) await saveFest(userId, fest);
        f = await loadFests(userId);
      }

      if (shared) {
        try {
          const imported = JSON.parse(decodeURIComponent(escape(atob(shared))));
          if (imported && imported.id) {
            // Unirse como miembro al festival original (sincronización real)
            const ok = await joinFestAsMember(imported.id);
            if (ok) f = await loadFests(userId);
            else console.error("No se pudo unir al festival compartido");
          }
        } catch (err) {
          console.error("Error importando festival compartido:", err);
        }
        window.history.replaceState({}, "", window.location.pathname);
      }

      const sd = mergeSharedFromFests(f);
      setFests(f);
      setNotesState(sd.notes);
      setChecksState(sd.checks);
      setSlotsState(sd.slots);
      setLastSync(new Date());
      } catch (err) {
        setLoadError(err.message || "Error al cargar datos");
      }
    })();
  }, [userId]);

  // Realtime: recarga datos cuando cambia cualquier festival accesible
  useEffect(() => {
    const channel = supabase
      .channel("festivals-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "festivals" },
        async () => {
          const f = await loadFests(userId);
          const sd = mergeSharedFromFests(f);
          setFests(prev => JSON.stringify(prev) === JSON.stringify(f) ? prev : f);
          setNotesState(prev => JSON.stringify(prev) === JSON.stringify(sd.notes) ? prev : sd.notes);
          setChecksState(prev => JSON.stringify(prev) === JSON.stringify(sd.checks) ? prev : sd.checks);
          setSlotsState(prev => JSON.stringify(prev) === JSON.stringify(sd.slots) ? prev : sd.slots);
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  async function refresh() {
    const f = await loadFests(userId);
    const sd = mergeSharedFromFests(f);
    setFests(f);
    setNotesState(sd.notes);
    setChecksState(sd.checks);
    setSlotsState(sd.slots);
    setLastSync(new Date());
  }

  async function persistFests(next) {
    setFests(next);
  }

  async function addFest(fest) {
    await saveFest(userId, fest);
    // Marcar user_id en el estado local para que próximas ediciones hagan UPDATE
    setFests(prev => [...prev, { ...fest, user_id: userId, members: [] }]);
  }

  async function removeFest(id) {
    await deleteFest(id);
    setFests(prev => prev.filter(f => f.id !== id));
  }

  async function updateFest(updated) {
    setFests(prev => prev.map(f => f.id === updated.id ? updated : f));
    await saveFest(userId, updated);
  }

  async function updateNotes(n) {
    setNotesState(n);
    // Persistir en cada festival que tenga keys modificadas
    const fids = new Set([...Object.keys(n), ...Object.keys(notes)].map(pickFestId));
    for (const fid of fids) if (fid) await saveFestShared(fid, n, checks, slots);
  }

  async function toggleCheck(ckey) {
    const next = { ...checks, [ckey]: !checks[ckey] };
    setChecksState(next);
    const fid = pickFestId(ckey);
    if (fid) await saveFestShared(fid, notes, next, slots);
  }

  async function updateSlots(sl) {
    setSlotsState(sl);
    const fids = new Set([...Object.keys(sl), ...Object.keys(slots)].map(pickFestId));
    for (const fid of fids) if (fid) await saveFestShared(fid, notes, checks, sl);
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  if (loadError) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "monospace", gap: 16 }}>
      <Style />
      <div style={{ fontSize: 32 }}>⚠️</div>
      <div style={{ color: "#f87171", fontSize: 13, textAlign: "center", maxWidth: 340 }}>
        <strong>Error al conectar con la base de datos</strong><br /><br />
        {loadError}<br /><br />
        <span style={{ color: "#94a3b8", fontSize: 11 }}>
          Asegúrate de haber ejecutado el SQL en Supabase y de tener las tablas <code>festivals</code> y <code>user_data</code> creadas.
        </span>
      </div>
      <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 8, background: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", cursor: "pointer", fontSize: 13 }}>
        Cerrar sesión
      </button>
    </div>
  );
  if (!fests) return <Splash />;
  const fest = fests.find(f => f.id === festId);
  const stage = fest && stageId ? (fest.stages || []).find(s => s.id === stageId) : null;

  const S = makeS(darkMode ? DK : LT);
  return (
    <ThemeCtx.Provider value={{ dark: darkMode, toggle: toggleDark }}>
      <Style dark={darkMode} />
      <div style={S.app}>
        {screen === "home" && (
          <Home
            fests={fests}
            user={session.user}
            onOpen={(id) => { setFestId(id); setScreen("stages"); }}
            onNew={() => setScreen("builder")}
            onDelete={removeFest}
            onEdit={updateFest}
            onLogout={logout}
          />
        )}
        {screen === "stages" && fest && (
          <StageView
            fest={fest}
            onBack={() => setScreen("home")}
            onEditFest={updateFest}
            onOpenStage={(sid) => { setStageId(sid); setDayIdx(0); setScreen("view"); }}
          />
        )}
        {screen === "builder" && (
          <Builder
            onCancel={() => setScreen("home")}
            onSave={async (obj) => { await addFest(obj); setScreen("home"); }}
          />
        )}
        {screen === "view" && fest && stage && (
          <FestView
            fest={fest}
            stage={stage}
            dayIdx={dayIdx} setDayIdx={setDayIdx}
            notes={notes} setNotes={updateNotes}
            checks={checks} toggleCheck={toggleCheck}
            slots={slots} setSlots={updateSlots}
            onEditFest={updateFest}
            onBack={() => setScreen("stages")}
            onRefresh={refresh}
            lastSync={lastSync}
          />
        )}
      </div>
    </ThemeCtx.Provider>
  );
}

/* ---------- splash ---------- */
function Splash() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontFamily: "monospace" }}>
      <Style />
      cargando…
    </div>
  );
}

/* ---------- home ---------- */
function Home({ fests, user, onOpen, onNew, onDelete, onEdit, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const [editFestId, setEditFestId] = useState(null);
  const { dark, toggle } = useTheme();
  const T = dark ? DK : LT;
  const S = makeS(T);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", padding: "20px 20px 24px", overflow: "hidden", background: T.bg }}
      onClick={() => { menuOpen && setMenuOpen(false); }}>

      {/* header */}
      <div style={{ position: "relative", marginBottom: 20, flexShrink: 0 }}>
        {/* gear top-left */}
        <div style={{ position: "absolute", top: 0, left: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setEditMode(m => !m); }}
            style={{
              width: 38, height: 38, borderRadius: "50%", border: `2px solid ${T.border}`,
              background: editMode ? "#fef2f2" : T.card2, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: editMode ? "#ef4444" : T.text3,
              transition: "all 0.15s",
            }}
          >⚙️</button>
        </div>
        {/* avatar top-right */}
        <div style={{ position: "absolute", top: 0, right: 0 }}>
          <img
            src={user.user_metadata?.avatar_url || "https://ui-avatars.com/api/?name=U&background=e2e8f0&color=64748b"}
            alt=""
            onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
            style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid #e2e8f0", cursor: "pointer", display: "block" }}
          />
          {menuOpen && (
            <div onClick={e => e.stopPropagation()} style={{
              position: "absolute", right: 0, top: 46, background: T.card,
              border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
              padding: "6px", minWidth: 180, zIndex: 50,
            }}>
              <div style={{ padding: "8px 12px 10px", borderBottom: `1px solid ${T.border2}`, marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{ fontSize: 11, color: T.text4, marginTop: 2 }}>{user.email}</div>
              </div>
              <button onClick={toggle} style={{
                width: "100%", padding: "10px 12px", background: "none", border: "none",
                borderRadius: 8, color: T.text3, fontSize: 13, cursor: "pointer",
                textAlign: "left", fontFamily: "'JetBrains Mono',monospace",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>{dark ? "☀️ Modo claro" : "🌙 Modo oscuro"}</span>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 99,
                  background: dark ? "#334155" : "#f1f5f9",
                  color: dark ? "#94a3b8" : "#64748b",
                }}>{dark ? "oscuro" : "claro"}</span>
              </button>
              <div style={{ height: 1, background: T.border2, margin: "2px 0" }} />
              <button onClick={onLogout} style={{
                width: "100%", padding: "10px 12px", background: "none", border: "none",
                borderRadius: 8, color: "#ef4444", fontSize: 13, cursor: "pointer",
                textAlign: "left", fontFamily: "'JetBrains Mono',monospace",
              }}>Cerrar sesión</button>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: T.text4, letterSpacing: "0.2em", marginBottom: 2 }}>FOH HANDOVER</div>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.05em", lineHeight: 1 }}>
            TUS <span style={{ color: "#f59e0b" }}>FESTIVALES</span>
          </div>
        </div>
      </div>

      {/* lista festivales */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
        {fests.map(f => {
          const total = (f.stages || []).reduce((s, st) => s + st.days.reduce((a, d) => a + d.artists.length, 0), 0);
          return (
            <div key={f.id} style={{ ...S.festCard, background: T.card, border: `1px solid ${T.border}`, position: "relative", overflow: "visible" }}
              onClick={() => { if (!editMode) onOpen(f.id); }}>
              {/* slot izquierdo — siempre ocupa el mismo espacio */}
              <div style={{ width: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {editMode && (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmId(f.id); }}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", border: "none",
                      background: "#ef4444", color: "#fff", fontSize: 20, lineHeight: 1,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(239,68,68,0.4)",
                      fontWeight: 700, flexShrink: 0,
                    }}
                  >−</button>
                )}
              </div>
              {/* nombre siempre centrado */}
              <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                <div style={{ fontSize: 12, color: T.text4, marginTop: 2 }}>{(f.stages || []).length} stages · {total} artistas</div>
              </div>
              {/* slot derecho — mismo ancho que el izquierdo */}
              <div style={{ width: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {editMode ? (
                  <button
                    onClick={e => { e.stopPropagation(); setEditFestId(f.id); }}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", border: "none",
                      background: "#f59e0b", color: "#fff", fontSize: 14, lineHeight: 1,
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(245,158,11,0.4)",
                      flexShrink: 0,
                    }}
                  >✏️</button>
                ) : (
                  <span style={{ color: "#cbd5e1", fontSize: 18 }}>›</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onNew} style={{ ...S.bigBtn, marginTop: 0, flexShrink: 0 }}>+ CREAR FESTIVAL</button>

      {/* popup confirmación borrado */}
      {confirmId && (() => {
        const fest = fests.find(f => f.id === confirmId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
            onClick={() => setConfirmId(null)}>
            <div style={{ background: T.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 16, fontFamily: "'Bebas Neue',sans-serif", color: T.text, textAlign: "center", letterSpacing: "0.04em", marginBottom: 8 }}>
                ¿Borrar festival?
              </div>
              <div style={{ fontSize: 13, color: T.text3, textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
                Vas a borrar <strong style={{ color: T.text }}>{fest?.name}</strong>. Esta acción no se puede deshacer.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: "14px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: T.text2 }}>
                  Cancelar
                </button>
                <button onClick={() => { onDelete(confirmId); setConfirmId(null); setEditMode(false); }} style={{ flex: 1, padding: "14px", background: "#ef4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: "#fff" }}>
                  Sí, borrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* modal editar festival */}
      {editFestId && (() => {
        const fest = fests.find(f => f.id === editFestId);
        return (
          <FestEditModal
            fest={fest}
            onSave={updated => { onEdit(updated); setEditFestId(null); }}
            onClose={() => setEditFestId(null)}
          />
        );
      })()}
    </div>
  );
}

/* ---------- builder helpers ---------- */
function BuilderNotes({ comments, onAdd, onDel }) {
  const [draft, setDraft] = useState("");
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>NOTAS PREVIAS</div>
      {comments.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
          <div style={{ flex: 1, fontSize: 13, color: T.text3, lineHeight: 1.4, padding: "7px 10px", background: T.card2, borderLeft: `2px solid ${T.border}`, borderRadius: "0 6px 6px 0" }}>{c}</div>
          <button onClick={() => onDel(i)} style={S.iconBtn}>×</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { onAdd(draft); setDraft(""); } }}
          placeholder="Añadir nota…" style={{ ...S.input, flex: 1 }} />
        <button onClick={() => { onAdd(draft); setDraft(""); }} style={{ ...S.smBtn, flexShrink: 0 }}>+</button>
      </div>
    </div>
  );
}

/* ---------- builder ---------- */
function Builder({ onCancel, onSave }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState([{ id: uid(), label: "DÍA 1", artists: [] }]);
  const [expDay, setExpDay] = useState(0);

  const addDay = () => { setDays([...days, { id: uid(), label: `DÍA ${days.length + 1}`, artists: [] }]); setExpDay(days.length); };
  const setDayLabel = (i, v) => { const d = [...days]; d[i].label = v; setDays(d); };
  const delDay = (i) => { setDays(days.filter((_, idx) => idx !== i)); setExpDay(0); };

  const addArtist = (di) => {
    const d = [...days];
    d[di].artists.push({ id: uid(), artist: "", console: "", connection: "", signal: "", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] });
    setDays(d);
  };
  const setAF = (di, ai, k, v) => { const d = [...days]; d[di].artists[ai][k] = v; setDays(d); };
  const delArtist = (di, ai) => { const d = [...days]; d[di].artists.splice(ai, 1); setDays(d); };

  const addExtraSlot = (di, ai) => {
    const d = [...days];
    d[di].artists[ai].extraSlots = [...(d[di].artists[ai].extraSlots || []), { id: uid(), label: "", value: "" }];
    setDays(d);
  };
  const setES = (di, ai, sid, fld, val) => {
    const d = [...days];
    d[di].artists[ai].extraSlots = (d[di].artists[ai].extraSlots || []).map(s => s.id === sid ? { ...s, [fld]: val } : s);
    setDays(d);
  };
  const delES = (di, ai, sid) => {
    const d = [...days];
    d[di].artists[ai].extraSlots = (d[di].artists[ai].extraSlots || []).filter(s => s.id !== sid);
    setDays(d);
  };
  const addComment = (di, ai, t) => {
    if (!t.trim()) return;
    const d = [...days]; d[di].artists[ai].comments = [...(d[di].artists[ai].comments || []), t.trim()]; setDays(d);
  };
  const delComment = (di, ai, ci) => {
    const d = [...days]; d[di].artists[ai].comments = d[di].artists[ai].comments.filter((_, idx) => idx !== ci); setDays(d);
  };

  const valid = name.trim() && days.some(d => d.artists.length);
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onCancel} style={S.backBtn}>‹</button>
        <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.05em" }}>NUEVO FESTIVAL</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>NOMBRE</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mad Cool 26" style={S.input} />
      </div>

      {days.map((d, di) => (
        <div key={d.id} style={S.daySection}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={d.label} onChange={e => setDayLabel(di, e.target.value)} style={{ ...S.input, flex: 1, fontWeight: 700 }} />
            <button onClick={() => setExpDay(expDay === di ? -1 : di)} style={S.smBtn}>{expDay === di ? "▾" : "▸"}</button>
            {days.length > 1 && <button onClick={() => delDay(di)} style={S.iconBtn}>🗑</button>}
          </div>
          <div style={{ fontSize: 10, color: T.text4, marginTop: 4 }}>{d.artists.length} artistas</div>

          {expDay === di && (
            <div style={{ marginTop: 10 }}>
              {d.artists.map((a, ai) => (
                <div key={a.id} style={S.artForm}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 10, color: "#f59e0b", letterSpacing: "0.1em", fontWeight: 700 }}>ARTISTA {ai + 1}</span>
                    <button onClick={() => delArtist(di, ai)} style={S.iconBtn}>×</button>
                  </div>
                  <input value={a.artist} onChange={e => setAF(di, ai, "artist", e.target.value)} placeholder="Nombre artista" style={{ ...S.input, marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input value={a.console} onChange={e => setAF(di, ai, "console", e.target.value)} placeholder="Consola" style={S.input} />
                    <input value={a.signal} onChange={e => setAF(di, ai, "signal", e.target.value)} placeholder="Señal" style={S.input} />
                  </div>
                  <input value={a.connection} onChange={e => setAF(di, ai, "connection", e.target.value)} placeholder="Conexión" style={{ ...S.input, marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input value={a.toLx} onChange={e => setAF(di, ai, "toLx", e.target.value)} placeholder="TO LX" style={S.input} />
                    <input value={a.toMon} onChange={e => setAF(di, ai, "toMon", e.target.value)} placeholder="TO MON" style={S.input} />
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <input value={a.preset} onChange={e => setAF(di, ai, "preset", e.target.value)} placeholder="Preset" style={{ ...S.input, flex: 1 }} />
                    <button onClick={() => setAF(di, ai, "presetOk", !a.presetOk)} style={{
                      ...S.smBtn, background: a.presetOk ? "#dcfce7" : "#f1f5f9",
                      color: a.presetOk ? "#16a34a" : "#94a3b8", border: `1px solid ${a.presetOk ? "#86efac" : "#e2e8f0"}`,
                    }}>{a.presetOk ? "✓ OK" : "preset?"}</button>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 9, color: dark ? "#93c5fd" : "#2563eb", letterSpacing: "0.1em", marginBottom: 6 }}>CAMPOS EXTRA</div>
                    {(a.extraSlots || []).map(s => (
                      <div key={s.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                        <input value={s.label} onChange={e => setES(di, ai, s.id, "label", e.target.value)} placeholder="Etiqueta (RF…)" style={{ ...S.input, flex: 1 }} />
                        <input value={s.value} onChange={e => setES(di, ai, s.id, "value", e.target.value)} placeholder="Valor" style={{ ...S.input, flex: 1.5 }} />
                        <button onClick={() => delES(di, ai, s.id)} style={S.iconBtn}>×</button>
                      </div>
                    ))}
                    <button onClick={() => addExtraSlot(di, ai)} style={{ ...S.addBtn, color: "#2563eb", borderColor: "#bfdbfe", background: "#eff6ff" }}>+ Campo</button>
                  </div>

                  <BuilderNotes
                    comments={a.comments || []}
                    onAdd={t => addComment(di, ai, t)}
                    onDel={ci => delComment(di, ai, ci)}
                  />
                </div>
              ))}
              <button onClick={() => addArtist(di)} style={S.addBtn}>+ Añadir artista</button>
            </div>
          )}
        </div>
      ))}

      <button onClick={addDay} style={{ ...S.addBtn, marginTop: 12 }}>+ Añadir día</button>
      <button onClick={() => valid && onSave({ id: uid(), name: name.trim(), stages: [{ id: uid(), name: "ESCENARIO PRINCIPAL", days }] })} disabled={!valid}
        style={{ ...S.bigBtn, marginTop: 24, opacity: valid ? 1 : 0.4 }}>
        GUARDAR FESTIVAL
      </button>
    </div>
  );
}

/* ---------- stage view ---------- */
function StageView({ fest, onBack, onEditFest, onOpenStage }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedStage, setSelectedStage] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);

  function addStage() {
    if (!newName.trim()) return;
    const newStage = { id: uid(), name: newName.trim().toUpperCase(), days: [{ id: uid(), label: "DÍA 1", artists: [] }] };
    onEditFest({ ...fest, stages: [...(fest.stages || []), newStage] });
    setNewName("");
    setShowAdd(false);
  }

  function deleteStage(sid) {
    onEditFest({ ...fest, stages: (fest.stages || []).filter(s => s.id !== sid) });
    if (selectedStage === sid) setSelectedStage(null);
  }

  const totalForStage = (st) => st.days.reduce((a, d) => a + d.artists.length, 0);
  const activeStage = selectedStage ? (fest.stages || []).find(s => s.id === selectedStage) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      {/* top bar */}
      <div style={{ ...S.topBar, padding: "10px 12px 10px" }}>
        <button onClick={selectedStage ? () => setSelectedStage(null) : onBack} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.06em" }}>
          {activeStage ? activeStage.name : fest.name}
        </div>
        <div style={{ width: 44 }} />
      </div>

      <div style={{ flex: 1, padding: "16px 14px", background: T.bg, overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>

        {activeStage ? (
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", color: T.text4, textTransform: "uppercase", marginBottom: 14 }}>POSICIONES</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => onOpenStage(activeStage.id)}
                style={{ display: "flex", alignItems: "center", gap: 14, background: dark ? "#334155" : "#0f172a", border: "none", borderRadius: 16, padding: "16px 20px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🎛️</div>
                <div>
                  <div style={{ fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", color: "#fff", letterSpacing: "0.08em" }}>FOH</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{totalForStage(activeStage)} artistas · {activeStage.days.length} días</div>
                </div>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 14, background: T.card, border: `1.5px dashed ${T.border}`, borderRadius: 16, padding: "16px 20px", opacity: 0.5 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: T.card2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>＋</div>
                <div>
                  <div style={{ fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", color: T.text4, letterSpacing: "0.08em" }}>NUEVA POSICIÓN</div>
                  <div style={{ fontSize: 11, color: T.text4, marginTop: 1 }}>Próximamente</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
              <button onClick={() => { setEditMode(m => !m); setRenamingId(null); }} style={{
                background: editMode ? "#fef2f2" : T.card2, border: `1px solid ${editMode ? "#fecaca" : T.border}`,
                borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 14, color: editMode ? "#ef4444" : T.text3, lineHeight: 1,
              }}>⚙️</button>
              <div style={{ fontSize: 10, letterSpacing: "0.08em", color: T.text4, textTransform: "uppercase", marginLeft: 10 }}>STAGES</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(fest.stages || []).map(st => {
                const total = totalForStage(st);
                const isRenaming = renamingId === st.id;
                return (
                  <div key={st.id}
                    onClick={() => { if (!editMode) setSelectedStage(st.id); }}
                    style={{ background: T.card, border: `1px solid ${editMode ? "#fecaca" : T.border}`, borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", cursor: editMode ? "default" : "pointer" }}>
                    {editMode && (
                      <button onClick={e => { e.stopPropagation(); deleteStage(st.id); }}
                        style={{ width: 26, height: 26, borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>−</button>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isRenaming ? (
                        <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && renameVal.trim()) {
                              onEditFest({ ...fest, stages: (fest.stages || []).map(s => s.id === st.id ? { ...s, name: renameVal.trim().toUpperCase() } : s) });
                              setRenamingId(null);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          style={{ ...S.input, padding: "6px 10px", fontSize: 14, fontWeight: 700 }}
                          autoFocus onClick={e => e.stopPropagation()} />
                      ) : (
                        <>
                          <div style={{ fontSize: 17, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.04em" }}>{st.name}</div>
                          <div style={{ fontSize: 11, color: T.text4, marginTop: 2 }}>{st.days.length} días · {total} artistas</div>
                        </>
                      )}
                    </div>
                    {editMode && !isRenaming && (
                      <button onClick={e => { e.stopPropagation(); setRenamingId(st.id); setRenameVal(st.name); }}
                        style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: T.text2, cursor: "pointer", flexShrink: 0 }}>✏️</button>
                    )}
                    {!editMode && <span style={{ color: T.text4, fontSize: 18 }}>›</span>}
                  </div>
                );
              })}
            </div>

            {showAdd ? (
              <div style={{ marginTop: 12, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 16px" }}>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addStage()}
                  placeholder="Nombre del stage" style={{ ...S.input, marginBottom: 10 }} autoFocus />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={addStage} disabled={!newName.trim()} style={{ ...S.bigBtn, flex: 1, padding: "11px", marginTop: 0, fontSize: 13, opacity: newName.trim() ? 1 : 0.4 }}>Añadir</button>
                  <button onClick={() => { setShowAdd(false); setNewName(""); }} style={{ ...S.navBtn, flex: 0.5 }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} style={{ ...S.addBtn, marginTop: 12 }}>+ Añadir stage</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- fest view ---------- */
function FestView({ fest, stage, dayIdx, setDayIdx, notes, setNotes, checks, toggleCheck, slots, setSlots, onEditFest, onBack, onRefresh, lastSync }) {
  const [showShare, setShowShare] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [artGearOpen, setArtGearOpen] = useState(false);
  const [confirmDeleteArt, setConfirmDeleteArt] = useState(false);
  const [tab, setTab] = useState("bandas");
  const [showRuloForm, setShowRuloForm] = useState(false);
  const [prefillPos, setPrefillPos] = useState(null);
  const [showCopy, setShowCopy] = useState(false);
  const [copySelected, setCopySelected] = useState({});
  const [copyTargetDays, setCopyTargetDays] = useState({});
  const [editRuloId, setEditRuloId] = useState(null);

  function updateStage(newDays) {
    const newStages = (fest.stages || []).map(s => s.id === stage.id ? { ...s, days: newDays } : s);
    return { ...fest, stages: newStages };
  }

  async function copyArtistsTodays() {
    const artsToCopy = artists.filter(a => copySelected[a.id]);
    if (!artsToCopy.length) return;
    const targetIdxs = stage.days.map((_, i) => i).filter(i => copyTargetDays[i] && i !== dayIdx);
    if (!targetIdxs.length) return;
    const newDays = stage.days.map((d, i) => {
      if (!targetIdxs.includes(i)) return d;
      const clones = artsToCopy.map(a => ({ ...a, id: uid(), presetOk: false }));
      return { ...d, artists: [...d.artists, ...clones] };
    });
    await onEditFest(updateStage(newDays));
    setShowCopy(false);
    setCopySelected({});
    setCopyTargetDays({});
  }

  function updateDayRulos(newRulos) {
    const newDays = stage.days.map((d, i) => i === dayIdx ? { ...d, rulos: newRulos } : d);
    const newStages = (fest.stages || []).map(s => s.id === stage.id ? { ...s, days: newDays } : s);
    return { ...fest, stages: newStages };
  }

  function updatePermRulos(newRulos) {
    const newStages = (fest.stages || []).map(s => s.id === stage.id ? { ...s, rulos: newRulos } : s);
    return { ...fest, stages: newStages };
  }

  function saveRulo(fields) {
    // remove from both lists first, then add to the right one — single update
    let newDayRulos = (day.rulos || []).filter(r => r.id !== editRuloId);
    let newPermRulos = (stage.rulos || []).filter(r => r.id !== editRuloId);
    const id = editRuloId || uid();
    if (fields.permanent) {
      newPermRulos = [...newPermRulos, { ...fields, id }];
    } else {
      newDayRulos = [...newDayRulos, { ...fields, id }];
    }
    const newDays = stage.days.map((d, i) => i === dayIdx ? { ...d, rulos: newDayRulos } : d);
    const newStages = (fest.stages || []).map(s => s.id === stage.id ? { ...s, days: newDays, rulos: newPermRulos } : s);
    onEditFest({ ...fest, stages: newStages });
    setShowRuloForm(false);
    setEditRuloId(null);
    setPrefillPos(null);
  }

  function deleteRulo(id, isPerm) {
    let newDayRulos = (day.rulos || []).filter(r => r.id !== id);
    let newPermRulos = (stage.rulos || []).filter(r => r.id !== id);
    const newDays = stage.days.map((d, i) => i === dayIdx ? { ...d, rulos: newDayRulos } : d);
    const newStages = (fest.stages || []).map(s => s.id === stage.id ? { ...s, days: newDays, rulos: newPermRulos } : s);
    onEditFest({ ...fest, stages: newStages });
  }

  function addDay() {
    const newDay = { id: uid(), label: `DÍA ${stage.days.length + 1}`, artists: [] };
    onEditFest(updateStage([...stage.days, newDay]));
    setDayIdx(stage.days.length);
    setSelectedId(null);
  }

  const day = stage.days[dayIdx];
  const artists = day ? day.artists : [];
  const art = artists.find(a => a.id === selectedId) || null;

  const ckey = art ? `${fest.id}__${day.id}__${art.id}` : null;
  const ckeysc = ckey ? `${ckey}__sc` : null;
  const ckeyshow = ckey ? `${ckey}__show` : null;
  const scDone = ckeysc ? !!checks[ckeysc] : false;
  const showDone = ckeyshow ? !!checks[ckeyshow] : false;
  const done = scDone && showDone;
  const myNotes = ckey ? (notes[ckey] || []) : [];
  const mySlots = ckey ? (slots[ckey] || []) : [];
  const sc = art ? sigColor(art.signal) : "#64748b";

  async function addArtistToDay(fields) {
    const newArt = { id: uid(), artist: fields.artist || "", console: fields.console || "", connection: fields.connection || "", signal: fields.signal || "", preset: fields.preset || "INITIAL", presetOk: false, toLx: fields.toLx || "", toMon: fields.toMon || "", tecnico: fields.tecnico || "", comments: [], extraSlots: [] };
    const updatedDays = stage.days.map((d, i) => i === dayIdx ? { ...d, artists: [...d.artists, newArt] } : d);
    await onEditFest(updateStage(updatedDays));
    setShowAdd(false);
    setSelectedId(newArt.id);
  }

  async function saveEditArtist(fields) {
    const updatedDays = stage.days.map((d, i) => i === dayIdx ? {
      ...d, artists: d.artists.map(a => a.id === editId ? { ...a, ...fields } : a)
    } : d);
    await onEditFest(updateStage(updatedDays));
    setEditId(null);
  }

  async function deleteArtist(artId) {
    const updatedDays = stage.days.map((d, i) => i === dayIdx ? { ...d, artists: d.artists.filter(a => a.id !== artId) } : d);
    await onEditFest(updateStage(updatedDays));
  }

  function addNote(text) {
    if (!text.trim()) return;
    setNotes({ ...notes, [ckey]: [...myNotes, { text: text.trim(), ts: Date.now() }] });
  }
  function delNote(i) { setNotes({ ...notes, [ckey]: myNotes.filter((_, idx) => idx !== i) }); }
  function addSlot(label, value) {
    if (!label.trim()) return;
    setSlots({ ...slots, [ckey]: [...mySlots, { id: uid(), label: label.trim(), value: value.trim() }] });
  }
  function delSlot(id) { setSlots({ ...slots, [ckey]: mySlots.filter(s => s.id !== id) }); }
  function editSlot(id, fld, val) { setSlots({ ...slots, [ckey]: mySlots.map(s => s.id === id ? { ...s, [fld]: val } : s) }); }

  /* shared top bar */
  const { dark, toggle } = useTheme();
  const T = dark ? DK : LT;
  const S = makeS(T);
  const TopBar = ({ onBackBtn }) => (
    <div style={{ ...S.topBar, flexWrap: "wrap", rowGap: 8, padding: "10px 12px 8px", background: T.card, borderBottomColor: T.border }}>
      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        <button onClick={onBackBtn} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.06em" }}>{stage.name}</div>
        <button onClick={() => setShowShare(true)} style={S.syncBtn}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="2"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>
      {/* BANDAS / RULOS tab switcher + sync */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingBottom: 2 }}>
        <div style={{ display: "flex", gap: 4, background: T.card2, borderRadius: 10, padding: 3 }}>
          {["bandas", "rulos"].map(t => (
            <button key={t} onClick={() => { setTab(t); setSelectedId(null); setShowAdd(false); }} style={{
              padding: "4px 10px", borderRadius: 8, fontSize: 11,
              fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", cursor: "pointer",
              border: "none",
              background: tab === t ? (dark ? "#334155" : "#0f172a") : "transparent",
              color: tab === t ? "#fff" : T.text4,
              transition: "all 0.2s",
            }}>{t === "bandas" ? "BANDAS" : "RULOS"}</button>
          ))}
        </div>
        <button onClick={onRefresh} style={{ ...S.syncBtn, flexShrink: 0 }}>↻ {lastSync ? lastSync.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : ""}</button>
      </div>
      {/* day pills */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", width: "100%", paddingBottom: 2 }}>
          {stage.days.map((d, i) => {
            const dn = d.artists.filter(a => checks[`${fest.id}__${d.id}__${a.id}__sc`] && checks[`${fest.id}__${d.id}__${a.id}__show`]).length;
            const active = i === dayIdx;
            return (
              <button key={d.id} onClick={() => { setDayIdx(i); setSelectedId(null); setShowAdd(false); }} style={{
                flexShrink: 0, padding: "5px 12px", borderRadius: 20, fontSize: 12,
                fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", cursor: "pointer",
                whiteSpace: "nowrap", border: "none",
                background: active ? "#0f172a" : "#f1f5f9",
                color: active ? "#fff" : "#64748b",
              }}>
                {d.label} <span style={{ opacity: 0.6, fontSize: 10 }}>{dn}/{d.artists.length}</span>
              </button>
            );
          })}
          <button onClick={addDay} style={{
            flexShrink: 0, padding: "5px 10px", borderRadius: 20, fontSize: 14,
            fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
            border: "1.5px dashed #94a3b8", background: "transparent", color: "#94a3b8",
          }}>+</button>
        </div>
    </div>
  );

  /* ---- edit screen ---- */
  if (editId) {
    const editArt = artists.find(a => a.id === editId);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
        <TopBar onBackBtn={() => setEditId(null)} />
        <div style={{ flex: 1, padding: "12px 14px 24px", background: "#f8fafc", overflowY: "auto" }}>
          <AddArtistScreen initial={editArt} onAdd={saveEditArtist} onBack={() => setEditId(null)} />
        </div>
        {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
      </div>
    );
  }

  /* ---- add screen ---- */
  if (showAdd) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <TopBar onBackBtn={() => setShowAdd(false)} />
      <div style={{ flex: 1, padding: "12px 14px 24px", background: "#f8fafc", overflowY: "auto" }}>
        <AddArtistScreen onAdd={addArtistToDay} onBack={() => setShowAdd(false)} />
      </div>
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
    </div>
  );

  /* ---- detail screen ---- */
  if (art) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <TopBar onBackBtn={() => setSelectedId(null)} />
      <div style={{ flex: 1, padding: "12px 14px", background: T.bg, overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
        <div style={{ background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>

          {/* header: nombre + día/hora + botones SC/SHOW */}
          <div style={{ padding: "14px 16px", borderBottom: `0.5px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                {/* gear */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <button onClick={() => setArtGearOpen(o => !o)} style={{
                    background: artGearOpen ? "#f1f5f9" : "none", border: "1px solid #e2e8f0",
                    borderRadius: 10, padding: "6px 10px", cursor: "pointer", fontSize: 15, lineHeight: 1,
                  }}>⚙️</button>
                  {artGearOpen && (
                    <div onClick={e => e.stopPropagation()} style={{
                      position: "absolute", top: 38, left: 0, background: "#fff", borderRadius: 12,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid #e2e8f0",
                      zIndex: 30, minWidth: 140, overflow: "hidden",
                    }}>
                      <button onClick={() => { setArtGearOpen(false); setEditId(art.id); setSelectedId(null); }} style={{ display: "block", width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#334155", cursor: "pointer", fontFamily: "monospace" }}>✏️ Editar</button>
                      <div style={{ height: 1, background: "#f1f5f9" }} />
                      <button onClick={() => { setArtGearOpen(false); setConfirmDeleteArt(true); }} style={{ display: "block", width: "100%", padding: "12px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#ef4444", cursor: "pointer", fontFamily: "monospace" }}>🗑 Borrar</button>
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 500, color: T.text, lineHeight: 1.2, wordBreak: "break-word" }}>{art.artist || "—"}</div>
                  <div style={{ fontSize: 12, color: T.text4, marginTop: 4 }}>{day.label} · {lastSync ? lastSync.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—"}</div>
                </div>
              </div>
              {/* SC + SHOW pills */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, paddingTop: 2, alignItems: "flex-end" }}>
                <button onClick={() => toggleCheck(ckeysc)} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99,
                  background: scDone ? "#E1F5EE" : "#f8fafc",
                  color: scDone ? "#085041" : "#94a3b8",
                  border: `0.5px solid ${scDone ? "#1D9E7555" : "#e2e8f0"}`,
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  {scDone && <span style={{ width: 5, height: 5, background: "#1D9E75", borderRadius: "50%", display: "inline-block" }} />}
                  SC
                </button>
                <button onClick={() => toggleCheck(ckeyshow)} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99,
                  background: showDone ? "#E6F1FB" : "#f8fafc",
                  color: showDone ? "#0C447C" : "#94a3b8",
                  border: `0.5px solid ${showDone ? "#2563eb55" : "#e2e8f0"}`,
                  cursor: "pointer", transition: "all 0.2s",
                }}>
                  {showDone && <span style={{ width: 5, height: 5, background: "#2563eb", borderRadius: "50%", display: "inline-block" }} />}
                  SHOW
                </button>
              </div>
            </div>
          </div>

          {/* Setup técnico */}
          <div style={{ borderBottom: `0.5px solid ${T.border}` }}>
            <div style={{ padding: "10px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: T.text4 }}>🖥</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: T.text4 }}>Setup técnico</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5px", background: T.border }}>
              <div style={{ padding: "10px 12px", background: T.card2 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 4 }}>Mesa</div>
                {art.console
                  ? <div style={{ fontSize: 14, fontWeight: 500, color: T.text, lineHeight: 1.3 }}>{noInfo(art.console)}</div>
                  : <div style={{ fontSize: 13, fontWeight: 400, color: T.text4, fontStyle: "italic" }}>Sin confirmar</div>}
              </div>
              <div style={{ padding: "10px 12px", background: T.card2 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 4 }}>Técnico</div>
                {art.tecnico
                  ? <div style={{ fontSize: 14, fontWeight: 500, color: T.text, lineHeight: 1.3 }}>{noInfo(art.tecnico)}</div>
                  : <div style={{ fontSize: 13, fontWeight: 400, color: T.text4, fontStyle: "italic" }}>Sin confirmar</div>}
              </div>
              <div style={{ padding: "10px 12px", background: T.card2, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 4 }}>Preset</div>
                {art.preset
                  ? <div style={{ fontSize: 14, fontWeight: 500, color: art.presetOk ? "#16a34a" : T.text, lineHeight: 1.3 }}>
                      {noInfo(art.preset)}{art.presetOk && <span style={{ marginLeft: 6, fontSize: 11 }}>✓</span>}
                    </div>
                  : <div style={{ fontSize: 13, fontWeight: 400, color: T.text4, fontStyle: "italic" }}>Sin confirmar</div>}
              </div>
            </div>
          </div>

          {/* Conexiones */}
          <div style={{ borderBottom: `0.5px solid ${T.border}` }}>
            <div style={{ padding: "10px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: T.text4 }}>🔌</span>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: T.text4 }}>Conexiones</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5px", background: T.border }}>
              <div style={{ padding: "10px 12px", background: T.card2 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 4 }}>Señal</div>
                {art.signal
                  ? <div style={{ fontSize: 14, fontWeight: 500, color: T.text, lineHeight: 1.3 }}>{noInfo(art.signal)}</div>
                  : <div style={{ fontSize: 13, fontWeight: 400, color: T.text4, fontStyle: "italic" }}>sin confirmar</div>}
              </div>
              <div style={{ padding: "10px 12px", background: T.card2 }}>
                <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text4, marginBottom: 4 }}>Conexión</div>
                {art.connection
                  ? <div style={{ fontSize: 14, fontWeight: 500, color: T.text, lineHeight: 1.3 }}>{noInfo(art.connection)}</div>
                  : <div style={{ fontSize: 13, fontWeight: 400, color: T.text4, fontStyle: "italic" }}>sin confirmar</div>}
              </div>
            </div>
          </div>

          {/* TO LX / TO MON */}
          {(art.toLx || art.toMon) && (
            <div style={{ borderBottom: "0.5px solid #e2e8f0" }}>
              <div style={{ padding: "10px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Rutas</span>
              </div>
              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
                {art.toLx && <RouteChip icon="💡" label="TO LX" value={noInfo(art.toLx)} color="#ea580c" />}
                {art.toMon && <RouteChip icon="🎧" label="TO MON" value={noInfo(art.toMon)} color="#7c3aed" />}
              </div>
            </div>
          )}

          {/* Extra slots estáticos del artista */}
          {(art.extraSlots || []).filter(s => s.label).length > 0 && (
            <div style={{ borderBottom: "0.5px solid #e2e8f0", padding: "0 12px 12px" }}>
              <div style={{ padding: "10px 4px 8px", fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Campos extra (artista)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(art.extraSlots || []).filter(s => s.label).map(s => (
                  <RouteChip key={s.id} icon="📋" label={s.label} value={s.value || "—"} color="#2563eb" />
                ))}
              </div>
            </div>
          )}

          {/* Notas previas del artista */}
          {(art.comments || []).length > 0 && (
            <div style={{ borderBottom: "0.5px solid #e2e8f0", padding: "10px 16px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>Notas previas</div>
              {art.comments.map((c, i) => (
                <div key={i} style={{ fontSize: 13, color: "#475569", lineHeight: 1.5, padding: "6px 10px", background: "#f8fafc", borderLeft: "2px solid #cbd5e1", borderRadius: "0 6px 6px 0", marginBottom: 4 }}>{c}</div>
              ))}
            </div>
          )}

          <ExtraSlots slots={mySlots} onAdd={addSlot} onDel={delSlot} onEdit={editSlot} />
          <FohNotes notes={myNotes} onAdd={addNote} onDel={delNote} />
        </div>
      </div>
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
      {/* cierre menú gear al tocar fuera */}
      {artGearOpen && <div onClick={() => setArtGearOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />}
      {/* popup confirmar borrado artista */}
      {confirmDeleteArt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setConfirmDeleteArt(false)}>
          <div style={{ background: T.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 16, fontFamily: "'Bebas Neue',sans-serif", color: T.text, textAlign: "center", letterSpacing: "0.04em", marginBottom: 8 }}>¿Borrar artista?</div>
            <div style={{ fontSize: 13, color: T.text3, textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
              Vas a borrar <strong style={{ color: T.text }}>{art.artist}</strong>. Esta acción no se puede deshacer.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeleteArt(false)} style={{ flex: 1, padding: "14px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: T.text2 }}>Cancelar</button>
              <button onClick={() => { deleteArtist(art.id); setConfirmDeleteArt(false); setSelectedId(null); }} style={{ flex: 1, padding: "14px", background: "#ef4444", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: "#fff" }}>Sí, borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  /* ---- list screen ---- */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <TopBar onBackBtn={onBack} />
      {tab === "rulos" ? (
        <div style={{ flex: 1, padding: "12px 14px", background: T.bg, overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
          <RulosView
            rulos={day.rulos || []}
            permRulos={stage.rulos || []}
            onAdd={(pos) => { setEditRuloId(null); setShowRuloForm(true); setPrefillPos(pos || null); }}
            onEdit={(id) => { setEditRuloId(id); setShowRuloForm(true); setPrefillPos(null); }}
            onDelete={deleteRulo}
          />
        </div>
      ) : (
        <div style={{ flex: 1, padding: "12px 14px", background: T.bg, overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
          {artists.length === 0 && (
            <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 40 }}>Sin artistas en este día</div>
          )}
          {artists.length > 0 && (
            <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Ficha compacta</span>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {artists.map((a) => (
              <CompactArtistCard
                key={a.id}
                a={a}
                fest={fest}
                day={day}
                checks={checks}
                toggleCheck={toggleCheck}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setShowAdd(true)} style={{ ...S.addBtn, flex: 1, marginTop: 0 }}>+ Añadir artista</button>
            {artists.length > 0 && stage.days.length > 1 && (
              <button onClick={() => { setShowCopy(true); setCopySelected({}); setCopyTargetDays({}); }} style={{ ...S.addBtn, flex: 1, marginTop: 0, color: "#7c3aed", borderColor: "#ddd6fe", background: "#f5f3ff" }}>
                Copiar al día →
              </button>
            )}
          </div>
        </div>
      )}
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}

      {showCopy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setShowCopy(false)}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 -4px 32px rgba(0,0,0,0.18)", maxHeight: "80dvh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: "#e2e8f0", borderRadius: 2, margin: "0 auto 20px" }} />
            <div style={{ fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.06em", color: "#0f172a", marginBottom: 4 }}>Copiar artistas</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>Selecciona los artistas a copiar y los días destino.</div>

            <div style={{ fontSize: 9, color: "#7c3aed", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>ARTISTAS ({day.label})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
              {artists.map(a => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, background: copySelected[a.id] ? "#f5f3ff" : "#f8fafc", border: `1px solid ${copySelected[a.id] ? "#c4b5fd" : "#e2e8f0"}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!copySelected[a.id]} onChange={e => setCopySelected(p => ({ ...p, [a.id]: e.target.checked }))} style={{ accentColor: "#7c3aed", width: 16, height: 16 }} />
                  <span style={{ fontSize: 13, color: "#334155", fontFamily: "monospace", fontWeight: 700 }}>{a.artist || "—"}</span>
                  <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: "auto" }}>{a.console || ""}</span>
                </label>
              ))}
            </div>

            <div style={{ fontSize: 9, color: "#7c3aed", letterSpacing: "0.15em", fontWeight: 700, marginBottom: 8 }}>DÍAS DESTINO</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
              {stage.days.map((d, i) => {
                if (i === dayIdx) return null;
                const on = !!copyTargetDays[i];
                return (
                  <button key={d.id} onClick={() => setCopyTargetDays(p => ({ ...p, [i]: !p[i] }))} style={{
                    padding: "7px 16px", borderRadius: 20, fontSize: 12, fontFamily: "'Bebas Neue',sans-serif",
                    letterSpacing: "0.06em", cursor: "pointer", border: "none",
                    background: on ? "#7c3aed" : "#f1f5f9", color: on ? "#fff" : "#64748b",
                  }}>{d.label}</button>
                );
              })}
            </div>

            <button
              onClick={copyArtistsTodays}
              disabled={!Object.values(copySelected).some(Boolean) || !Object.values(copyTargetDays).some(Boolean)}
              style={{ width: "100%", padding: "14px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", opacity: (Object.values(copySelected).some(Boolean) && Object.values(copyTargetDays).some(Boolean)) ? 1 : 0.4 }}>
              Copiar
            </button>
          </div>
        </div>
      )}

      {showRuloForm && (
        <RuloFormModal
          initial={editRuloId ? ([...(day.rulos || []), ...(stage.rulos || [])].find(r => r.id === editRuloId) || null) : null}
          prefillPos={prefillPos}
          onSave={saveRulo}
          onClose={() => { setShowRuloForm(false); setEditRuloId(null); setPrefillPos(null); }}
        />
      )}
    </div>
  );
}

/* ---------- small components ---------- */
function AddArtistScreen({ onAdd, onBack, initial }) {
  const [f, setF] = useState(initial ? { artist: initial.artist || "", console: initial.console || "", connection: initial.connection || "", signal: initial.signal || "", preset: initial.preset || "INITIAL", toLx: initial.toLx || "", toMon: initial.toMon || "", tecnico: initial.tecnico || "" } : { artist: "", console: "", connection: "", signal: "", preset: "INITIAL", toLx: "", toMon: "", tecnico: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!initial;

  async function confirm() {
    if (!f.artist.trim()) return;
    await onAdd(f);
  }

  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  return (
    <div style={{ background: T.card, borderRadius: 20, padding: 20, border: `2px dashed ${T.border}`, boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: isEdit ? (dark ? "#3730a3" : "#ede9fe") : (dark ? "#713f12" : "#fef9c3"), border: `1px solid ${isEdit ? (dark ? "#4f46e5" : "#c4b5fd") : (dark ? "#92400e" : "#fde68a")}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{isEdit ? "✏️" : "+"}</div>
        <div>
          <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.15em" }}>{isEdit ? "EDITAR ARTISTA" : "NUEVO ARTISTA"}</div>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>{isEdit ? f.artist || "—" : "Añadir al día"}</div>
        </div>
      </div>
      <input value={f.artist} onChange={e => set("artist", e.target.value)} placeholder="Nombre artista *" style={{ ...S.input, marginBottom: 8 }} autoFocus />
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input value={f.console} onChange={e => set("console", e.target.value)} placeholder="Consola" style={S.input} />
        <input value={f.signal} onChange={e => set("signal", e.target.value)} placeholder="Señal" style={S.input} />
      </div>
      <input value={f.connection} onChange={e => set("connection", e.target.value)} placeholder="Conexión" style={{ ...S.input, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input value={f.toLx} onChange={e => set("toLx", e.target.value)} placeholder="TO LX" style={S.input} />
        <input value={f.toMon} onChange={e => set("toMon", e.target.value)} placeholder="TO MON" style={S.input} />
        <input value={f.tecnico || ""} onChange={e => set("tecnico", e.target.value)} placeholder="Técnico" style={S.input} />
      </div>
      <input value={f.preset} onChange={e => set("preset", e.target.value)} placeholder="Preset" style={{ ...S.input, marginBottom: 14 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={confirm} disabled={!f.artist.trim()} style={{ ...S.bigBtn, flex: 1, padding: "13px", marginTop: 0, opacity: f.artist.trim() ? 1 : 0.4 }}>{isEdit ? "Guardar cambios" : "Guardar artista"}</button>
        <button onClick={onBack} style={{ ...S.navBtn, flex: 0.5 }}>‹ Volver</button>
      </div>
    </div>
  );
}

function ShareModal({ fest, onClose }) {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(fest))));
  const url = `${window.location.origin}/FEST-HANDOVER/?fest=${encoded}`;
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState(false);
  const canvasRef = useRef(null);
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);

  useEffect(() => {
    if (canvasRef.current) {
      setQrError(false);
      QRCode.toCanvas(canvasRef.current, url, {
        width: 220, margin: 2,
        color: { dark: dark ? "#f1f5f9" : "#0f172a", light: dark ? "#1e293b" : "#ffffff" },
      }).catch(() => setQrError(true));
    }
  }, [url, dark]);

  function copy() {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: T.card, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.15em" }}>COMPARTIR</div>
            <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.04em" }}>{fest.name}</div>
          </div>
          <button onClick={onClose} style={S.iconBtn}>✕</button>
        </div>
        {qrError ? (
          <div style={{ textAlign: "center", marginBottom: 16, padding: "24px 16px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 13, color: T.text2, fontFamily: "monospace", lineHeight: 1.5 }}>El festival tiene demasiados datos para generar un QR.<br/>Usa el enlace para compartirlo.</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <canvas ref={canvasRef} style={{ borderRadius: 12, border: `1px solid ${T.border}` }} />
            <div style={{ fontSize: 11, color: T.text4, marginTop: 8 }}>Escanea para importar el festival</div>
          </div>
        )}
        <div style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, wordBreak: "break-all", fontSize: 10, color: T.text3, maxHeight: 60, overflow: "hidden" }}>{url.slice(0, 120)}…</div>
        <button onClick={copy} style={{ ...S.bigBtn, marginTop: 0, background: copied ? "#16a34a" : (dark ? "#334155" : "#0f172a") }}>
          {copied ? "✓ Copiado" : "Copiar URL"}
        </button>
        <div style={{ fontSize: 10, color: T.text4, textAlign: "center", marginTop: 10 }}>Al abrir la URL, el festival se importa automáticamente</div>
      </div>
    </div>
  );
}

function ChainBox({ label, value, color, big }) {
  return (
    <div style={{ flex: big ? 1.4 : 1, background: "#f8fafc", border: `1px solid ${color}30`, borderRadius: 10, padding: "9px 7px", textAlign: "center", minWidth: 0 }}>
      <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color, fontFamily: "monospace", fontWeight: 700, wordBreak: "break-word", lineHeight: 1.3 }}>{value}</div>
    </div>
  );
}
function ChainArrow({ color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0 2px", gap: 2 }}>
      <div style={{ width: 10, height: 1, background: `${color}55`, borderRadius: 1 }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: `${color}55` }} />
      <div style={{ width: 10, height: 1, background: `${color}55`, borderRadius: 1 }} />
    </div>
  );
}
function RouteChip({ icon, label, value, color }) {
  const { dark } = useTheme(); const T = dark ? DK : LT;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${color}${dark ? "22" : "0d"}`, border: `1px solid ${color}${dark ? "55" : "30"}`, borderRadius: 10, padding: "9px 12px" }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 8, color, letterSpacing: "0.15em", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: T.text2, fontFamily: "monospace", lineHeight: 1.4, wordBreak: "break-word" }}>{value}</div>
      </div>
    </div>
  );
}

function ExtraSlots({ slots, onAdd, onDel, onEdit }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNL] = useState("");
  const [newValue, setNV] = useState("");
  const [editingId, setEditId] = useState(null);
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  const slotBg = dark ? "#1e3a5f" : "#eff6ff";
  const slotBorder = dark ? "#2563eb55" : "#bfdbfe";
  const slotLabel = dark ? "#93c5fd" : "#2563eb";
  const slotText = dark ? "#bfdbfe" : "#1e3a5f";

  function confirmAdd() {
    if (!newLabel.trim()) return;
    onAdd(newLabel, newValue); setNL(""); setNV(""); setAdding(false);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: slotLabel, letterSpacing: "0.15em", marginBottom: 7, fontWeight: 700 }}>CAMPOS EXTRA</div>
      {slots.map(s => (
        <div key={s.id} style={{ marginBottom: 7 }}>
          {editingId === s.id ? (
            <div style={{ background: slotBg, border: `1px solid ${slotBorder}`, borderRadius: 10, padding: 10 }}>
              <input value={s.label} onChange={e => onEdit(s.id, "label", e.target.value)} style={{ ...S.input, marginBottom: 6, fontWeight: 700 }} placeholder="Etiqueta" />
              <input value={s.value} onChange={e => onEdit(s.id, "value", e.target.value)} style={{ ...S.input, marginBottom: 8 }} placeholder="Valor" />
              <button onClick={() => setEditId(null)} style={S.smBtn}>Hecho</button>
            </div>
          ) : (
            <div onClick={() => setEditId(s.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: slotBg, border: `1px solid ${slotBorder}`, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 8, color: slotLabel, letterSpacing: "0.15em", fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: slotText, fontFamily: "monospace", marginTop: 2, wordBreak: "break-word" }}>{s.value || "—"}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDel(s.id); }} style={S.iconBtn}>×</button>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <div style={{ background: slotBg, border: `1px solid ${slotBorder}`, borderRadius: 10, padding: 10 }}>
          <input value={newLabel} onChange={e => setNL(e.target.value)} placeholder="Etiqueta (RF, Backline…)" autoFocus style={{ ...S.input, marginBottom: 6, fontWeight: 700 }} />
          <input value={newValue} onChange={e => setNV(e.target.value)} placeholder="Valor" onKeyDown={e => { if (e.key === "Enter") confirmAdd(); }} style={{ ...S.input, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={confirmAdd} style={{ ...S.smBtn, background: "#2563eb", color: "#fff", flex: 1 }}>Añadir</button>
            <button onClick={() => { setAdding(false); setNL(""); setNV(""); }} style={{ ...S.smBtn, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...S.addBtn, color: slotLabel, borderColor: slotBorder, background: slotBg }}>+ Nuevo campo</button>
      )}
    </div>
  );
}

function FohNotes({ notes, onAdd, onDel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  const noteBg = dark ? "#292524" : "#fffbeb";
  const noteBorder = dark ? "#92400e" : "#fcd34d";
  const noteText = dark ? "#fde68a" : "#92400e";
  const noteLabel = dark ? "#fbbf24" : "#d97706";

  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ fontSize: 9, color: noteLabel, letterSpacing: "0.15em", marginBottom: 7, fontWeight: 700 }}>NOTAS FOH (turno)</div>
      {notes.map((n, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
          <div style={{ flex: 1, fontSize: 12, color: noteText, lineHeight: 1.5, padding: "7px 10px", background: noteBg, borderLeft: `2px solid ${noteBorder}`, borderRadius: "0 6px 6px 0" }}>{n.text}</div>
          <button onClick={() => onDel(i)} style={S.iconBtn}>×</button>
        </div>
      ))}
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAdd(draft); setDraft(""); setEditing(false); } }}
            placeholder="Nota para tu compañero…"
            style={{ ...S.input, flex: 1, resize: "none", borderColor: noteBorder }} />
          <button onClick={() => { onAdd(draft); setDraft(""); setEditing(false); }} style={{ ...S.smBtn, background: "#f59e0b", color: "#fff" }}>OK</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={{ ...S.addBtn, color: noteLabel, borderColor: noteBorder, background: noteBg, marginTop: 0 }}>+ Añadir nota</button>
      )}
    </div>
  );
}

/* ---------- fest edit modal ---------- */
function FestEditModal({ fest, onSave, onClose }) {
  const [name, setName] = useState(fest.name);

  function save() {
    if (!name.trim()) return;
    onSave({ ...fest, name: name.trim() });
  }

  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: T.card, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480 }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.05em" }}>EDITAR FESTIVAL</div>
          <button onClick={onClose} style={S.iconBtn}>✕</button>
        </div>

        <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>NOMBRE</div>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...S.input, marginBottom: 20 }} autoFocus />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "14px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: T.text2 }}>
            Cancelar
          </button>
          <button onClick={save} disabled={!name.trim()} style={{ flex: 1, padding: "14px", background: dark ? "#334155" : "#0f172a", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: name.trim() ? "pointer" : "not-allowed", fontFamily: "'JetBrains Mono',monospace", color: "#fff", opacity: name.trim() ? 1 : 0.4 }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- compact artist card (ficha compacta) ---------- */
function CompactArtistCard({ a, fest, day, checks, toggleCheck, onSelect }) {
  const k = `${fest.id}__${day.id}__${a.id}`;
  const scDone = !!checks[`${k}__sc`];
  const showDone = !!checks[`${k}__show`];
  const ok = scDone && showDone;
  const color = sigColor(a.signal);
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);

  const cardBg = T.card;
  const cardText = T.text;
  const borderC = T.border;
  const chipBg = T.card2;
  const chipBorder = T.border;
  const textTertiary = T.text4;
  const textSecondary = T.text3;
  const accentLeft = ok ? "#16a34a" : color;

  return (
    <div style={{ background: T.bg, borderRadius: 14, padding: "0.75rem" }}>

      {/* main card */}
      <div
        onClick={() => onSelect(a.id)}
        style={{
          border: `0.5px solid ${borderC}`,
          borderLeft: `3px solid ${accentLeft}`,
          borderRadius: 12,
          padding: "0.85rem 1rem",
          background: cardBg,
          color: cardText,
          cursor: "pointer",
          transition: "background 0.2s, color 0.2s, border-color 0.2s",
        }}>

        {/* name + console */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 21, fontWeight: 500, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.artist || "—"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexShrink: 0, lineHeight: 1 }}>
            {a.tecnico && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>técnico</div>
                <div style={{ fontSize: 13, fontWeight: 500, fontFamily: "monospace" }}>{noInfo(a.tecnico)}</div>
              </div>
            )}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: textTertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>mesa</div>
              <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "monospace" }}>{noInfo(a.console) || "—"}</div>
            </div>
          </div>
        </div>

        {/* signal chain chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, margin: "10px 0", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "monospace", padding: "3px 8px", borderRadius: 6, background: chipBg, border: `0.5px solid ${chipBorder}`, color: cardText }}>
            {noInfo(a.connection) || "—"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span style={{ display: "block", width: 8, height: 1, background: textTertiary, opacity: 0.4, borderRadius: 1 }} />
            <span style={{ display: "block", width: 3, height: 3, borderRadius: "50%", background: textTertiary, opacity: 0.4 }} />
            <span style={{ display: "block", width: 8, height: 1, background: textTertiary, opacity: 0.4, borderRadius: 1 }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "monospace", padding: "3px 8px", borderRadius: 6, background: chipBg, border: `0.5px solid ${chipBorder}`, color }}>
            {noInfo(a.signal) || "—"}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
            <span style={{ display: "block", width: 8, height: 1, background: textTertiary, opacity: 0.4, borderRadius: 1 }} />
            <span style={{ display: "block", width: 3, height: 3, borderRadius: "50%", background: textTertiary, opacity: 0.4 }} />
            <span style={{ display: "block", width: 8, height: 1, background: textTertiary, opacity: 0.4, borderRadius: 1 }} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "monospace", padding: "3px 8px", borderRadius: 6, background: chipBg, border: `0.5px solid ${chipBorder}`, color: cardText }}>
            {noInfo(a.console) || "—"}
          </span>
          {a.preset && (
            <span style={{
              marginLeft: "auto", fontSize: 11, fontWeight: 500, fontFamily: "monospace",
              padding: "3px 8px", borderRadius: 6,
              background: a.presetOk ? "#f0fdf4" : chipBg,
              border: `0.5px solid ${a.presetOk ? "#16a34a" : chipBorder}`,
              color: a.presetOk ? "#16a34a" : textSecondary,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}>
              ⚙ {noInfo(a.preset)}
            </span>
          )}
        </div>

        {/* footer: lx · mon · ok/checks */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: textSecondary, paddingTop: 8, borderTop: `0.5px solid ${borderC}` }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: a.toLx ? 1 : 0.5 }}>
            💡 LX <strong style={{ color: cardText, fontWeight: 500 }}>{noInfo(a.toLx) || "No"}</strong>
          </span>
          <span style={{ color: textTertiary }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, opacity: a.toMon ? 1 : 0.5 }}>
            🎧 Mon <strong style={{ color: cardText, fontWeight: 500 }}>{noInfo(a.toMon) || "No"}</strong>
          </span>
          {ok && (
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "1px 7px" }}>✓ OK</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- rulos ---------- */
const RULO_TYPES = ["OPTOCORE", "RJ / CAT6", "FIBRA", "OPTICALCON", "MULTIPAR", "ETHERNET", "OTRO"];

function ruloColor(type) {
  const t = (type || "").toUpperCase();
  if (t.includes("OPTOCORE") || t.includes("FIBRA")) return "#16a34a";
  if (t.includes("RJ") || t.includes("CAT")) return "#7c3aed";
  if (t.includes("OPTICAL")) return "#2563eb";
  if (t.includes("MULTIPAR")) return "#ea580c";
  if (t.includes("ETHERNET")) return "#0891b2";
  return "#64748b";
}

const POSITIONS = ["SR", "SL"];

function RulosView({ rulos, permRulos, onAdd, onEdit, onDelete }) {
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);
  const [confirmId, setConfirmId] = useState(null);
  const [confirmIsPerm, setConfirmIsPerm] = useState(false);
  const [sheetRulo, setSheetRulo] = useState(null);

  const allRulos = [
    ...permRulos.map(r => ({ ...r, _perm: true })),
    ...rulos.map(r => ({ ...r, _perm: false })),
  ];
  const byPos = pos => allRulos.filter(r => r.position === pos);
  const noPos = allRulos.filter(r => !POSITIONS.includes(r.position));

  function RuloChip({ r }) {
    const color = ruloColor(r.type);
    return (
      <div onClick={() => setSheetRulo(r)}
        style={{ background: dark ? `${color}14` : `${color}0a`, border: `1px solid ${dark ? color + "55" : color + "28"}`, borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: r.desc || r.note ? 4 : 0 }}>
          {r._perm && <span style={{ fontSize: 10, lineHeight: 1 }}>📌</span>}
          <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: "monospace", letterSpacing: "0.04em" }}>{r.type || "CABLE"}{r.qty ? ` ×${r.qty}` : ""}</span>
        </div>
        {r.desc && <div style={{ fontSize: 12, color: T.text2, fontFamily: "monospace", lineHeight: 1.3 }}>{r.desc}</div>}
        {r.note && <div style={{ fontSize: 10, color: "#b45309", marginTop: 3 }}>⚠ {r.note}</div>}
      </div>
    );
  }

  return (
    <div>
      {/* Stage plot SR / SL */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.12em", marginBottom: 6, fontWeight: 700, textAlign: "center" }}>ESCENARIO</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {POSITIONS.map(pos => {
            const posRulos = byPos(pos);
            return (
              <div key={pos} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", minHeight: 70 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 8px", borderBottom: `1px solid ${T.border2}`, background: T.card2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: T.text3, letterSpacing: "0.08em" }}>{pos}</span>
                  <button onClick={() => onAdd(pos)} style={{ background: "none", border: "none", color: T.text4, fontSize: 16, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>+</button>
                </div>
                <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                  {posRulos.length === 0
                    ? <div style={{ fontSize: 10, color: T.text4, textAlign: "center", padding: "8px 0" }}>—</div>
                    : posRulos.map(r => <RuloChip key={r.id} r={r} />)
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sin posición — chips compactos */}
      {noPos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.12em", marginBottom: 6, fontWeight: 700 }}>GENERAL</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {noPos.map(r => <RuloChip key={r.id} r={r} />)}
          </div>
        </div>
      )}

      <button onClick={() => onAdd(null)} style={{ ...S.addBtn, marginTop: 6 }}>+ Añadir conexión</button>

      {/* detail sheet */}
      {sheetRulo && (() => {
        const r = sheetRulo;
        const color = ruloColor(r.type);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end" }}
            onClick={() => setSheetRulo(null)}>
            <div style={{ background: T.card, borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: 36, height: 4, background: T.border, borderRadius: 2, margin: "0 auto 16px" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                {r._perm && <span>📌</span>}
                <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "monospace", letterSpacing: "0.04em" }}>{r.type || "CABLE"}{r.qty ? ` ×${r.qty}` : ""}</span>
                {r.position && <span style={{ fontSize: 11, color: T.text4, fontFamily: "monospace", marginLeft: "auto" }}>{r.position}</span>}
              </div>
              {r.desc && <div style={{ fontSize: 15, color: T.text, fontFamily: "monospace", lineHeight: 1.4, marginBottom: 10 }}>{r.desc}</div>}
              {r.note && <div style={{ fontSize: 12, color: "#b45309", lineHeight: 1.4, padding: "8px 10px", background: dark ? "#78350f33" : "#fffbeb", borderLeft: "3px solid #fcd34d", borderRadius: "0 8px 8px 0", marginBottom: 10 }}>⚠ {r.note}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button onClick={() => { setSheetRulo(null); onEdit(r.id); }}
                  style={{ flex: 1, padding: "13px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 14, color: T.text2, cursor: "pointer", fontFamily: "monospace" }}>✏️ Editar</button>
                <button onClick={() => { setSheetRulo(null); setConfirmId(r.id); setConfirmIsPerm(r._perm); }}
                  style={{ flex: 1, padding: "13px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, fontSize: 14, color: "#ef4444", cursor: "pointer", fontFamily: "monospace" }}>🗑 Borrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setConfirmId(null)}>
          <div style={{ background: T.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 320, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 10 }}>🗑️</div>
            <div style={{ fontSize: 13, color: T.text3, textAlign: "center", marginBottom: 20 }}>¿Borrar esta conexión?</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: "13px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, fontSize: 13, cursor: "pointer", fontFamily: "monospace", color: T.text2 }}>Cancelar</button>
              <button onClick={() => { onDelete(confirmId, confirmIsPerm); setConfirmId(null); }} style={{ flex: 1, padding: "13px", background: "#ef4444", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", color: "#fff" }}>Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuloCard({ r, onEdit, onDelete }) {
  const { dark } = useTheme(); const T = dark ? DK : LT;
  const color = ruloColor(r.type);
  const bg = dark ? `${color}18` : `${color}0d`;
  const border = dark ? `${color}44` : `${color}28`;

  return (
    <div style={{ background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
      {/* colored top accent + type badge */}
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: "12px 14px" }}>
        {/* type + qty + actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", padding: "3px 9px", borderRadius: 8, background: bg, border: `1px solid ${border}`, color, letterSpacing: "0.04em" }}>
              {r.type || "CABLE"}
            </span>
            {r.qty && (
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>{r.qty}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onEdit} style={{ background: T.card2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "4px 9px", fontSize: 12, color: T.text3, cursor: "pointer" }}>✏️</button>
            <button onClick={onDelete} style={{ background: "none", border: "none", padding: "4px 6px", fontSize: 14, color: "#94a3b8", cursor: "pointer" }}>×</button>
          </div>
        </div>

        {/* description */}
        {r.desc && (
          <div style={{ fontSize: 15, fontWeight: 500, color: T.text, marginBottom: 10, lineHeight: 1.3 }}>{noInfo(r.desc)}</div>
        )}

        {/* DE → PARA diagram */}
        {(r.from || r.to) && (
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginBottom: r.note ? 10 : 0 }}>
            <div style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: "10px 0 0 10px", padding: "8px 10px" }}>
              <div style={{ fontSize: 8, color, letterSpacing: "0.12em", fontWeight: 700, marginBottom: 3 }}>DE</div>
              <div style={{ fontSize: 12, color: T.text, fontFamily: "monospace", lineHeight: 1.3 }}>{noInfo(r.from) || "—"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, background: bg, border: `1px solid ${border}`, borderLeft: "none", borderRight: "none", padding: "0 6px" }}>
              <div style={{ width: 6, height: 1, background: color, opacity: 0.5, borderRadius: 1 }} />
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: color, opacity: 0.5 }} />
              <div style={{ width: 6, height: 1, background: color, opacity: 0.5, borderRadius: 1 }} />
            </div>
            <div style={{ flex: 1, background: bg, border: `1px solid ${border}`, borderRadius: "0 10px 10px 0", padding: "8px 10px" }}>
              <div style={{ fontSize: 8, color, letterSpacing: "0.12em", fontWeight: 700, marginBottom: 3 }}>PARA</div>
              <div style={{ fontSize: 12, color: T.text, fontFamily: "monospace", lineHeight: 1.3 }}>{noInfo(r.to) || "—"}</div>
            </div>
          </div>
        )}

        {/* note */}
        {r.note && (
          <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5, padding: "6px 10px", background: "#fffbeb", borderLeft: "2px solid #fcd34d", borderRadius: "0 6px 6px 0", marginTop: r.from || r.to ? 8 : 0 }}>
            ⚠️ {r.note}
          </div>
        )}
      </div>
    </div>
  );
}

function RuloFormModal({ initial, prefillPos, onSave, onClose }) {
  const isEdit = !!initial;
  const [f, setF] = useState(initial ? {
    type: initial.type || "OPTOCORE",
    qty: initial.qty || "",
    desc: initial.desc || "",
    note: initial.note || "",
    position: initial.position || "",
    permanent: initial.permanent || false,
  } : { type: "OPTOCORE", qty: "", desc: "", note: "", position: prefillPos || "", permanent: false });

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const { dark } = useTheme(); const T = dark ? DK : LT; const S = makeS(T);

  function confirm() {
    if (!f.desc.trim() && !f.qty.trim()) return;
    onSave(f);
  }

  const valid = f.desc.trim() || f.qty.trim();
  const color = ruloColor(f.type);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: T.card, borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "90dvh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, color: T.text4, letterSpacing: "0.15em" }}>CONEXIÓN</div>
            <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: T.text, letterSpacing: "0.04em" }}>
              {isEdit ? "EDITAR RULO" : "NUEVO RULO"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.text4, fontSize: 20, cursor: "pointer", padding: "6px 8px" }}>✕</button>
        </div>

        {/* type selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 8 }}>TIPO DE CABLE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {RULO_TYPES.map(t => {
              const tc = ruloColor(t);
              const active = f.type === t;
              return (
                <button key={t} onClick={() => set("type", t)} style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 12, fontFamily: "monospace",
                  border: `1.5px solid ${active ? tc : T.border}`,
                  background: active ? `${tc}18` : T.card2,
                  color: active ? tc : T.text3,
                  cursor: "pointer", fontWeight: active ? 700 : 400,
                }}>{t}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 0.4 }}>
            <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>CANTIDAD</div>
            <input value={f.qty} onChange={e => set("qty", e.target.value)} placeholder="2×" style={S.input} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>DESCRIPCIÓN</div>
            <input value={f.desc} onChange={e => set("desc", e.target.value)} placeholder="Ej: HMA OPTOCORE Festival Box" style={S.input} autoFocus />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 6 }}>NOTA (opcional)</div>
          <input value={f.note} onChange={e => set("note", e.target.value)} placeholder="Ej: El sábado mover a Cultura Jaén SL" style={S.input} />
        </div>

        {/* posición en escenario */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.text4, letterSpacing: "0.1em", marginBottom: 8 }}>POSICIÓN EN ESCENARIO</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["SR", "SL"].map(pos => (
              <button key={pos} onClick={() => set("position", f.position === pos ? "" : pos)} style={{
                flex: 1, padding: "10px", borderRadius: 10, fontSize: 13, fontFamily: "monospace", fontWeight: 700,
                border: `1.5px solid ${f.position === pos ? color : T.border}`,
                background: f.position === pos ? `${color}18` : T.card2,
                color: f.position === pos ? color : T.text3, cursor: "pointer",
              }}>{pos}</button>
            ))}
          </div>
        </div>

        {/* permanente */}
        <label style={{ display: "flex", alignItems: "center", gap: 12, background: f.permanent ? "#fef3c7" : T.card2, border: `1px solid ${f.permanent ? "#fcd34d" : T.border}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", marginBottom: 20 }}>
          <input type="checkbox" checked={!!f.permanent} onChange={e => set("permanent", e.target.checked)} style={{ accentColor: "#d97706", width: 18, height: 18 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.permanent ? "#92400e" : T.text, fontFamily: "monospace" }}>📌 Rulo permanente</div>
            <div style={{ fontSize: 11, color: f.permanent ? "#b45309" : T.text4, marginTop: 2 }}>Visible en todos los días del stage</div>
          </div>
        </label>

        <button onClick={confirm} disabled={!valid} style={{ ...S.bigBtn, marginTop: 0, opacity: valid ? 1 : 0.4 }}>
          {isEdit ? "GUARDAR CAMBIOS" : "AÑADIR CONEXIÓN"}
        </button>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
function makeS(T) {
  return {
    app: { height: "100dvh", overflow: "hidden", background: T.bg, fontFamily: "'JetBrains Mono',monospace", width: "100%", color: T.text },
    festCard: { display: "flex", alignItems: "center", gap: 12, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
    bigBtn: { width: "100%", padding: "18px", background: T.bg === DK.bg ? "#334155" : "#0f172a", color: T.bg === DK.bg ? "#f1f5f9" : "#fff", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.1em", cursor: "pointer", marginTop: 10 },
    iconBtn: { background: "none", border: "none", color: T.text4, fontSize: 20, cursor: "pointer", padding: "6px 8px" },
    backBtn: { background: T.card2, border: `1px solid ${T.border}`, color: T.text2, fontSize: 22, width: 44, height: 44, borderRadius: 12, cursor: "pointer", lineHeight: 1 },
    input: { width: "100%", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 16, padding: "13px 14px", fontFamily: "monospace", outline: "none" },
    daySection: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 14 },
    artForm: { background: T.card2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 12 },
    addBtn: { width: "100%", padding: "14px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text3, fontSize: 14, cursor: "pointer", fontFamily: "monospace", marginTop: 8 },
    smBtn: { padding: "10px 16px", background: T.card2, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text2, fontSize: 13, cursor: "pointer" },
    topBar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 8px", position: "sticky", top: 0, background: T.card, zIndex: 10, borderBottom: `1px solid ${T.border}` },
    syncBtn: { background: "none", border: `1px solid ${T.border}`, borderRadius: 10, color: T.text4, fontSize: 11, padding: "8px 11px", cursor: "pointer" },
    navBtn: { flex: 1, padding: "16px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, color: T.text2, fontSize: 14, cursor: "pointer", fontFamily: "monospace" },
  };
}

function Style({ dark }) {
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  }, []);
  useEffect(() => {
    document.body.style.background = dark ? DK.bg : LT.bg;
  }, [dark]);
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
    ::-webkit-scrollbar { width:4px; height:4px; }
    ::-webkit-scrollbar-thumb { background:#334155; border-radius:2px; }
    input::placeholder, textarea::placeholder { color:#64748b; }
    input, textarea, select { font-size:16px !important; }
    button { font-family:'JetBrains Mono',monospace; }
  `}</style>;
}
