import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

/* ---------- seed ---------- */
const SEED = [{
  id: "cooltural25", name: "COOLTURAL FEST 25",
  days: [
    {
      id: "fri", label: "VIE 22", artists: [
        { id: "a1", artist: "ALIZZZ", console: "SSL100", connection: "OPTO DUO 1/2 (point-point)", signal: "AES 1/2", preset: "ALIZZZ", presetOk: true, toLx: "", toMon: "", comments: ["Posibilidad de dejar mesa de Alizzz en FOH para mañana con Amaia", "Señal de Video Direct → CAM FOH R (desde FOH)", "DIGICO Local cambiada a MADI", "Hay que subir la PM5 para arriba", "Cubre mesa debajo de tarima de LX", "Corriente de Shout sale desde Digico"], extraSlots: [] },
        { id: "a2", artist: "FRANZ FERDINAND", console: "Quantum 338", connection: "HMA 1/2 (ALL DAY)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "CH10 to MON WRLD (COMMS) console left", comments: [], extraSlots: [] },
        { id: "a3", artist: "LIA KALI", console: "SD9 (SR)", connection: "RJ 3/4 & 1 SP", signal: "AES 1/2", preset: "INITIAL", presetOk: false, toLx: "TIMECODE", toMon: "", comments: [], extraSlots: [] },
        { id: "a4", artist: "NIÑA POLACA", console: "SD10 Local", connection: "MADI 1-4 Festival Box", signal: "XLR 1-4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
      ]
    },
    {
      id: "sat", label: "SÁB 23", artists: [
        { id: "b1", artist: "AMAIA", console: "SSL100", connection: "OPTO DUO 1/2 (point-point)", signal: "AES 3/4", preset: "ALIZZZ", presetOk: true, toLx: "SMPT 1 (naranja)", toMon: "", comments: ["PM5 x Dante → Comparte GAIN - RIO", "Amaia → OPTO DUO nuestro", "RJ 1-4 directos preparados para Siloé"], extraSlots: [] },
        { id: "b2", artist: "ELYELLA", console: "SD10 Local", connection: "MADI 1-4 FB", signal: "XLR 1-4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
        { id: "b3", artist: "MALDITA NEREA", console: "PM5 Local", connection: "RJ 3/4 SP (Festival Box)", signal: "AES 1/2", preset: "INITIAL", presetOk: false, toLx: "SMPT 1 & 2 (amarillo)", toMon: "", comments: [], extraSlots: [] },
        { id: "b4", artist: "SILOÉ", console: "DM7", connection: "—", signal: "AES 1/2", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
      ]
    },
    {
      id: "sun", label: "DOM 24", artists: [
        { id: "c1", artist: "DUNCAN DHU", console: "MIDAS M32", connection: "RJ 1 & 2 SP", signal: "XLR 1-4", preset: "DUNCAN DHU", presetOk: true, toLx: "", toMon: "", comments: ["Nuestro TB pasa a ser Shout / Micro Shout lo usa RAULE para TB suyo", "Envío a Subtítulos desde Prodigy OUT 3"], extraSlots: [] },
        { id: "c2", artist: "RAULE", console: "SD10 Local", connection: "MADI 1-4 FB", signal: "AES 1/2", preset: "-1dB en SUB", presetOk: false, toLx: "SMPT 1 & 2 · CLICK - LOCAL OUT 3", toMon: "TB FOH - LOCAL IN 8", comments: [], extraSlots: [] },
        { id: "c3", artist: "CRYSTAL FIGHTERS", console: "PM5 Local", connection: "OPTO DUO (anillo)", signal: "AES 3/4", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
        { id: "c4", artist: "ALCALÁ NORTE", console: "SD10 Local", connection: "MADI 1-4 FB", signal: "AES 1/2", preset: "INITIAL", presetOk: false, toLx: "", toMon: "", comments: [], extraSlots: [] },
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
    .single();
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/FEST-HANDOVER/" },
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

      if (f.length === 0) {
        // Seed initial festival for new users
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
            dayIdx={dayIdx} setDayIdx={(i) => { setDayIdx(i); setArtIdx(0); }}
            artIdx={artIdx} setArtIdx={setArtIdx}
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
  return (
    <div style={{ padding: "24px 16px 40px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.2em", marginBottom: 4 }}>FOH HANDOVER</div>
          <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.05em" }}>
            TUS <span style={{ color: "#f59e0b" }}>FESTIVALES</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {user.user_metadata?.avatar_url && (
            <img src={user.user_metadata.avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #e2e8f0" }} />
          )}
          <button onClick={onLogout} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, color: "#94a3b8", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>
            salir
          </button>
        </div>
      </div>

      {fests.map(f => {
        const total = f.days.reduce((s, d) => s + d.artists.length, 0);
        return (
          <div key={f.id} style={S.festCard} onClick={() => onOpen(f.id)}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.04em" }}>{f.name}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{f.days.length} días · {total} artistas</div>
            </div>
            <button onClick={e => { e.stopPropagation(); onDelete(f.id); }} style={S.iconBtn}>🗑</button>
            <span style={{ color: "#cbd5e1", fontSize: 18 }}>›</span>
          </div>
        );
      })}
      <button onClick={onNew} style={S.bigBtn}>+ CREAR FESTIVAL</button>
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
function FestView({ fest, dayIdx, setDayIdx, artIdx, setArtIdx, notes, setNotes, checks, toggleCheck, slots, setSlots, onEditFest, onBack, onRefresh, lastSync }) {
  const [showShare, setShowShare] = useState(false);
  const day = fest.days[dayIdx];
  const artists = day.artists;
  const art = artists[artIdx];
  const touchX = useRef(null);

  const isAddScreen = artIdx === artists.length;

  if (!art && !isAddScreen) return (
    <div style={{ padding: 24 }}>
      <button onClick={onBack} style={S.backBtn}>‹</button>
      <div style={{ color: "#94a3b8", marginTop: 20 }}>Este día no tiene artistas.</div>
    </div>
  );

  const ckey = art ? `${fest.id}__${day.id}__${art.id}` : null;
  const done = ckey ? !!checks[ckey] : false;
  const myNotes = ckey ? (notes[ckey] || []) : [];
  const mySlots = ckey ? (slots[ckey] || []) : [];
  const sc = art ? sigColor(art.signal) : "#64748b";

  function go(delta) { const n = artIdx + delta; if (n >= 0 && n <= artists.length) setArtIdx(n); }

  async function addArtistToDay(fields) {
    const newArt = { id: uid(), artist: fields.artist || "", console: fields.console || "", connection: fields.connection || "", signal: fields.signal || "", preset: fields.preset || "INITIAL", presetOk: false, toLx: fields.toLx || "", toMon: fields.toMon || "", comments: [], extraSlots: [] };
    const updatedDays = fest.days.map((d, i) => i === dayIdx ? { ...d, artists: [...d.artists, newArt] } : d);
    const updatedFest = { ...fest, days: updatedDays };
    await onEditFest(updatedFest);
    setArtIdx(updatedDays[dayIdx].artists.length - 1);
  }
  function onTouchStart(e) { touchX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  }

  function addNote(text) {
    if (!text.trim()) return;
    const next = { ...notes, [ckey]: [...myNotes, { text: text.trim(), ts: Date.now() }] };
    setNotes(next);
  }
  function delNote(i) { setNotes({ ...notes, [ckey]: myNotes.filter((_, idx) => idx !== i) }); }

  function addSlot(label, value) {
    if (!label.trim()) return;
    const next = { ...slots, [ckey]: [...mySlots, { id: uid(), label: label.trim(), value: value.trim() }] };
    setSlots(next);
  }
  function delSlot(id) { setSlots({ ...slots, [ckey]: mySlots.filter(s => s.id !== id) }); }
  function editSlot(id, fld, val) { setSlots({ ...slots, [ckey]: mySlots.map(s => s.id === id ? { ...s, [fld]: val } : s) }); }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <div style={S.topBar}>
        <button onClick={onBack} style={S.backBtn}>‹</button>
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontFamily: "'Bebas Neue',sans-serif", color: "#0f172a", letterSpacing: "0.06em" }}>{fest.name}</div>
        <button onClick={onRefresh} style={S.syncBtn}>↻ {lastSync ? lastSync.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : ""}</button>
        <button onClick={() => setShowShare(true)} style={{ ...S.syncBtn, marginLeft: 4 }}>⬆︎</button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 12px", overflowX: "auto", background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        {fest.days.map((d, i) => {
          const dn = d.artists.filter(a => checks[`${fest.id}__${d.id}__${a.id}`]).length;
          const active = i === dayIdx;
          return (
            <button key={d.id} onClick={() => setDayIdx(i)} style={{
              flexShrink: 0, padding: "7px 14px", borderRadius: 20, fontSize: 12,
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

      <div style={{ display: "flex", gap: 5, padding: "10px 16px", justifyContent: "center", flexWrap: "wrap", background: "#fff" }}>
        {artists.map((a, i) => {
          const ok = checks[`${fest.id}__${day.id}__${a.id}`];
          return <div key={a.id} onClick={() => setArtIdx(i)} style={{
            width: i === artIdx ? 22 : 7, height: 7, borderRadius: 4, cursor: "pointer",
            background: i === artIdx ? "#0f172a" : ok ? "#16a34a" : "#e2e8f0",
            transition: "all 0.3s",
          }} />;
        })}
        <div onClick={() => setArtIdx(artists.length)} style={{
          width: isAddScreen ? 22 : 7, height: 7, borderRadius: 4, cursor: "pointer",
          background: isAddScreen ? "#f59e0b" : "#fde68a",
          transition: "all 0.3s",
        }} />
      </div>

      <div style={{ flex: 1, padding: "12px 14px 24px", background: "#f8fafc" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {isAddScreen ? (
          <AddArtistScreen onAdd={addArtistToDay} onBack={() => setArtIdx(artists.length - 1)} />
        ) : (
          <div style={{
            background: "#fff", borderRadius: 20, padding: 20,
            border: `2px solid ${done ? "#86efac" : sc + "33"}`,
            boxShadow: done ? "0 0 0 4px #dcfce7" : "0 1px 8px rgba(0,0,0,0.07)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: sc, borderRadius: "20px 20px 0 0" }} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 8 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: "0.15em" }}>{day.label} · {artIdx + 1}/{artists.length}</div>
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
        )}
        {!isAddScreen && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => go(-1)} disabled={artIdx === 0} style={{ ...S.navBtn, opacity: artIdx === 0 ? 0.3 : 1 }}>‹ Anterior</button>
              <button onClick={() => go(1)} style={S.navBtn}>{artIdx === artists.length - 1 ? "+ Nuevo artista ›" : "Siguiente ›"}</button>
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: "#94a3b8", marginTop: 8 }}>desliza ← → para cambiar de artista</div>
          </div>
        )}
      </div>
      {showShare && <ShareModal fest={fest} onClose={() => setShowShare(false)} />}
    </div>
  );
}

/* ---------- small components ---------- */
function AddArtistScreen({ onAdd, onBack }) {
  const [f, setF] = useState({ artist: "", console: "", connection: "", signal: "", preset: "INITIAL", toLx: "", toMon: "" });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function confirm() {
    if (!f.artist.trim()) return;
    await onAdd(f);
  }

  return (
    <div style={{ background: "#fff", borderRadius: 20, padding: 20, border: "2px dashed #e2e8f0", boxShadow: "0 1px 8px rgba(0,0,0,0.07)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fef9c3", border: "1px solid #fde68a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>+</div>
        <div>
          <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.15em" }}>NUEVO ARTISTA</div>
          <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>Añadir al día</div>
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
        <button onClick={confirm} disabled={!f.artist.trim()} style={{ ...S.bigBtn, flex: 1, padding: "13px", marginTop: 0, opacity: f.artist.trim() ? 1 : 0.4 }}>Guardar artista</button>
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
  app: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'JetBrains Mono',monospace", maxWidth: 480, margin: "0 auto", color: "#0f172a" },
  festCard: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 10, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" },
  bigBtn: { width: "100%", padding: "15px", background: "#0f172a", color: "#fff", border: "none", borderRadius: 14, fontSize: 14, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: "0.1em", cursor: "pointer", marginTop: 8 },
  iconBtn: { background: "none", border: "none", color: "#94a3b8", fontSize: 16, cursor: "pointer", padding: 4 },
  backBtn: { background: "#f1f5f9", border: "1px solid #e2e8f0", color: "#334155", fontSize: 20, width: 36, height: 36, borderRadius: 10, cursor: "pointer", lineHeight: 1 },
  input: { width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#0f172a", fontSize: 16, padding: "10px 12px", fontFamily: "monospace", outline: "none" },
  daySection: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12, marginBottom: 12 },
  artForm: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 10 },
  addBtn: { width: "100%", padding: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "monospace", marginTop: 6 },
  smBtn: { padding: "8px 12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, color: "#334155", fontSize: 12, cursor: "pointer" },
  topBar: { display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 10px", position: "sticky", top: 0, background: "#fff", zIndex: 10, borderBottom: "1px solid #e2e8f0" },
  syncBtn: { background: "none", border: "1px solid #e2e8f0", borderRadius: 8, color: "#94a3b8", fontSize: 10, padding: "6px 9px", cursor: "pointer" },
  navBtn: { flex: 1, padding: "13px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#334155", fontSize: 13, cursor: "pointer", fontFamily: "monospace" },
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
