"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  const [name, setName]       = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [tab, setTab]         = useState<"create" | "join">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleCreate() {
    if (!name.trim()) return setError("Enter your name first");
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", hostName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Save uid to sessionStorage so lobby can read it
      sessionStorage.setItem("uid",  data.uid);
      sessionStorage.setItem("name", name.trim());
      router.push(`/room/${data.roomId}/lobby`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!name.trim())     return setError("Enter your name first");
    if (!roomCode.trim()) return setError("Enter a room code");
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", roomId: roomCode.trim().toUpperCase(), playerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem("uid",  data.uid);
      sessionStorage.setItem("name", name.trim());
      router.push(`/room/${roomCode.trim().toUpperCase()}/lobby`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      {/* Background grid */}
      <div style={styles.grid} aria-hidden />

      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.badge}>🏏 IPL SIMULATOR</span>
          <h1 style={styles.title}>Play a full IPL season<br />with your friends</h1>
          <p style={styles.sub}>Auction · Strategy · Drama · Champion</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(["create", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t === "create" ? "Create Room" : "Join Room"}
            </button>
          ))}
        </div>

        {/* Name input — shared */}
        <div style={styles.field}>
          <label style={styles.label}>Your Name</label>
          <input
            style={styles.input}
            placeholder="e.g. Rizz Boy"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (tab === "create" ? handleCreate() : handleJoin())}
          />
        </div>

        {/* Room code input — join only */}
        {tab === "join" && (
          <div style={styles.field}>
            <label style={styles.label}>Room Code</label>
            <input
              style={{ ...styles.input, ...styles.inputMono }}
              placeholder="IPL-9324"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
          </div>
        )}

        {/* Error */}
        {error && <p style={styles.error}>{error}</p>}

        {/* CTA */}
        <button
          style={{ ...styles.cta, ...(loading ? styles.ctaLoading : {}) }}
          onClick={tab === "create" ? handleCreate : handleJoin}
          disabled={loading}
        >
          {loading ? "Please wait…" : tab === "create" ? "Create Room →" : "Join Room →"}
        </button>

        {/* Info */}
        <p style={styles.hint}>
          {tab === "create"
            ? "You'll get a room code to share with friends (2–10 players)"
            : "Ask your friend for the IPL-XXXX code"}
        </p>
      </div>
    </main>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#0a0a0f",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Georgia', serif",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,200,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.04) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none",
  },
  card: {
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.15)",
    borderRadius: "16px",
    padding: "40px 36px",
    width: "100%",
    maxWidth: "420px",
    position: "relative",
    zIndex: 1,
  },
  header: {
    marginBottom: "28px",
    textAlign: "center",
  },
  badge: {
    display: "inline-block",
    fontSize: "11px",
    letterSpacing: "0.12em",
    color: "#ffc800",
    background: "rgba(255,200,0,0.08)",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "20px",
    padding: "4px 12px",
    marginBottom: "16px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "700",
    color: "#f0ece0",
    margin: "0 0 8px",
    lineHeight: 1.3,
  },
  sub: {
    fontSize: "13px",
    color: "#6b6860",
    margin: 0,
    letterSpacing: "0.06em",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    marginBottom: "24px",
    background: "#0d0d14",
    borderRadius: "10px",
    padding: "4px",
  },
  tab: {
    flex: 1,
    padding: "9px",
    border: "none",
    borderRadius: "8px",
    background: "transparent",
    color: "#6b6860",
    fontSize: "13px",
    fontFamily: "'Georgia', serif",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "#1e1e2a",
    color: "#ffc800",
    fontWeight: "600",
  },
  field: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    fontSize: "11px",
    color: "#6b6860",
    letterSpacing: "0.08em",
    marginBottom: "6px",
    textTransform: "uppercase",
  },
  input: {
    width: "100%",
    background: "#0d0d14",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    padding: "11px 14px",
    color: "#f0ece0",
    fontSize: "15px",
    fontFamily: "'Georgia', serif",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
  inputMono: {
    fontFamily: "'Courier New', monospace",
    letterSpacing: "0.12em",
    fontSize: "16px",
  },
  error: {
    color: "#ff5f57",
    fontSize: "13px",
    marginBottom: "12px",
    padding: "8px 12px",
    background: "rgba(255,95,87,0.08)",
    borderRadius: "6px",
    border: "1px solid rgba(255,95,87,0.2)",
  },
  cta: {
    width: "100%",
    padding: "13px",
    background: "#ffc800",
    color: "#0a0a0f",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    fontFamily: "'Georgia', serif",
    cursor: "pointer",
    transition: "opacity 0.15s",
    marginBottom: "12px",
  },
  ctaLoading: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  hint: {
    fontSize: "12px",
    color: "#45443e",
    textAlign: "center",
    margin: 0,
  },
};