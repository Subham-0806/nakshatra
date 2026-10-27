import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./nakshatra.css";
import {
  loadAll,
  checkTables,
  getCurrentUser,
  signUp,
  logIn,
  logOut,
  loadMyProgress,
  saveTopic,
  removeTopic,
} from "./lib/api";

const APP_NAME = "Nakshatra";
const TAGLINE = "Light up your tech skills, one star at a time";

/* ---------- Look and layout (edit these to change the sky) ---------- */

const CATEGORY_COLORS = {
  Programming: "#ff7aa8",
  Databases: "#4fd8c8",
  "Computer science": "#a78bfa",
  Applied: "#ffb36b",
};
const FALLBACK_COLOR = "#9fb4ff";
const colorOf = (category) => CATEGORY_COLORS[category] || FALLBACK_COLOR;

// Where each subject sits on the sky. New subjects without an entry are placed in a row underneath.
const POSITIONS = {
  python: { x: 0, y: 90 },
  c_language: { x: 260, y: -30 },
  java: { x: 520, y: 90 },
  web_development: { x: 900, y: 90 },
  software_engineering: { x: 1160, y: -30 },
  ai_ml_basics: { x: 1420, y: 90 },
  sql: { x: 0, y: 430 },
  dbms: { x: 260, y: 370 },
  cs_fundamentals: { x: 640, y: 430 },
  operating_systems: { x: 900, y: 370 },
  computer_networks: { x: 1160, y: 430 },
  dsa: { x: 1420, y: 370 },
};
const ORDER = Object.keys(POSITIONS);

// Extra faint lines between subjects that go well together
const RELATED = [
  ["python", "sql"],
  ["java", "dbms"],
  ["web_development", "computer_networks"],
  ["ai_ml_basics", "dsa"],
];

const RADII = [34, 54, 74]; // inner ring = Base, middle = Medium, outer = Hard
const CENTER = 95;

const LEVELS = [
  { min: 0, name: "Stargazer" },
  { min: 5, name: "Spark" },
  { min: 15, name: "Explorer" },
  { min: 40, name: "Navigator" },
  { min: 80, name: "Astronomer" },
  { min: 140, name: "Galaxy master" },
];

function levelOf(count) {
  let i = 0;
  LEVELS.forEach((l, idx) => {
    if (count >= l.min) i = idx;
  });
  return { index: i, name: LEVELS[i].name, next: LEVELS[i + 1] };
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function calcStreak(times) {
  const days = new Set(times.map(dayKey));
  const d = new Date();
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(d.getTime()))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/* ---------------- Small helpers: storage, sound, share card ---------------- */

const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage may be blocked, that is fine */
    }
  },
};

let audioCtx = null;
function playChime(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume();
    const notes =
      kind === "big" ? [523.25, 659.25, 783.99, 1046.5] : kind === "stage" ? [523.25, 783.99] : [880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {
    /* sound is optional */
  }
}

function labelName(name) {
  if (name.length <= 22) return name;
  return name.split(" ").slice(0, 2).join(" ");
}

function shortName(name) {
  if (name.length <= 16) return name;
  const two = name.split(" ").slice(0, 2).join(" ");
  return two.length <= 16 ? two : two.slice(0, 15) + "…";
}

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
const EMOJI_FONT = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

// Draws the shareable "my sky" picture on any 2D canvas context
function drawCard(ctx, W, H, d) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1b1450");
  bg.addColorStop(1, "#070816");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 150; i++) {
    ctx.globalAlpha = 0.25 + rnd() * 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, rnd() * 1.6 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffe29a";
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText(`✦ ${d.appName}`, 60, 100);
  ctx.fillStyle = "#cfcdf0";
  ctx.font = `26px ${FONT}`;
  ctx.fillText(d.tagline, 60, 142);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 36px ${FONT}`;
  ctx.fillText(d.name, 60, 218);
  ctx.fillStyle = "#ffd166";
  ctx.font = `26px ${FONT}`;
  const streakText = d.streak > 0 ? `   🔥 ${d.streak}-day streak` : "";
  ctx.fillText(`Level ${d.levelIndex + 1} · ${d.levelName}   ⭐ ${d.lit} of ${d.total} stars lit${streakText}`, 60, 262);

  const cols = 6;
  const cellW = (W - 120) / cols;
  d.subjects.forEach((s, i) => {
    const cx = 60 + cellW * (i % cols) + cellW / 2;
    const cy = 340 + Math.floor(i / cols) * 150;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(cx, cy, 38, 0, Math.PI * 2);
    ctx.stroke();
    if (s.pct > 0) {
      ctx.strokeStyle = s.pct === 100 ? "#ffc247" : s.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * s.pct) / 100);
      ctx.stroke();
    }
    ctx.fillStyle = "#0b0d24";
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `30px ${EMOJI_FONT}`;
    ctx.fillText(s.icon, cx, cy + 11);
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillStyle = s.pct > 0 ? "#ffe29a" : "#a9a6d6";
    ctx.fillText(s.name, cx, cy + 68);
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = "#a9a6d6";
    ctx.fillText(`${s.pct}% lit`, cx, cy + 88);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#a9a6d6";
  ctx.font = `20px ${FONT}`;
  ctx.fillText("Built with Appwrite TablesDB · Appwrite Databases Hackathon 2026", 60, H - 30);
}

function downloadCard(data) {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  drawCard(canvas.getContext("2d"), W, H, data);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-nakshatra-sky.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, "image/png");
}

/* ---------------- Welcome, celebration and search ---------------- */

function Welcome({ subjects, topics, onStart }) {
  return (
    <div className="welcome" role="dialog" aria-label="Welcome">
      <div className="w-card">
        <div className="w-orbit">
          <span className="w-core">✦</span>
          <i style={{ "--r": "54px", animationDuration: "5s" }} />
          <i style={{ "--r": "40px", animationDuration: "3.4s", background: "#ff8fb8" }} />
          <i style={{ "--r": "28px", animationDuration: "2.4s", background: "#4fd8c8" }} />
        </div>
        <h1>{APP_NAME}</h1>
        <p className="w-tag">{TAGLINE}</p>
        <ol className="w-steps">
          <li>
            <b>Pick a subject</b> in the sky: Python, SQL, Java, networks and more.
          </li>
          <li>
            <b>It splits into 3 stages:</b> Base, Medium and Hard.
          </li>
          <li>
            <b>Light every star.</b> Each star is one subtopic you have learned.
          </li>
        </ol>
        <button className="btn" onClick={onStart}>
          ✨ Start exploring
        </button>
        <div className="w-note">
          {subjects} subjects · {topics} subtopics · made for BCA and computer science students
        </div>
      </div>
    </div>
  );
}

function Celebration({ kind, color }) {
  const parts = useMemo(() => {
    const count = kind === "big" ? 48 : kind === "stage" ? 26 : 16;
    const reach = kind === "big" ? 460 : 280;
    return Array.from({ length: count }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const d = 110 + Math.random() * reach;
      return {
        dx: Math.cos(a) * d,
        dy: Math.sin(a) * d,
        rot: Math.round(Math.random() * 360),
        delay: Math.random() * 0.15,
        glyph: ["✦", "★", "✧", "•"][i % 4],
        size: 10 + Math.round(Math.random() * 16),
        tint: i % 3 === 0 ? "#ffd166" : i % 3 === 1 ? color : "#ffffff",
      };
    });
  }, [kind, color]);
  return (
    <div className="confetti" aria-hidden="true">
      {parts.map((p, i) => (
        <span
          key={i}
          style={{
            "--dx": `${p.dx}px`,
            "--dy": `${p.dy}px`,
            "--rot": `${p.rot}deg`,
            animationDelay: `${p.delay}s`,
            fontSize: p.size,
            color: p.tint,
          }}
        >
          {p.glyph}
        </span>
      ))}
    </div>
  );
}

function SearchBox({ items, onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    return items.filter((it) => it.text.includes(needle)).slice(0, 7);
  }, [q, items]);
  return (
    <div className="search">
      <input
        type="text"
        placeholder="🔎 Search a topic, e.g. pointers"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="s-list">
          {results.map((r) => (
            <li key={r.key}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setOpen(false);
                }}
              >
                <b>{r.title}</b>
                <small>{r.subject}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------- Map nodes ---------------- */

function SubjectNode({ data }) {
  const { skill, color, orbits, lit, total, pct, selected, burst, delay } = data;
  const mastered = total > 0 && lit === total;
  const cls = ["planet", selected ? "sel" : "", mastered ? "mastered" : "", pct === 0 ? "fresh" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} style={{ "--c": color, "--p": pct, "--d": delay || 0 }}>
      {orbits.map((o, si) => {
        const r = RADII[si] ?? 74 + (si - 2) * 20;
        const full = o.lit.length > 0 && o.lit.every(Boolean);
        return (
          <div key={o.stage.$id}>
            <div
              className={`orbit${full ? " full" : ""}`}
              style={{ width: r * 2, height: r * 2, left: CENTER - r, top: CENTER - r }}
            />
            <div className={`spin${si % 2 ? " rev" : ""}`} style={{ animationDuration: `${90 + si * 35}s` }}>
              {o.lit.map((isLit, i) => {
                const a = (i / o.lit.length) * Math.PI * 2 - Math.PI / 2 + si * 0.5;
                return (
                  <span
                    key={i}
                    className={`dot${isLit ? " lit" : ""}`}
                    title={o.titles[i]}
                    style={{ left: Math.round(Math.cos(a) * r), top: Math.round(Math.sin(a) * r) }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="core">{skill.icon}</div>
      {burst && <span className="burst" />}
      <div className="p-name" title={skill.name}>{labelName(skill.name)}</div>
      <div className="p-count">
        {total ? `${lit} of ${total} lit` : "guide coming soon"}
        {mastered ? " ★" : ""}
      </div>

      <Handle type="target" position={Position.Left} isConnectable={false} className="h" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="h" />
    </div>
  );
}

function GroupLabel({ data }) {
  return (
    <div className="group-label" style={{ color: data.color }}>
      {data.text}
    </div>
  );
}

function NebulaNode({ data }) {
  return <div className="nebula" style={{ "--c": data.color, "--o": data.opacity }} />;
}

const nodeTypes = { subject: SubjectNode, group: GroupLabel, nebula: NebulaNode };

/* ---------------- Split view: the subject opens into 3 stages ---------------- */

function SubjectFocus({
  skill,
  color,
  stages,
  topicsByStage,
  doneTopics,
  focusTopic,
  user,
  origin,
  onToggleTopic,
  onClose,
}) {
  const [active, setActive] = useState(null);
  const lanes = stages.map((st) => ({ st, list: topicsByStage[st.$id] || [] }));
  const all = lanes.flatMap((l) => l.list);
  const lit = all.filter((t) => doneTopics.has(t.$id)).length;
  const pct = all.length ? Math.round((lit / all.length) * 100) : 0;
  const mastered = all.length > 0 && lit === all.length;
  const shownId = active || focusTopic;
  const shown = all.find((t) => t.$id === shownId);
  const shownLane = shown ? lanes.find((l) => l.list.some((t) => t.$id === shown.$id)) : null;
  const ys = lanes.map((_, i) => ((i + 0.5) / lanes.length) * 100);

  return (
    <section
      className={`focus${mastered ? " mastered" : ""}`}
      style={{ "--c": color, "--p": pct, "--ox": origin.x, "--oy": origin.y, "--n": Math.max(lanes.length, 1) }}
    >
      <button className="back" onClick={onClose}>
        ← Back to the sky
      </button>

      {lanes.length === 0 && (
        <div className="center-msg">
          <b>{skill.name}</b>
          <p>✨ Guide coming soon for this subject.</p>
        </div>
      )}

      {lanes.length > 0 && (
        <div className="f-main">
          <svg className="f-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ys.map((y, i) => (
              <path
                key={i}
                className={lanes[i].list.length > 0 && lanes[i].list.every((t) => doneTopics.has(t.$id)) ? "done" : ""}
                d={`M 11 50 C 17 50, 17 ${y}, 23 ${y}`}
              />
            ))}
          </svg>

          <div className="f-planet">
            <div className="f-ring">
              <div className="f-core">{skill.icon}</div>
            </div>
            <h2>{skill.name}</h2>
            <div className="f-sub">
              {lit} of {all.length} stars lit · {pct}%
            </div>
            {mastered && <div className="mastered-box">🌟 Mastered!</div>}
            {skill.description && <p className="f-desc">{skill.description}</p>}
            {!user && <p className="p-hint">Log in to save your stars.</p>}
          </div>

          <div className="f-lanes">
            {lanes.map(({ st, list }, i) => {
              const n = list.filter((t) => doneTopics.has(t.$id)).length;
              return (
                <div className="lane" key={st.$id} style={{ "--i": i }}>
                  <div className="lane-head">
                    <span className="num">{i + 1}</span>
                    <b>
                      Stage {i + 1} · {st.title}
                    </b>
                    <span className="cnt">
                      {n}/{list.length}
                    </span>
                  </div>
                  <div className="lane-stars">
                    {list.map((t, k) => {
                      const isLit = doneTopics.has(t.$id);
                      const prevLit = k > 0 && doneTopics.has(list[k - 1].$id);
                      const cls = ["tstar", isLit ? "lit" : "", prevLit && isLit ? "prevlit" : "", focusTopic === t.$id ? "next" : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          key={t.$id}
                          id={`topic-${t.$id}`}
                          className={cls}
                          style={{ "--i": i, "--k": k }}
                          aria-pressed={isLit}
                          title={t.note || t.title}
                          onClick={() => onToggleTopic(t.$id)}
                          onMouseEnter={() => setActive(t.$id)}
                          onMouseLeave={() => setActive(null)}
                          onFocus={() => setActive(t.$id)}
                          onBlur={() => setActive(null)}
                        >
                          <span className="tdot">{isLit ? "★" : ""}</span>
                          <span className="tname">{t.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="f-note">
        {shown ? (
          <>
            <b>{shown.title}</b>
            {shownLane ? ` · Stage ${lanes.indexOf(shownLane) + 1}, ${shownLane.st.title}` : ""}
            {shown.note ? ` — ${shown.note}` : ""}
          </>
        ) : (
          "Click a star to light it. Hover a star to read what it covers."
        )}
      </div>
    </section>
  );
}

/* ---------------- Setup check page (open /#check) ---------------- */

function SetupCheck() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    checkTables().then(setRows);
  }, []);
  return (
    <div className="check">
      <h1>✦ {APP_NAME} setup check</h1>
      <p>
        The tables <b>skills</b>, <b>stages</b>, <b>topics</b> and <b>topic_progress</b> are the ones this app uses.
        Expected rows: skills 12, stages 36, topics 184. The progress tables say "not authorized" when you are logged
        out, which is normal.
      </p>
      {!rows && <p>Checking…</p>}
      {rows && (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className={r.ok ? "ok" : "bad"}>{r.ok ? `OK · ${r.count} rows` : r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <a href="#">← Back to the sky</a>
      </p>
    </div>
  );
}

/* ---------------- Main app ---------------- */

function Sky() {
  const [skills, setSkills] = useState([]);
  const [stages, setStages] = useState([]);
  const [topics, setTopics] = useState([]);

  const [doneTopics, setDoneTopics] = useState(() => new Set());
  const [topicRowIds, setTopicRowIds] = useState({});
  const [tickTimes, setTickTimes] = useState({});

  const [user, setUser] = useState(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [focusTopic, setFocusTopic] = useState(null);
  const [burstId, setBurstId] = useState(null);
  const [toast, setToast] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState({ x: "50%", y: "50%" });
  const [soundOn, setSoundOn] = useState(() => store.get("nakshatra_sound", "1") === "1");
  const [showWelcome, setShowWelcome] = useState(() => store.get("nakshatra_welcome", "") !== "seen");
  const [launched, setLaunched] = useState(() => store.get("nakshatra_welcome", "") === "seen");
  const [fxOn, setFxOn] = useState(() => {
    const saved = store.get("nakshatra_fx", "");
    if (saved !== "") return saved === "1";
    const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    return !reduced;
  });
  const [motionNote, setMotionNote] = useState(() => {
    const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
    return reduced && store.get("nakshatra_fx", "") === "";
  });
  const [celebration, setCelebration] = useState(null);
  const celebTimer = useRef(null);
  const skyRef = useRef(null);
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3800);
  };

  async function applyUser(u) {
    setUser(u);
    try {
      const { topicRows } = await loadMyProgress();
      setDoneTopics(new Set(topicRows.map((r) => r.topic_id)));
      setTopicRowIds(Object.fromEntries(topicRows.map((r) => [r.topic_id, r.$id])));
      setTickTimes(Object.fromEntries(topicRows.map((r) => [r.topic_id, new Date(r.$createdAt).getTime()])));
    } catch (err) {
      setNotice("Could not load your saved progress: " + err.message);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await loadAll();
        setSkills(data.skills);
        setStages(data.stages);
        setTopics(data.topics);
        const u = await getCurrentUser();
        if (u) await applyUser(u);
        setStatus("ready");
      } catch (err) {
        setError(err.message);
        setStatus("error");
      }
    })();
  }, []);

  useEffect(() => {
    if (!focusTopic) return undefined;
    const t = setTimeout(() => {
      document.getElementById(`topic-${focusTopic}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    return () => clearTimeout(t);
  }, [focusTopic, selectedId]);

  useEffect(() => {
    document.title = `${APP_NAME} · light up your tech skills`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href =
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#14113a"/><text x="32" y="47" font-size="40" text-anchor="middle" fill="#ffd166">✦</text></svg>'
      );
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setShowWelcome(false);
        setLaunched(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    try {
      const u =
        mode === "signup"
          ? await signUp(form.name || form.email.split("@")[0], form.email, form.password)
          : await logIn(form.email, form.password);
      await applyUser(u);
      setForm({ name: "", email: "", password: "" });
    } catch (err) {
      setAuthError(err.message);
    }
  }

  async function handleLogout() {
    await logOut();
    setUser(null);
    setDoneTopics(new Set());
    setTopicRowIds({});
    setTickTimes({});
  }

  /* ----- derived data ----- */

  const subjects = useMemo(() => {
    const rank = (s) => {
      const i = ORDER.indexOf(s.$id);
      return i === -1 ? 999 : i;
    };
    return [...skills].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [skills]);

  const skillById = useMemo(() => Object.fromEntries(skills.map((s) => [s.$id, s])), [skills]);
  const topicById = useMemo(() => Object.fromEntries(topics.map((t) => [t.$id, t])), [topics]);

  const stagesBySkill = useMemo(() => {
    const m = {};
    stages.forEach((s) => {
      (m[s.skill_id] ||= []).push(s);
    });
    Object.values(m).forEach((a) => a.sort((x, y) => x.position - y.position));
    return m;
  }, [stages]);

  const topicsByStage = useMemo(() => {
    const m = {};
    topics.forEach((t) => {
      (m[t.stage_id] ||= []).push(t);
    });
    Object.values(m).forEach((a) => a.sort((x, y) => x.position - y.position));
    return m;
  }, [topics]);

  const progress = useMemo(() => {
    const m = {};
    subjects.forEach((s) => {
      const orbits = (stagesBySkill[s.$id] || []).map((st) => {
        const list = topicsByStage[st.$id] || [];
        return { stage: st, lit: list.map((t) => doneTopics.has(t.$id)), titles: list.map((t) => t.title) };
      });
      const total = orbits.reduce((a, o) => a + o.lit.length, 0);
      const lit = orbits.reduce((a, o) => a + o.lit.filter(Boolean).length, 0);
      m[s.$id] = { orbits, total, lit, pct: total ? Math.round((lit / total) * 100) : 0 };
    });
    return m;
  }, [subjects, stagesBySkill, topicsByStage, doneTopics]);

  const totalLit = subjects.reduce((a, s) => a + (progress[s.$id]?.lit || 0), 0);
  const totalTopics = subjects.reduce((a, s) => a + (progress[s.$id]?.total || 0), 0);
  const pct = totalTopics ? Math.round((totalLit / totalTopics) * 100) : 0;
  const level = levelOf(totalLit);
  const streak = calcStreak(Object.values(tickTimes));

  /* ----- actions ----- */

  const celebrate = (kind) => {
    setCelebration({ id: Date.now(), kind });
    clearTimeout(celebTimer.current);
    celebTimer.current = setTimeout(() => setCelebration(null), 2000);
  };

  const toggleTopic = async (topicId) => {
    const topic = topicById[topicId];
    if (!topic) return;
    const had = doneTopics.has(topicId);
    const next = new Set(doneTopics);
    if (had) next.delete(topicId);
    else next.add(topicId);
    setDoneTopics(next);
    setTickTimes((p) => {
      const c = { ...p };
      if (had) delete c[topicId];
      else c[topicId] = Date.now();
      return c;
    });
    setNotice("");
    if (focusTopic === topicId) setFocusTopic(null);

    if (!had) {
      const stageTopics = topicsByStage[topic.stage_id] || [];
      const subjectTopics = (stagesBySkill[topic.skill_id] || []).flatMap((s) => topicsByStage[s.$id] || []);
      const subject = skillById[topic.skill_id];
      const stage = (stagesBySkill[topic.skill_id] || []).find((s) => s.$id === topic.stage_id);
      if (subjectTopics.length && subjectTopics.every((t) => next.has(t.$id))) {
        setBurstId(topic.skill_id);
        setTimeout(() => setBurstId(null), 1100);
        showToast(`🌟 ${subject?.name} mastered! Every star is lit.`);
        celebrate("big");
        if (soundOn) playChime("big");
      } else if (stageTopics.length && stageTopics.every((t) => next.has(t.$id))) {
        setBurstId(topic.skill_id);
        setTimeout(() => setBurstId(null), 1100);
        showToast(`✨ ${subject?.name}: ${stage?.title} orbit complete!`);
        celebrate("stage");
        if (soundOn) playChime("stage");
      } else if (levelOf(totalLit + 1).index > levelOf(totalLit).index) {
        showToast(`🚀 Level up! You are now ${levelOf(totalLit + 1).name}.`);
        celebrate("level");
        if (soundOn) playChime("stage");
      } else if (soundOn) {
        playChime("tick");
      }
    }

    if (!user) return;
    try {
      if (had) {
        await removeTopic(topicRowIds[topicId]);
        setTopicRowIds((p) => {
          const c = { ...p };
          delete c[topicId];
          return c;
        });
      } else {
        const row = await saveTopic(user.$id, topicId);
        setTopicRowIds((p) => ({ ...p, [topicId]: row.$id }));
      }
    } catch (err) {
      setNotice("Could not save that topic: " + err.message);
    }
  };

  const continueLearning = () => {
    const open = subjects.filter((s) => progress[s.$id]?.total && progress[s.$id].lit < progress[s.$id].total);
    if (!open.length) {
      showToast("🌟 Every star you can see is lit. Amazing!");
      return;
    }
    const started = open.filter((s) => progress[s.$id].lit > 0).sort((a, b) => progress[b.$id].pct - progress[a.$id].pct);
    const pick = started[0] || open[0];
    const firstTopic = (stagesBySkill[pick.$id] || [])
      .flatMap((s) => topicsByStage[s.$id] || [])
      .find((t) => !doneTopics.has(t.$id));
    setOrigin({ x: "50%", y: "50%" });
    setSelectedId(pick.$id);
    setFocusTopic(firstTopic ? firstTopic.$id : null);
  };

  /* ----- map nodes and edges ----- */

  const positions = useMemo(() => {
    const m = {};
    subjects.forEach((s, i) => {
      m[s.$id] = POSITIONS[s.$id] ?? { x: (i % 5) * 270, y: 900 + Math.floor(i / 5) * 270 };
    });
    return m;
  }, [subjects]);

  const nodes = useMemo(() => {
    const subjectNodes = subjects.map((s, idx) => {
      const p = positions[s.$id];
      const pr = progress[s.$id];
      return {
        id: s.$id,
        type: "subject",
        position: { x: p.x - CENTER, y: p.y - CENTER },
        draggable: false,
        data: {
          skill: s,
          color: colorOf(s.category),
          orbits: pr.orbits,
          lit: pr.lit,
          total: pr.total,
          pct: pr.pct,
          selected: selectedId === s.$id,
          burst: burstId === s.$id,
          delay: idx,
        },
      };
    });
    const groups = {};
    subjects.forEach((s) => {
      (groups[s.category] ||= []).push(positions[s.$id]);
    });
    const labelNodes = Object.entries(groups).map(([cat, pts]) => {
      const minY = Math.min(...pts.map((p) => p.y));
      const midX = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
      return {
        id: `group-${cat}`,
        type: "group",
        position: { x: midX - 100, y: minY - 112 },
        draggable: false,
        selectable: false,
        data: { text: cat, color: colorOf(cat) },
      };
    });
    const nebulaNodes = Object.entries(groups).map(([cat, pts]) => {
      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const members = subjects.filter((s) => s.category === cat);
      const lit = members.reduce((a, s) => a + (progress[s.$id]?.lit || 0), 0);
      const total = members.reduce((a, s) => a + (progress[s.$id]?.total || 0), 0);
      const w = maxX - minX + 560;
      const h = maxY - minY + 520;
      return {
        id: `nebula-${cat}`,
        type: "nebula",
        position: { x: minX - 280, y: minY - 240 },
        style: { width: w, height: h },
        draggable: false,
        selectable: false,
        focusable: false,
        data: { color: colorOf(cat), opacity: 0.2 + (total ? (lit / total) * 0.4 : 0) },
      };
    });
    return [...nebulaNodes, ...labelNodes, ...subjectNodes];
  }, [subjects, positions, progress, selectedId, burstId]);

  const fitOptions = useMemo(
    () => ({
      padding: 0.08,
      nodes: [
        ...subjects.map((s) => ({ id: s.$id })),
        ...[...new Set(subjects.map((s) => s.category))].map((c) => ({ id: `group-${c}` })),
      ],
    }),
    [subjects]
  );

  const searchItems = useMemo(() => {
    const list = subjects.map((s) => ({
      key: `s-${s.$id}`,
      skillId: s.$id,
      topicId: null,
      title: s.name,
      subject: "Subject",
      text: s.name.toLowerCase(),
    }));
    topics.forEach((t) => {
      const sub = skillById[t.skill_id];
      if (!sub) return;
      list.push({
        key: t.$id,
        skillId: t.skill_id,
        topicId: t.$id,
        title: t.title,
        subject: sub.name,
        text: `${t.title} ${sub.name}`.toLowerCase(),
      });
    });
    return list;
  }, [subjects, topics, skillById]);

  const pickSearch = (r) => {
    setOrigin({ x: "50%", y: "50%" });
    setSelectedId(r.skillId);
    setFocusTopic(r.topicId);
  };

  const saveSky = () =>
    downloadCard({
      appName: APP_NAME,
      tagline: TAGLINE,
      name: user?.name || "Explorer",
      levelIndex: level.index,
      levelName: level.name,
      lit: totalLit,
      total: totalTopics,
      streak,
      subjects: subjects.map((s) => ({
        name: shortName(s.name),
        icon: s.icon,
        pct: progress[s.$id]?.pct || 0,
        color: colorOf(s.category),
      })),
    });

  const edges = useMemo(() => {
    const pairs = [];
    const byCat = {};
    subjects.forEach((s) => {
      (byCat[s.category] ||= []).push(s);
    });
    Object.values(byCat).forEach((arr) => {
      arr.sort((a, b) => positions[a.$id].x - positions[b.$id].x);
      for (let i = 0; i < arr.length - 1; i++) pairs.push([arr[i].$id, arr[i + 1].$id, false]);
      if (arr.length === 3) pairs.push([arr[2].$id, arr[0].$id, false]);
    });
    RELATED.forEach(([a, b]) => {
      if (skillById[a] && skillById[b]) pairs.push([a, b, true]);
    });
    return pairs.map(([a, b, related]) => {
      const both = (progress[a]?.lit || 0) > 0 && (progress[b]?.lit || 0) > 0;
      const color = colorOf(skillById[a]?.category);
      return {
        id: `${a}-${b}`,
        source: a,
        target: b,
        type: "straight",
        className: both ? "edge-lit" : "",
        style: {
          stroke: both ? color : "#7d79b8",
          strokeWidth: both ? 2 : 1.2,
          opacity: both ? 0.85 : related ? 0.18 : 0.3,
          strokeDasharray: related ? "4 7" : undefined,
        },
      };
    });
  }, [subjects, positions, progress, skillById]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const selected = selectedId ? skillById[selectedId] : null;

  return (
    <div className={`app${fxOn ? "" : " fx-off"}`}>
      <header className="top">
        <div className="brand">
          <h1>✦ {APP_NAME}</h1>
          <div className="tag">{TAGLINE}</div>
        </div>

        <div className="stats">
          <div className="line">
            {status === "ready" ? (
              <>
                ⭐ {totalLit} of {totalTopics} stars lit · Level {level.index + 1} {level.name}
                {streak > 0 && ` · 🔥 ${streak}-day streak`}
              </>
            ) : (
              "Scanning the sky…"
            )}
          </div>
          <div className="bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          {status === "ready" && level.next && (
            <div className="sublevel">
              {Math.max(level.next.min - totalLit, 0)} more stars to reach {level.next.name}
            </div>
          )}
        </div>

        {status === "ready" && (
          <div className="auth">
            {user ? (
              <div className="who">
                <span>👤 {user.name || user.email}</span>
                <button className="btn small" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            ) : (
              <form onSubmit={handleAuth}>
                {mode === "signup" && (
                  <input type="text" placeholder="Name" value={form.name} onChange={set("name")} />
                )}
                <input type="email" placeholder="Email" required value={form.email} onChange={set("email")} />
                <input
                  type="password"
                  placeholder="Password (8+ characters)"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={set("password")}
                />
                <button className="btn small" type="submit">
                  {mode === "signup" ? "Sign up" : "Log in"}
                </button>
                <button
                  type="button"
                  className="linkbtn"
                  onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                >
                  {mode === "signup" ? "Have an account? Log in" : "New here? Sign up"}
                </button>
              </form>
            )}
            {authError && <div className="err">{authError}</div>}
          </div>
        )}
      </header>

      {status === "ready" && (
        <div className="toolbar">
          <button className="btn small" onClick={continueLearning}>
            ▶ Continue learning
          </button>
          <SearchBox items={searchItems} onPick={pickSearch} />
          <button className="btn small ghost" onClick={saveSky}>
            📸 Save my sky
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              store.set("nakshatra_sound", next ? "1" : "0");
              if (next) playChime("tick");
            }}
          >
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
          <button className="btn small ghost" onClick={() => setShowWelcome(true)}>
            ❓ How it works
          </button>
          <button
            className="btn small ghost"
            onClick={() => {
              const next = !fxOn;
              setFxOn(next);
              setMotionNote(false);
              store.set("nakshatra_fx", next ? "1" : "0");
            }}
          >
            {fxOn ? "✨ Effects on" : "✨ Effects off"}
          </button>
          <span className="hint">Click a subject to split it into 3 stages · rings: Base, Medium, Hard · gold dot = finished</span>
          {!user && <span className="note">Log in or sign up to save your progress.</span>}
        </div>
      )}

      {motionNote && (
        <div className="notice">
          Your device asks for reduced motion, so the animations are off. Press ✨ Effects to turn them on.
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}

      <main className={`sky${launched ? " go" : ""}`} ref={skyRef}>
        {status === "loading" && (
          <div className="center-msg">
            <div className="loader">
              <i />
              <i />
              <i />
            </div>
            Scanning the sky…
          </div>
        )}
        {status === "error" && (
          <div className="center-msg err-box">
            <b>Something is not connected yet.</b>
            <p>{error}</p>
            <p>
              Open <a href="/#check">/#check</a> to see which table has a problem.
            </p>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="map">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodeClick={(event, node) => {
                  if (node.type === "subject") {
                    const r = skyRef.current?.getBoundingClientRect();
                    if (r) setOrigin({ x: `${event.clientX - r.left}px`, y: `${event.clientY - r.top}px` });
                    setSelectedId(node.id);
                    setFocusTopic(null);
                  }
                }}
                onPaneClick={() => setSelectedId(null)}
                fitView
                fitViewOptions={fitOptions}
                minZoom={0.2}
                nodesDraggable={false}
                nodesConnectable={false}
                colorMode="dark"
              >
                <Background color="rgba(255,255,255,0.06)" gap={40} size={1.2} />
                <Controls position="top-left" showInteractive={false} />
              </ReactFlow>
            </div>
          </>
        )}

        {selected && (
          <SubjectFocus
            key={selected.$id}
            skill={selected}
            color={colorOf(selected.category)}
            stages={stagesBySkill[selected.$id] || []}
            topicsByStage={topicsByStage}
            doneTopics={doneTopics}
            focusTopic={focusTopic}
            user={user}
            origin={origin}
            onToggleTopic={toggleTopic}
            onClose={() => setSelectedId(null)}
          />
        )}

        <div className="shooters" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>

        {celebration && (
          <Celebration
            key={celebration.id}
            kind={celebration.kind}
            color={colorOf(skillById[selectedId]?.category)}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </main>

      {status === "ready" && showWelcome && (
        <Welcome
          subjects={subjects.length}
          topics={totalTopics}
          onStart={() => {
            store.set("nakshatra_welcome", "seen");
            setShowWelcome(false);
            setLaunched(true);
          }}
        />
      )}
    </div>
  );
}

function useHash() {
  const [h, setH] = useState(window.location.hash);
  useEffect(() => {
    const f = () => setH(window.location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

export default function App() {
  const hash = useHash();
  return hash === "#check" ? <SetupCheck /> : <Sky />;
}
