// SkyMusicPlayer.jsx — Sky Music tab for OSONE dashboard
// Drop into /app/frontend/src/ and import in the main App

import { useState, useRef, useEffect } from "react";

const API = "";  // same-origin

function TrackBar({ label, color, energy }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 text-right opacity-60">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.round(energy * 100)}%`, background: color }}
        />
      </div>
      <span className="w-8 opacity-40">{Math.round(energy * 100)}%</span>
    </div>
  );
}

function CompositionCard({ item, onPlay, playing }) {
  const isPlaying = playing === item.audio_url;
  const params = item.params || {};
  const structure = item.structure || [];
  return (
    <div
      className={`rounded-xl border p-3 cursor-pointer transition-all duration-200
        ${isPlaying ? "border-violet-500 bg-violet-500/10" : "border-white/10 bg-white/5 hover:border-white/20"}`}
      onClick={() => onPlay(item)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{item.title || "Untitled"}</div>
          <div className="text-xs opacity-50 mt-0.5">
            {params.key} {params.scale} · {params.tempo} BPM · {params.genre}
          </div>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
          ${isPlaying ? "bg-violet-500" : "bg-white/10"}`}>
          {isPlaying ? "⏸" : "▶"}
        </div>
      </div>
      {structure.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {structure.map((s, i) => (
            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded
              ${s === "chorus" ? "bg-violet-500/30 text-violet-300" :
                s === "bridge" ? "bg-amber-500/30 text-amber-300" :
                "bg-white/10 text-white/50"}`}>
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SkyMusicPlayer({ token }) {
  const [prompt, setPrompt]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [status, setStatus]       = useState(null);   // { ok, message }
  const [history, setHistory]     = useState([]);
  const [nowPlaying, setNowPlaying] = useState(null); // audio_url
  const [progress, setProgress]   = useState(0);
  const [duration, setDuration]   = useState(0);
  const [currentItem, setCurrentItem] = useState(null);
  const audioRef = useRef(null);

  const headers = { "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}` };

  useEffect(() => { fetchHistory(); }, []);

  async function fetchHistory() {
    try {
      const r = await fetch(`${API}/api/music/status`, { headers });
      const d = await r.json();
      if (d.ok) setHistory(d.recent_compositions.reverse());
    } catch {}
  }

  async function compose() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setStatus({ ok: null, message: "🎼 Composing from music theory…" });
    try {
      const r = await fetch(`${API}/api/music/compose`, {
        method: "POST", headers,
        body: JSON.stringify({ prompt: prompt.trim() })
      });
      const d = await r.json();
      if (d.ok) {
        setStatus({ ok: true, message: `✅ "${d.title}" composed` });
        setPrompt("");
        await fetchHistory();
        // Auto-play the new composition
        if (d.audio_url) playItem(d);
      } else {
        setStatus({ ok: false, message: `❌ ${d.detail || "Composition failed"}` });
      }
    } catch (e) {
      setStatus({ ok: false, message: `❌ Network error: ${e.message}` });
    }
    setLoading(false);
  }

  function playItem(item) {
    const url = item.audio_url;
    if (!url) return;
    setNowPlaying(url);
    setCurrentItem(item);
    if (audioRef.current) {
      audioRef.current.src = `${API}${url}`;
      audioRef.current.play();
    }
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play();
    else audioRef.current.pause();
  }

  const params = currentItem?.params || {};
  const fmtTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] text-white">

      {/* ── NOW PLAYING BAR ─────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-violet-900/40 to-black border-b border-white/10 p-4">
        <div className="flex items-center gap-4">
          {/* Album art placeholder */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-900 flex items-center justify-center text-2xl flex-shrink-0">
            🎼
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{currentItem?.title || "Sky Music"}</div>
            <div className="text-xs opacity-50 mt-0.5">
              {params.key} {params.scale} · {params.mood} · {params.archetype}
            </div>
            {/* Progress */}
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10px] opacity-40 w-8">{fmtTime(progress)}</span>
              <div
                className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer"
                onClick={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  if (audioRef.current) audioRef.current.currentTime = pct * duration;
                }}
              >
                <div className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: duration ? `${(progress/duration)*100}%` : "0%" }} />
              </div>
              <span className="text-[10px] opacity-40 w-8">{fmtTime(duration)}</span>
            </div>
          </div>
          <button
            onClick={togglePlay}
            disabled={!nowPlaying}
            className="w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-30
              flex items-center justify-center text-xl transition-all flex-shrink-0"
          >
            {audioRef.current?.paused === false ? "⏸" : "▶"}
          </button>
        </div>

        {/* Track energy bars */}
        {currentItem?.structure && (
          <div className="mt-3 space-y-1">
            <TrackBar label="melody"  color="#8b5cf6" energy={0.75} />
            <TrackBar label="chords"  color="#6366f1" energy={0.65} />
            <TrackBar label="bass"    color="#3b82f6" energy={0.55} />
            <TrackBar label="lead"    color="#a78bfa" energy={0.45} />
            <TrackBar label="drums"   color="#7c3aed" energy={0.70} />
          </div>
        )}

        <audio
          ref={audioRef}
          onTimeUpdate={() => setProgress(audioRef.current?.currentTime || 0)}
          onDurationChange={() => setDuration(audioRef.current?.duration || 0)}
          onEnded={() => setNowPlaying(null)}
        />
      </div>

      {/* ── COMPOSE BOX ─────────────────────────────────────── */}
      <div className="flex-shrink-0 p-4 border-b border-white/10">
        <div className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-2">
          🎵 Compose with Sky Music
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm
              placeholder:opacity-30 focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="a sad jazz piano in C minor… an epic orchestral battle theme… lo-fi chill beats…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && compose()}
          />
          <button
            onClick={compose}
            disabled={loading || !prompt.trim()}
            className="px-5 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40
              font-semibold text-sm transition-all flex items-center gap-2 flex-shrink-0"
          >
            {loading ? (
              <span className="animate-spin">⟳</span>
            ) : "✦ Compose"}
          </button>
        </div>
        {status && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg
            ${status.ok === true ? "bg-green-500/15 text-green-300" :
              status.ok === false ? "bg-red-500/15 text-red-300" :
              "bg-violet-500/15 text-violet-300"}`}>
            {status.message}
          </div>
        )}
        <div className="mt-2 flex gap-2 flex-wrap">
          {["sad jazz piano · C minor · slow","epic orchestral · D minor · allegro",
            "lo-fi hip hop · F major · 85bpm","driving metal riff · E minor · fast",
            "ambient drone · whole tone scale"].map(ex => (
            <button key={ex}
              onClick={() => setPrompt(ex)}
              className="text-[10px] px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 opacity-50 hover:opacity-80 transition-all">
              {ex.split("·")[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {/* ── HISTORY ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-xs font-semibold uppercase tracking-wider opacity-40 mb-3">
          Recent Compositions ({history.length})
        </div>
        {history.length === 0 ? (
          <div className="text-center py-12 opacity-30">
            <div className="text-4xl mb-3">🎼</div>
            <div className="text-sm">No compositions yet — write a prompt above to compose your first piece</div>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((item, i) => (
              <CompositionCard key={i} item={item} onPlay={playItem} playing={nowPlaying} />
            ))}
          </div>
        )}
      </div>

      {/* ── THEORY BADGE ───────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-white/5 flex items-center gap-2">
        <div className="text-[10px] opacity-30">
          ✦ Sky Music — theory-first composition · zero data interpolation · FluidSynth render
        </div>
      </div>
    </div>
  );
}
