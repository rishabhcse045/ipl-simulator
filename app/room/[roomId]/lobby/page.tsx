"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import { Room, RoomPlayer, IPLTeam, TEAM_FULL_NAMES, TEAM_COLORS } from "@/types/game";

export default function LobbyPage() {
  const params           = useParams();
  const router           = useRouter();
  const roomId           = params.roomId as string;

  const [room, setRoom]       = useState<Room | null>(null);
  const [uid, setUid]         = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // ── Load uid from sessionStorage ──────────────────────────
  useEffect(() => {
    const storedUid = sessionStorage.getItem("uid");
    if (!storedUid) {
      router.push("/"); // kicked back if no session
      return;
    }
    setUid(storedUid);
  }, [router]);

  // ── Subscribe to Firebase room ─────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsub   = onValue(roomRef, (snap) => {
      if (!snap.exists()) return;
      setRoom(snap.val());
    });
    return () => unsub();
  }, [roomId]);

  // ── When room moves to auction phase, redirect ─────────────
  useEffect(() => {
    if (room?.phase === "auction") {
      router.push(`/room/${roomId}/auction`);
    }
  }, [room?.phase, roomId, router]);

  // ── Actions ───────────────────────────────────────────────

  async function selectTeam(team: IPLTeam) {
    if (myPlayer?.team === team) return; // already selected
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/room", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, uid, action: "select_team", team }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function markReady() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/room", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, uid, action: "set_ready" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────

  const players   = room ? Object.values(room.players) : [];
  const myPlayer  = players.find((p) => p.uid === uid);
  const takenTeams = new Set(players.map((p) => p.team).filter(Boolean) as IPLTeam[]);
  const allReady  = players.length >= 2 && players.every((p) => p.isReady);

  const teams: IPLTeam[] = [
    "MI","CSK","RCB","KKR","DC","RR","SRH","PBKS","LSG","GT",
  ];

  if (!room) {
    return (
      <div style={styles.center}>
        <p style={styles.loading}>Loading room…</p>
      </div>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.grid} aria-hidden />

      <div style={styles.container}>

        {/* Room Code Banner */}
        <div style={styles.roomBanner}>
          <span style={styles.roomLabel}>Room Code</span>
          <span style={styles.roomCode}>{roomId}</span>
          <span style={styles.roomHint}>Share this code with friends</span>
        </div>

        {/* Players in room */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Players Joined ({players.length})</h2>
          <div style={styles.playerList}>
            {players.map((p) => (
              <div key={p.uid} style={styles.playerRow}>
                <span style={styles.playerName}>
                  {p.displayName}
                  {p.isHost && <span style={styles.hostBadge}> HOST</span>}
                  {p.uid === uid && <span style={styles.youBadge}> YOU</span>}
                </span>
                <span style={{
                  ...styles.teamPill,
                  background: p.team ? TEAM_COLORS[p.team] + "22" : "transparent",
                  borderColor: p.team ? TEAM_COLORS[p.team] + "55" : "rgba(255,255,255,0.08)",
                  color: p.team ? TEAM_COLORS[p.team] : "#45443e",
                }}>
                  {p.team ?? "No team"}
                </span>
                <span style={p.isReady ? styles.readyDot : styles.waitDot}>
                  {p.isReady ? "Ready" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Team Selection */}
        {!myPlayer?.isReady && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Pick Your Team</h2>
            <div style={styles.teamGrid}>
              {teams.map((team) => {
                const taken     = takenTeams.has(team) && myPlayer?.team !== team;
                const selected  = myPlayer?.team === team;
                const color     = TEAM_COLORS[team];
                return (
                  <button
                    key={team}
                    disabled={taken || loading}
                    onClick={() => selectTeam(team)}
                    style={{
                      ...styles.teamBtn,
                      ...(selected ? {
                        background: color + "22",
                        borderColor: color,
                        color: color,
                      } : {}),
                      ...(taken ? styles.teamBtnTaken : {}),
                    }}
                  >
                    <span style={styles.teamShort}>{team}</span>
                    <span style={styles.teamFull}>{TEAM_FULL_NAMES[team]}</span>
                    {taken && <span style={styles.takenLabel}>Taken</span>}
                    {selected && <span style={styles.selectedLabel}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && <p style={styles.error}>{error}</p>}

        {/* Ready Button */}
        {myPlayer?.team && !myPlayer.isReady && (
          <button
            style={{ ...styles.readyBtn, ...(loading ? styles.readyBtnDisabled : {}) }}
            onClick={markReady}
            disabled={loading}
          >
            {loading ? "Please wait…" : `Lock in ${myPlayer.team} — I'm Ready!`}
          </button>
        )}

        {/* Waiting message */}
        {myPlayer?.isReady && !allReady && (
          <div style={styles.waitingBox}>
            <p style={styles.waitingText}>
              ✓ You're ready! Waiting for others to lock in their teams…
            </p>
          </div>
        )}

        {/* All ready */}
        {allReady && (
          <div style={styles.allReadyBox}>
            <p style={styles.allReadyText}>
              🚀 Everyone's ready! Starting auction…
            </p>
          </div>
        )}

      </div>
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#0a0a0f",
    padding: "24px",
    fontFamily: "'Georgia', serif",
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    position: "fixed",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none",
    zIndex: 0,
  },
  container: {
    maxWidth: "640px",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  center: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0a0a0f",
  },
  loading: {
    color: "#6b6860",
    fontFamily: "'Georgia', serif",
  },
  roomBanner: {
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "12px",
    padding: "20px 24px",
    textAlign: "center",
    marginBottom: "24px",
  },
  roomLabel: {
    display: "block",
    fontSize: "11px",
    letterSpacing: "0.1em",
    color: "#6b6860",
    textTransform: "uppercase",
    marginBottom: "6px",
  },
  roomCode: {
    display: "block",
    fontSize: "32px",
    fontFamily: "'Courier New', monospace",
    fontWeight: "700",
    color: "#ffc800",
    letterSpacing: "0.12em",
    marginBottom: "4px",
  },
  roomHint: {
    fontSize: "12px",
    color: "#45443e",
  },
  section: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "20px 24px",
    marginBottom: "16px",
  },
  sectionTitle: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#6b6860",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    margin: "0 0 16px",
  },
  playerList: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  playerRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  playerName: {
    flex: 1,
    fontSize: "15px",
    color: "#f0ece0",
  },
  hostBadge: {
    fontSize: "10px",
    background: "rgba(255,200,0,0.1)",
    color: "#ffc800",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "4px",
    padding: "1px 6px",
    marginLeft: "6px",
    letterSpacing: "0.06em",
  },
  youBadge: {
    fontSize: "10px",
    background: "rgba(255,255,255,0.06)",
    color: "#6b6860",
    borderRadius: "4px",
    padding: "1px 6px",
    marginLeft: "4px",
  },
  teamPill: {
    fontSize: "12px",
    fontFamily: "'Courier New', monospace",
    fontWeight: "700",
    padding: "3px 10px",
    borderRadius: "20px",
    border: "1px solid",
    letterSpacing: "0.06em",
  },
  readyDot: {
    fontSize: "11px",
    color: "#4caf50",
  },
  waitDot: {
    fontSize: "11px",
    color: "#45443e",
  },
  teamGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "10px",
  },
  teamBtn: {
    background: "#0d0d14",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "8px",
    padding: "12px 14px",
    cursor: "pointer",
    textAlign: "left",
    position: "relative",
    transition: "all 0.15s",
    color: "#f0ece0",
  },
  teamBtnTaken: {
    opacity: 0.35,
    cursor: "not-allowed",
  },
  teamShort: {
    display: "block",
    fontSize: "16px",
    fontFamily: "'Courier New', monospace",
    fontWeight: "700",
    letterSpacing: "0.06em",
    marginBottom: "2px",
  },
  teamFull: {
    display: "block",
    fontSize: "11px",
    color: "#6b6860",
  },
  takenLabel: {
    position: "absolute",
    top: "8px",
    right: "10px",
    fontSize: "10px",
    color: "#45443e",
  },
  selectedLabel: {
    position: "absolute",
    top: "8px",
    right: "10px",
    fontSize: "14px",
    color: "#4caf50",
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
  readyBtn: {
    width: "100%",
    padding: "14px",
    background: "#ffc800",
    color: "#0a0a0f",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    fontFamily: "'Georgia', serif",
    cursor: "pointer",
    marginBottom: "12px",
  },
  readyBtnDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  waitingBox: {
    background: "rgba(76,175,80,0.06)",
    border: "1px solid rgba(76,175,80,0.2)",
    borderRadius: "8px",
    padding: "14px",
    textAlign: "center",
  },
  waitingText: {
    color: "#4caf50",
    fontSize: "14px",
    margin: 0,
  },
  allReadyBox: {
    background: "rgba(255,200,0,0.06)",
    border: "1px solid rgba(255,200,0,0.25)",
    borderRadius: "8px",
    padding: "14px",
    textAlign: "center",
  },
  allReadyText: {
    color: "#ffc800",
    fontSize: "14px",
    margin: 0,
  },
};