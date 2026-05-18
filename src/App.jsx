import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

/* ---------- seed ---------- */
const SEED = [{
  id: "ejemplo_fest", name: "FESTIVAL EJEMPLO",
  days: [
    {
      id: "day1", label: "DÍA 1", artists: [
        { id: "s1", artist: "ARTISTA A", console: "SSL 9000", connection: "OPTO DUO 1/2 (point-point)", signal: "AES 1/2", preset: "ARTISTA A", presetOk: true, toLx: "SMPT 1 (naranja)", toMon: "", comments: ["Mesa compartida con artista siguiente", "Señal de video directo desde FOH"], extraSlots: [{ id: "e1", label: "RF", value: "Shure ULXD4Q · CH 38-40" }] },
        { id: "s2", artist: "ARTISTA B", console: "DiGiCo SD10", connection: "MADI 1-4 Festival Box", signal: "MADI", preset: "INITIAL", presetOk: false, toLx: "TIMECODE", toMon: "CH16 → MON WORLD", comments: [], extraSlots: [] },
        { id: "s3", artist: "ARTISTA C", console: "Avid S6L", connection: "HMA 1/2 (ALL DAY)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
      ]
    },
    {
      id: "day2", label: "DÍA 2", artists: [
        { id: "s4", artist: "ARTISTA D", console: "Yamaha PM5", connection: "RJ 1/2 SP (Festival Box)", signal: "AES 1/2", preset: "ARTISTA D", presetOk: true, toLx: "SMPT 1 & 2", toMon: "", comments: ["Comparte GAIN con monitor"], extraSlots: [] },
        { id: "s5", artist: "ARTISTA E", console: "DiGiCo SD7", connection: "OPTO DUO (anillo)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [{ id: "e2", label: "IEM", value: "Sennheiser 2000 · CH 28" }] },
      ]
    },
  ],
}];

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

/* ---------- Supabase storage ---------- */
async function loadFests(userId) {
  const { data } = await supabase
    .from("festivals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data || [];
}

async function saveFest(userId, fest) {
  await supabase.from("festivals").upsert({
    id: fest.id,
    user_id: userId,
    name: fest.name,
    days: fest.days,
  });
}

async function deleteFest(festId) {
  await supabase.from("festivals").delete().eq("id", festId);
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
  const [dayIdx, setDayIdx] = useState(0);
  const [artIdx, setArtIdx] = useState(0);
  const [notes, setNotesState] = useState({});
  const [checks, setChecksState] = useState({});
  const [slots, setSlotsState] = useState({});
  const [screen, setScreen] = useState("home");
  const [lastSync, setLastSync] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
      // Check URL for shared festival
      const params = new URLSearchParams(window.location.search);
      const shared = params.get("fest");

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
          if (imported && imported.id && imported.name) {
            const exists = f.some(x => x.id === imported.id);
            if (!exists) {
              await saveFest(userId, imported);
              f = await loadFests(userId);
            }
          }
        } catch { }
        window.history.replaceState({}, "", window.location.pathname);
      }

      const ud = await loadUserData(userId);
      setFests(f);
      setNotesState(ud.notes || {});
      setChecksState(ud.checks || {});
      setSlotsState(ud.slots || {});
      setLastSync(new Date());
      } catch (err) {
        setLoadError(err.message || "Error al cargar datos");
      }
    })();
  }, [userId]);

  async function refresh() {
    const f = await loadFests(userId);
    const ud = await loadUserData(userId);
    setFests(f);
    setNotesState(ud.notes || {});
    setChecksState(ud.checks || {});
    setSlotsState(ud.slots || {});
    setLastSync(new Date());
  }

  async function persistFests(next) {
    setFests(next);
  }

  async function addFest(fest) {
    await saveFest(userId, fest);
    setFests(prev => [...prev, fest]);
  }

  async function removeFest(id) {
    await deleteFest(id);
    setFests(prev => prev.filter(f => f.id !== id));
  }

  async function updateFest(updated) {
    await saveFest(userId, updated);
    setFests(prev => prev.map(f => f.id === updated.id ? updated : f));
  }

  async function updateNotes(n) {
    setNotesState(n);
    await saveUserData(userId, n, checks, slots);
  }

  async function toggleCheck(ckey) {
    const next = { ...checks, [ckey]: !checks[ckey] };
    setChecksState(next);
    await saveUserData(userId, notes, next, slots);
  }

  async function updateSlots(sl) {
    setSlotsState(sl);
    await saveUserData(userId, notes, checks, sl);
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

  return (
    <>
      <Style />
      <div style={S.app}>
        {screen === "home" && (
          <Home
            fests={fests}
            user={session.user}
            onOpen={(id) => { setFestId(id); setDayIdx(0); setArtIdx(0); setScreen("view"); }}
            onNew={() => setScreen("builder")}
            onDelete={removeFest}
            onLogout={logout}
          />
        )}
        {screen === "builder" && (
          <Builder
            onCancel={() => setScreen("home")}
            onSave={async (obj) => { await addFest(obj); setScreen("home"); }}
          />
        )}
        {screen === "view" && fest && (
          <FestView
            fest={fest}
            dayIdx={dayIdx} setDayIdx={setDayIdx}
            notes={notes} setNotes={updateNotes}
            checks={checks} toggleCheck={toggleCheck}
            slots={slots} setSlots={updateSlots}
            onEditFest={updateFest}
            onBack={() => setScreen("home")}
            onRefresh={refresh}
            lastSync={lastSync}
          />
        )}
      </div>
    </>
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
function Home({ fests, user, onOpen, onNew, onDelete, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", padding: "20px 20px 24px", overflow: "hidden" }}
      onClick={() => { menuOpen && setMenuOpen(false); }}>

      {/* header */}
      <div style={{ position: "relative", marginBottom: 20, flexShrink: 0 }}>
        {/* gear top-left */}
        <div style={{ position: "absolute", top: 0, left: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setEditMode(m => !m); }}
            style={{
              width: 38, height: 38, borderRadius: "50%", border: "2px solid #e2e8f0",
              background: editMode ? "#fef2f2" : "#f8fafc", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, color: editMode ? "#ef4444" : "#64748b",
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
              position: "absolute", right: 0, top: 46, background: "#fff",
              border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              padding: "6px", minWidth: 160, zIndex: 50,
            }}>
              <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid #f1f5f9", marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{user.user_metadata?.full_name || user.email}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{user.email}</div>
              </div>
              <button onClick={onLogout} style={{
                width: "100%", padding: "10px 12px", background: "none", border: "none",
                borderRadius: 8, color: "#ef4444", fontSize: 13, cursor: "pointer",
                textAlign: "left", fontFamily: "'JetBrains Mono',monospace",
              }}>Cerrar sesión</button>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.2em", marginBottom: 2 }}>FOH HANDOVER</div>
          <div style={{ fontSize: 32, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.05em", lineHeight: 1 }}>
            TUS <span style={{ color: "#f59e0b" }}>FESTIVALES</span>
          </div>
        </div>
      </div>

      {/* lista festivales */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 14 }}>
        {fests.map(f => {
          const total = f.days.reduce((s, d) => s + d.artists.length, 0);
          return (
            <div key={f.id} style={{ ...S.festCard, position: "relative", overflow: "visible" }}
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
                <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.04em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{f.days.length} días · {total} artistas</div>
              </div>
              {/* slot derecho — mismo ancho que el izquierdo */}
              <div style={{ width: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!editMode && <span style={{ color: "#cbd5e1", fontSize: 18 }}>›</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* botón fijo abajo */}
      <button onClick={onNew} style={{ ...S.bigBtn, marginTop: 0, flexShrink: 0 }}>+ CREAR FESTIVAL</button>

      {/* popup confirmación borrado */}
      {confirmId && (() => {
        const fest = fests.find(f => f.id === confirmId);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
            onClick={() => setConfirmId(null)}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 16, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", textAlign: "center", letterSpacing: "0.04em", marginBottom: 8 }}>
                ¿Borrar festival?
              </div>
              <div style={{ fontSize: 13, color: "#64748b", textAlign: "center", marginBottom: 24, lineHeight: 1.5 }}>
                Vas a borrar <strong style={{ color: "#0f172a" }}>{fest?.name}</strong>. Esta acción no se puede deshacer.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setConfirmId(null)} style={{ flex: 1, padding: "14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 14, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", color: "#334155" }}>
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
    </div>
  );
}

/* ---------- builder helpers ---------- */
function BuilderNotes({ comments, onAdd, onDel }) {
  const [draft, setDraft] = useState("");
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>NOTAS PREVIAS</div>
      {comments.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
          <div style={{ flex: 1, fontSize: 13, color: "#475569", lineHeight: 1.4, padding: "7px 10px", background: "#f1f5f9", borderLeft: "2px solid #cbd5e1", borderRadius: "0 6px 6px 0" }}>{c}</div>
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

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onCancel} style={S.backBtn}>‹</button>
        <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.05em" }}>NUEVO FESTIVAL</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.1em", marginBottom: 6 }}>NOMBRE</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Mad Cool 26" style={S.input} />
      </div>

      {days.map((d, di) => (
        <div key={d.id} style={S.daySection}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input value={d.label} onChange={e => setDayLabel(di, e.target.value)} style={{ ...S.input, flex: 1, fontWeight: 700 }} />
            <button onClick={() => setExpDay(expDay === di ? -1 : di)} style={S.smBtn}>{expDay === di ? "▾" : "▸"}</button>
            {days.length > 1 && <button onClick={() => delDay(di)} style={S.iconBtn}>🗑</button>}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{d.artists.length} artistas</div>

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
                    <div style={{ fontSize: 9, color: "#2563eb", letterSpacing: "0.1em", marginBottom: 6 }}>CAMPOS EXTRA</div>
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
      <button onClick={() => valid && onSave({ id: uid(), name: name.trim(), days })} disabled={!valid}
        style={{ ...S.bigBtn, marginTop: 24, opacity: valid ? 1 : 0.4 }}>
        GUARDAR FESTIVAL
      </button>
    </div>
  );
}

/* ---------- fest view ---------- */
function FestView({ fest, dayIdx, setDayIdx, notes, setNotes, checks, toggleCheck, slots, setSlots, onEditFest, onBack, onRefresh, lastSync }) {
  const [showShare, setShowShare] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const day = fest.days[dayIdx];
  const artists = day.artists;
  const art = artists.find(a => a.id === selectedId) || null;

  const ckey = art ? `${fest.id}__${day.id}__${art.id}` : null;
  const done = ckey ? !!checks[ckey] : false;
  const myNotes = ckey ? (notes[ckey] || []) : [];
  const mySlots = ckey ? (slots[ckey] || []) : [];
  const sc = art ? sigColor(art.signal) : "#64748b";

  async function addArtistToDay(fields) {
    const newArt = { id: uid(), artist: fields.artist || "", console: fields.console || "", connection: fields.connection || "", signal: fields.signal || "", preset: fields.preset || "INITIAL", presetOk: false, toLx: fields.toLx || "", toMon: fields.toMon || "", comments: [], extraSlots: [] };
    const updatedDays = fest.days.map((d, i) => i === dayIdx ? { ...d, artists: [...d.artists, newArt] } : d);
    await onEditFest({ ...fest, days: updatedDays });
    setShowAdd(false);
    setSelectedId(newArt.id);
  }

  async function saveEditArtist(fields) {
    const updatedDays = fest.days.map((d, i) => i === dayIdx ? {
      ...d, artists: d.artists.map(a => a.id === editId ? { ...a, ...fields } : a)
    } : d);
    await onEditFest({ ...fest, days: updatedDays });
    setEditId(null);
  }

  async function deleteArtist(artId) {
    const updatedDays = fest.days.map((d, i) => i === dayIdx ? { ...d, artists: d.artists.filter(a => a.id !== artId) } : d);
    await onEditFest({ ...fest, days: updatedDays });
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
  const TopBar = ({ onBackBtn }) => (
    <div style={{ ...S.topBar, flexWrap: "wrap", rowGap: 8, padding: "10px 12px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
        <button onClick={onBackBtn} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.06em" }}>{fest.name}</div>
        <button onClick={() => setShowShare(true)} style={S.syncBtn}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="2"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="2"/></svg>
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", paddingBottom: 2 }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", flex: 1 }}>
          {fest.days.map((d, i) => {
            const dn = d.artists.filter(a => checks[`${fest.id}__${d.id}__${a.id}`]).length;
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
        </div>
        <button onClick={onRefresh} style={{ ...S.syncBtn, flexShrink: 0 }}>↻ {lastSync ? lastSync.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : ""}</button>
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
      <div style={{ flex: 1, padding: "12px 14px", background: "#f8fafc", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
        <div style={{
          background: "#fff", borderRadius: 20, padding: 20,
          border: `2px solid ${done ? "#86efac" : sc + "33"}`,
          boxShadow: done ? "0 0 0 4px #dcfce7" : "0 1px 8px rgba(0,0,0,0.07)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: sc, borderRadius: "20px 20px 0 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8 }}>
            <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em" }}>{day.label} · {artists.findIndex(a => a.id === art.id) + 1}/{artists.length}</div>
            <button onClick={() => toggleCheck(ckey)} style={{
              padding: "7px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
              background: done ? "#16a34a" : "#f1f5f9",
              color: done ? "#fff" : "#64748b",
              transition: "all 0.2s",
            }}>{done ? "✓ LISTO" : "marcar OK"}</button>
          </div>

          <div style={{ fontSize: 36, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.02em", lineHeight: 1, margin: "12px 0 4px" }}>{art.artist || "—"}</div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f8fafc", border: "1px solid #e2e8f0", padding: "4px 12px", borderRadius: 20, marginBottom: 20 }}>
            <span style={{ fontSize: 13 }}>🎛️</span>
            <span style={{ fontSize: 12, color: "#334155", fontFamily: "monospace", fontWeight: 700 }}>{art.console || "—"}</span>
          </div>

          <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em", marginBottom: 8 }}>CADENA DE SEÑAL</div>
          <div style={{ display: "flex", alignItems: "stretch", marginBottom: 18 }}>
            <ChainBox label="CONEXIÓN" value={art.connection || "—"} color="#7c3aed" />
            <ChainArrow color={sc} />
            <ChainBox label="SEÑAL" value={art.signal || "—"} color={sc} big />
            <ChainArrow color={sc} />
            <ChainBox label="MESA" value={art.console || "—"} color="#334155" />
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 12,
            background: art.presetOk ? "#f0fdf4" : "#f8fafc",
            border: `1px solid ${art.presetOk ? "#86efac" : "#e2e8f0"}`,
          }}>
            <div style={{ fontSize: 24 }}>{art.presetOk ? "✅" : "⚙️"}</div>
            <div>
              <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em" }}>PRESET</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: art.presetOk ? "#16a34a" : "#334155", fontFamily: "monospace" }}>{art.preset || "—"}</div>
            </div>
          </div>

          {(art.toLx || art.toMon) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
              {art.toLx && <RouteChip icon="💡" label="TO LX" value={art.toLx} color="#ea580c" />}
              {art.toMon && <RouteChip icon="🎧" label="TO MON" value={art.toMon} color="#7c3aed" />}
            </div>
          )}

          {(art.extraSlots || []).filter(s => s.label).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 12 }}>
              {(art.extraSlots || []).filter(s => s.label).map(s => (
                <RouteChip key={s.id} icon="📋" label={s.label} value={s.value || "—"} color="#2563eb" />
              ))}
            </div>
          )}

          {(art.comments || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em", marginBottom: 6 }}>NOTAS PREVIAS</div>
              {art.comments.map((c, i) => (
                <div key={i} style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, padding: "6px 10px", background: "#f8fafc", borderLeft: "2px solid #cbd5e1", borderRadius: "0 6px 6px 0", marginBottom: 4 }}>{c}</div>
              ))}
            </div>
          )}

          <ExtraSlots slots={mySlots} onAdd={addSlot} onDel={delSlot} onEdit={editSlot} />
          <FohNotes notes={myNotes} onAdd={addNote} onDel={delNote} />
        </div>
      </div>
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
    </div>
  );

  /* ---- list screen ---- */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden" }}>
      <TopBar onBackBtn={onBack} />
      <div style={{ flex: 1, padding: "12px 14px", background: "#f8fafc", overflowY: "auto", paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}>
        {artists.length === 0 && (
          <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, marginTop: 40 }}>Sin artistas en este día</div>
        )}
        {menuOpenId && <div onClick={() => setMenuOpenId(null)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {artists.map((a, i) => {
            const k = `${fest.id}__${day.id}__${a.id}`;
            const ok = !!checks[k];
            const color = sigColor(a.signal);
            return (
              <div key={a.id} style={{
                background: "#fff", borderRadius: 16,
                border: `1.5px solid ${ok ? "#86efac" : color + "33"}`,
                boxShadow: ok ? "0 0 0 3px #dcfce7" : "0 1px 6px rgba(0,0,0,0.06)",
                position: "relative", overflow: "visible",
              }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: color, borderRadius: "16px 0 0 16px" }} />
                {/* gear button */}
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === a.id ? null : a.id); }}
                  style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#94a3b8", padding: 4, lineHeight: 1, zIndex: 2 }}
                >⚙️</button>
                {/* dropdown menu */}
                {menuOpenId === a.id && (
                  <div onClick={e => e.stopPropagation()} style={{
                    position: "absolute", top: 32, right: 8, background: "#fff", borderRadius: 12,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1px solid #e2e8f0",
                    zIndex: 20, minWidth: 130, overflow: "hidden",
                  }}>
                    <button onClick={() => { setMenuOpenId(null); setEditId(a.id); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#334155", cursor: "pointer", fontFamily: "monospace" }}>✏️ Editar</button>
                    <div style={{ height: 1, background: "#f1f5f9" }} />
                    <button onClick={() => { setMenuOpenId(null); if (window.confirm(`¿Borrar "${a.artist}"?`)) deleteArtist(a.id); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#ef4444", cursor: "pointer", fontFamily: "monospace" }}>🗑 Borrar</button>
                  </div>
                )}
                {/* main tap area */}
                <div onClick={() => { setMenuOpenId(null); setSelectedId(a.id); }} style={{ padding: "14px 36px 14px 20px", cursor: "pointer" }}>
                  <div style={{ fontSize: 26, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.03em", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.artist || "—"}</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", marginTop: 4, display: "flex", gap: 10, alignItems: "center" }}>
                    <span>🎛️ {a.console || "—"}</span>
                    {a.signal && <span style={{ color }}>{a.signal}</span>}
                    {ok && <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "1px 7px", marginLeft: "auto" }}>✓ OK</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={() => setShowAdd(true)} style={{ ...S.addBtn, marginTop: 14 }}>+ Añadir artista</button>
      </div>
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
    </div>
  );
}

/* ---------- small components ---------- */
function AddArtistScreen({ onAdd, onBack, initial }) {
  const [f, setF] = useState(initial ? { artist: initial.artist || "", console: initial.console || "", connection: initial.connection || "", signal: initial.signal || "", preset: initial.preset || "INITIAL", toLx: initial.toLx || "", toMon: initial.toMon || "" } : { artist: "", console: "", connection: "", signal: "", preset: "INITIAL", toLx: "", toMon: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!initial;

  async function confirm() {
    if (!f.artist.trim()) return;
    await onAdd(f);
  }

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 20, border: "2px dashed #e2e8f0", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: isEdit ? "#ede9fe" : "#fef9c3", border: `1px solid ${isEdit ? "#c4b5fd" : "#fde68a"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{isEdit ? "✏️" : "+"}</div>
        <div>
          <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em" }}>{isEdit ? "EDITAR ARTISTA" : "NUEVO ARTISTA"}</div>
          <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>{isEdit ? f.artist || "—" : "Añadir al día"}</div>
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
  const url = `${window.location.href.split("?")[0]}?fest=${encoded}`;
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;

  function copy() {
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em" }}>COMPARTIR</div>
            <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.04em" }}>{fest.name}</div>
          </div>
          <button onClick={onClose} style={S.iconBtn}>✕</button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <img src={qrUrl} alt="QR" style={{ width: 220, height: 220, borderRadius: 12, border: "1px solid #e2e8f0" }} />
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>Escanea para importar el festival</div>
        </div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", marginBottom: 12, wordBreak: "break-all", fontSize: 10, color: "#64748b", maxHeight: 60, overflow: "hidden" }}>{url.slice(0, 120)}…</div>
        <button onClick={copy} style={{ ...S.bigBtn, marginTop: 0, background: copied ? "#16a34a" : "#0f172a" }}>
          {copied ? "✓ Copiado" : "Copiar URL"}
        </button>
        <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginTop: 10 }}>Al abrir la URL, el festival se importa automáticamente</div>
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
  return <div style={{ display: "flex", alignItems: "center", padding: "0 3px", color, fontSize: 13 }}>→</div>;
}
function RouteChip({ icon, label, value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: `${color}0d`, border: `1px solid ${color}30`, borderRadius: 10, padding: "9px 12px" }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 8, color, letterSpacing: "0.15em", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#334155", fontFamily: "monospace", lineHeight: 1.4, wordBreak: "break-word" }}>{value}</div>
      </div>
    </div>
  );
}

function ExtraSlots({ slots, onAdd, onDel, onEdit }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNL] = useState("");
  const [newValue, setNV] = useState("");
  const [editingId, setEditId] = useState(null);

  function confirmAdd() {
    if (!newLabel.trim()) return;
    onAdd(newLabel, newValue); setNL(""); setNV(""); setAdding(false);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color: "#2563eb", letterSpacing: "0.15em", marginBottom: 7, fontWeight: 700 }}>CAMPOS EXTRA</div>
      {slots.map(s => (
        <div key={s.id} style={{ marginBottom: 7 }}>
          {editingId === s.id ? (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 10 }}>
              <input value={s.label} onChange={e => onEdit(s.id, "label", e.target.value)} style={{ ...S.input, marginBottom: 6, fontWeight: 700 }} placeholder="Etiqueta" />
              <input value={s.value} onChange={e => onEdit(s.id, "value", e.target.value)} style={{ ...S.input, marginBottom: 8 }} placeholder="Valor" />
              <button onClick={() => setEditId(null)} style={S.smBtn}>Hecho</button>
            </div>
          ) : (
            <div onClick={() => setEditId(s.id)} style={{ display: "flex", alignItems: "center", gap: 10, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "9px 12px", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 8, color: "#2563eb", letterSpacing: "0.15em", fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: 13, color: "#1e3a5f", fontFamily: "monospace", marginTop: 2, wordBreak: "break-word" }}>{s.value || "—"}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); onDel(s.id); }} style={S.iconBtn}>×</button>
            </div>
          )}
        </div>
      ))}
      {adding ? (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: 10 }}>
          <input value={newLabel} onChange={e => setNL(e.target.value)} placeholder="Etiqueta (RF, Backline…)" autoFocus style={{ ...S.input, marginBottom: 6, fontWeight: 700 }} />
          <input value={newValue} onChange={e => setNV(e.target.value)} placeholder="Valor" onKeyDown={e => { if (e.key === "Enter") confirmAdd(); }} style={{ ...S.input, marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={confirmAdd} style={{ ...S.smBtn, background: "#2563eb", color: "#fff", flex: 1 }}>Añadir</button>
            <button onClick={() => { setAdding(false); setNL(""); setNV(""); }} style={{ ...S.smBtn, flex: 1 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ ...S.addBtn, color: "#2563eb", borderColor: "#bfdbfe", background: "#eff6ff" }}>+ Nuevo campo</button>
      )}
    </div>
  );
}

function FohNotes({ notes, onAdd, onDel }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <div>
      <div style={{ fontSize: 9, color: "#d97706", letterSpacing: "0.15em", marginBottom: 7, fontWeight: 700 }}>NOTAS FOH (turno)</div>
      {notes.map((n, i) => (
        <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 5 }}>
          <div style={{ flex: 1, fontSize: 12, color: "#92400e", lineHeight: 1.5, padding: "7px 10px", background: "#fffbeb", borderLeft: "2px solid #fcd34d", borderRadius: "0 6px 6px 0" }}>{n.text}</div>
          <button onClick={() => onDel(i)} style={S.iconBtn}>×</button>
        </div>
      ))}
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAdd(draft); setDraft(""); setEditing(false); } }}
            placeholder="Nota para tu compañero…"
            style={{ ...S.input, flex: 1, resize: "none", borderColor: "#fcd34d" }} />
          <button onClick={() => { onAdd(draft); setDraft(""); setEditing(false); }} style={{ ...S.smBtn, background: "#f59e0b", color: "#fff" }}>OK</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} style={{ ...S.addBtn, color: "#d97706", borderColor: "#fcd34d", background: "#fffbeb" }}>+ Añadir nota</button>
      )}
    </div>
  );
}

/* ---------- styles ---------- */
const S = {
  app: { height: "100dvh", overflow: "hidden", background: "#f8fafc", fontFamily: "'JetBrains Mono',monospace", width: "100%", color: "#0f172a" },
  festCard: { display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  bigBtn: { width: "100%", padding: "18px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 16, fontSize: 16, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.1em", cursor: "pointer", marginTop: 10 },
  iconBtn: { background: "none", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer", padding: "6px 8px" },
  backBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155", fontSize: 22, width: 44, height: 44, borderRadius: 12, cursor: "pointer", lineHeight: 1 },
  input: { width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, color: "#0f172a", fontSize: 16, padding: "13px 14px", fontFamily: "monospace", outline: "none" },
  daySection: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 14 },
  artForm: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12 },
  addBtn: { width: "100%", padding: "14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, color: "#64748b", fontSize: 14, cursor: "pointer", fontFamily: "monospace", marginTop: 8 },
  smBtn: { padding: "10px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, color: "#334155", fontSize: 13, cursor: "pointer" },
  topBar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 8px", position: "sticky", top: 0, background: "#fff", zIndex: 10, borderBottom: "1px solid #e2e8f0" },
  syncBtn: { background: "none", border: "1px solid #e2e8f0", borderRadius: 10, color: "#94a3b8", fontSize: 11, padding: "8px 11px", cursor: "pointer" },
  navBtn: { flex: 1, padding: "16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, color: "#334155", fontSize: 14, cursor: "pointer", fontFamily: "monospace" },
};

function Style() {
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
  }, []);
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&display=swap');
    * { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
    body { background:#f8fafc; }
    ::-webkit-scrollbar { width:4px; height:4px; }
    ::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:2px; }
    input::placeholder, textarea::placeholder { color:#cbd5e1; }
    input, textarea, select { font-size:16px !important; }
    button { font-family:'JetBrains Mono',monospace; }
  `}</style>;
}
