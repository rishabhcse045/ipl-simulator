"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room, TeamStanding, Fixture, IPLTeam,
  TEAM_COLORS, TEAM_FULL_NAMES,
} from "@/types/game";
import {
  initSeason, updateStandings, advanceFixture,
  isLeagueComplete, generatePlayoffs, formatNRR,
  generateMatchDrama, updateFinalTeams,
} from "@/lib/seasonManager";

export default function StandingsPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = params.roomId as string;

  const [room, setRoom]         = useState<Room | null>(null);
  const [uid, setUid]           = useState("");
  const [myTeam, setMyTeam]     = useState<IPLTeam | null>(null);
  const [tab, setTab]           = useState<"standings" | "fixtures" | "results">("standings");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [isRecording, setIsRecording] = useState(false); // Bug 1 guard

  useEffect(() => {
    const stored = sessionStorage.getItem("uid");
    if (!stored) { router.push("/"); return; }
    setUid(stored);
  }, [router]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (!snap.exists()) return;
      const data: Room = snap.val();
      setRoom(data);
      // Fix Bug 4: derive myTeam here using the latest uid from sessionStorage
      // so we don't depend on the uid state being set first
      const currentUid = sessionStorage.getItem("uid") ?? "";
      if (currentUid && data.players[currentUid]) {
        setMyTeam(data.players[currentUid].team);
      }
    });
    return () => unsub();
  }, [roomId, uid]);

  // ── Initialize season if not yet done ─────────────────
  async function initializeSeasonIfNeeded(currentRoom: Room) {
    if (!currentRoom || currentRoom.season) return;
    const teams = Object.values(currentRoom.players)
      .map((p) => p.team)
      .filter(Boolean) as IPLTeam[];
    const season = initSeason(teams);
    await update(ref(db, `rooms/${roomId}`), { season, updatedAt: Date.now() });
  }

  useEffect(() => {
    if (room && !room.season && room.phase === "season") {
      initializeSeasonIfNeeded(room); // Fix Bug 2: pass room directly, not via closure
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.phase, room?.season]);

  // ── After match completes, update season ──────────────
  async function recordMatchResult() {
    if (!room?.currentMatch || !room.season) return;
    const match = room.currentMatch;
    if (match.phase !== "completed" || !match.result) return;

    // Bug 1 fix: prevent double-firing
    if (isRecording) return;
    setIsRecording(true);

    setLoading(true); setError("");
    try {
      const inn1 = match.innings1!;
      const inn2 = match.innings2!;

      // Update standings
      let standings = updateStandings(
        room.season.standings,
        match.result,
        inn1.totalRuns, inn1.totalOvers,
        inn2.totalRuns, inn2.totalOvers,
        inn1.battingTeam,
        inn2.battingTeam,
      );

      // Advance fixture
      let season = advanceFixture(room.season, match.matchId, match.result);
      season = { ...season, standings };

      // Generate drama events
      const drama = generateMatchDrama(room, match.matchNumber, [match.result]);
      if (drama.length > 0) {
        season.dramaEvents = [...(season.dramaEvents ?? []), ...drama];
      }

      // Bug 3 fix: check if league is done — generate playoffs
      if (isLeagueComplete(season)) {
        const teams = Object.values(room.players).map((p) => p.team).filter(Boolean) as IPLTeam[];
        season = generatePlayoffs(season, teams);
        // Don't try to update final teams here — semi results don't exist yet.
        // updateFinalTeams is called after semis complete (handled separately).
      }

      // Bug 3 fix: if both semis are now complete, update the final fixture teams
      const semi1 = season.fixtures.find((f) => f.stage === "semi1");
      const semi2 = season.fixtures.find((f) => f.stage === "semi2");
      if (semi1?.result && semi2?.result) {
        season = updateFinalTeams(season, semi1.result.winner, semi2.result.winner);
      }

      await update(ref(db, `rooms/${roomId}`), {
        season,
        currentMatch: null,
        updatedAt: Date.now(),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setIsRecording(false);
    }
  }

  // Navigate to next match (via pregame for toss + XI selection)
  async function goToNextMatch() {
    if (!room?.season?.currentMatchId) return;
    setLoading(true); setError("");
    try {
      // Clear any previous pregame state so a fresh toss/XI selection happens
      await update(ref(db, `rooms/${roomId}`), {
        pregame: null,
        updatedAt: Date.now(),
      });
      router.push(`/room/${roomId}/pregame`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Champion screen ────────────────────────────────────
  if (room?.season?.champion) {
    const champion = room.season.champion;
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.championCard}>
          <div style={styles.trophy}>🏆</div>
          <p style={styles.championLabel}>IPL CHAMPION</p>
          <h1 style={{ ...styles.championName, color: TEAM_COLORS[champion] }}>
            {TEAM_FULL_NAMES[champion]}
          </h1>
          <p style={styles.championShort}>{champion}</p>
          <p style={styles.congratsText}>
            Congratulations! What a season it has been. {champion} are the champions!
          </p>
        </div>
      </main>
    );
  }

  if (!room) return (
    <div style={styles.center}>
      <p style={styles.muted}>Loading standings…</p>
    </div>
  );

  const season    = room.season;
  const standings = season?.standings ?? [];
  const fixtures  = season?.fixtures  ?? [];
  const completed = fixtures.filter((f) => f.status === "completed");
  const scheduled = fixtures.filter((f) => f.status === "scheduled");
  const isHost    = uid ? room.players[uid]?.isHost : false;
  const matchDone = room.currentMatch?.phase === "completed";
  const nextMatch = season?.fixtures.find((f) => f.matchId === season.currentMatchId);

  return (
    <main style={styles.main}>
      <div style={styles.grid} aria-hidden />

      <div style={styles.container}>

        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>🏏 IPL Season</h1>
          <span style={styles.matchCount}>
            {completed.length} / {fixtures.filter((f) => f.stage === "league").length} matches played
          </span>
        </div>

        {/* Match done — record result button */}
        {matchDone && isHost && (
          <div style={styles.actionBanner}>
            <p style={styles.actionText}>
              ✓ Match complete — {room.currentMatch?.result?.summary}
            </p>
            <button
              style={{ ...styles.actionBtn, ...(loading ? styles.disabled : {}) }}
              onClick={recordMatchResult}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save Result & Continue →"}
            </button>
            {error && <p style={styles.errorText}>{error}</p>}
          </div>
        )}

        {/* Next match banner */}
        {!matchDone && nextMatch && isHost && (
          <div style={styles.nextMatchBanner}>
            <div style={styles.nextMatchTeams}>
              <span style={{ color: TEAM_COLORS[nextMatch.team1] }}>{nextMatch.team1}</span>
              <span style={styles.vs}>vs</span>
              <span style={{ color: TEAM_COLORS[nextMatch.team2] }}>{nextMatch.team2}</span>
            </div>
            <button style={styles.playBtn} onClick={goToNextMatch}>
              ▶ Play Next Match
            </button>
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabs}>
          {(["standings", "fixtures", "results"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* STANDINGS TAB */}
        {tab === "standings" && (
          <div style={styles.panel}>
            {/* Table header */}
            <div style={styles.tableHeader}>
              <span style={{ ...styles.th, flex: 2 }}>Team</span>
              <span style={styles.th}>P</span>
              <span style={styles.th}>W</span>
              <span style={styles.th}>L</span>
              <span style={styles.th}>Pts</span>
              <span style={styles.th}>NRR</span>
            </div>

            {standings.map((s, i) => {
              const isMe     = s.team === myTeam;
              const color    = TEAM_COLORS[s.team];
              const inPlayoffs = room.season?.playoffTeams?.includes(s.team);
              return (
                <div key={s.team} style={{
                  ...styles.tableRow,
                  ...(isMe ? { background: color + "0a", borderColor: color + "33" } : {}),
                }}>
                  <span style={{ ...styles.td, flex: 2, gap: "10px", display: "flex", alignItems: "center" }}>
                    <span style={styles.pos}>{i + 1}</span>
                    <span style={{ color, fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
                      {s.team}
                    </span>
                    {isMe && <span style={styles.youTag}>YOU</span>}
                    {inPlayoffs && <span style={{ ...styles.playoffTag, borderColor: color, color }}>Q</span>}
                  </span>
                  <span style={styles.td}>{s.played}</span>
                  <span style={{ ...styles.td, color: "#4caf50" }}>{s.won}</span>
                  <span style={{ ...styles.td, color: "#ff5f57" }}>{s.lost}</span>
                  <span style={{ ...styles.td, fontWeight: 700, color: "#ffc800" }}>{s.points}</span>
                  <span style={{ ...styles.td, fontFamily: "'Courier New', monospace", fontSize: "12px", color: s.nrr >= 0 ? "#4caf50" : "#ff5f57" }}>
                    {formatNRR(s.nrr)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* FIXTURES TAB */}
        {tab === "fixtures" && (
          <div style={styles.panel}>
            {scheduled.length === 0 && (
              <p style={styles.emptyText}>No upcoming fixtures</p>
            )}
            {scheduled.map((f) => (
              <div key={f.matchId} style={styles.fixtureRow}>
                <span style={styles.fixtureNum}>#{f.matchNumber}</span>
                <span style={{ color: TEAM_COLORS[f.team1], fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
                  {f.team1}
                </span>
                <span style={styles.vs}>vs</span>
                <span style={{ color: TEAM_COLORS[f.team2], fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
                  {f.team2}
                </span>
                <span style={{ ...styles.stageBadge, marginLeft: "auto" }}>
                  {f.stage === "league" ? "League" : f.stage.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* RESULTS TAB */}
        {tab === "results" && (
          <div style={styles.panel}>
            {completed.length === 0 && (
              <p style={styles.emptyText}>No results yet</p>
            )}
            {[...completed].reverse().map((f) => (
              <div key={f.matchId} style={styles.resultRow}>
                <span style={styles.fixtureNum}>#{f.matchNumber}</span>
                <div style={styles.resultTeams}>
                  <span style={{
                    color: TEAM_COLORS[f.team1],
                    fontWeight: f.result?.winner === f.team1 ? 700 : 400,
                    fontFamily: "'Courier New', monospace",
                    opacity: f.result?.winner === f.team2 ? 0.5 : 1,
                  }}>
                    {f.team1}
                  </span>
                  <span style={styles.vs}>vs</span>
                  <span style={{
                    color: TEAM_COLORS[f.team2],
                    fontWeight: f.result?.winner === f.team2 ? 700 : 400,
                    fontFamily: "'Courier New', monospace",
                    opacity: f.result?.winner === f.team1 ? 0.5 : 1,
                  }}>
                    {f.team2}
                  </span>
                </div>
                {f.result && (
                  <span style={{ ...styles.resultSummary, color: TEAM_COLORS[f.result.winner] }}>
                    {f.result.summary}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Drama Events */}
        {season?.dramaEvents && season.dramaEvents.length > 0 && (
          <div style={styles.dramaSection}>
            <p style={styles.dramaTitle}>📰 Latest News</p>
            {season.dramaEvents.slice(-3).reverse().map((e) => (
              <div key={e.id} style={styles.dramaItem}>
                <span style={{ color: TEAM_COLORS[e.affectedTeam], fontWeight: 700, fontSize: "12px" }}>
                  {e.affectedTeam}
                </span>
                <span style={styles.dramaHeadline}>{e.headline}</span>
              </div>
            ))}
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
    padding: "20px",
    fontFamily: "'Georgia', serif",
    position: "relative",
  },
  grid: {
    position: "fixed", inset: 0,
    backgroundImage: "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0,
  },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" },
  container: { maxWidth: "680px", margin: "0 auto", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "16px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title:  { fontSize: "22px", color: "#f0ece0", margin: 0 },
  matchCount: { fontSize: "12px", color: "#45443e" },

  actionBanner: {
    background: "rgba(76,175,80,0.06)",
    border: "1px solid rgba(76,175,80,0.2)",
    borderRadius: "10px",
    padding: "16px 20px",
    display: "flex", flexDirection: "column", gap: "10px",
  },
  actionText: { fontSize: "14px", color: "#4caf50", margin: 0 },
  actionBtn: {
    padding: "11px", background: "#4caf50", color: "#0a0a0f",
    border: "none", borderRadius: "8px", fontSize: "14px",
    fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },

  nextMatchBanner: {
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.15)",
    borderRadius: "10px",
    padding: "16px 20px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  nextMatchTeams: { display: "flex", alignItems: "center", gap: "10px", fontSize: "16px", fontFamily: "'Courier New', monospace", fontWeight: 700 },
  vs: { fontSize: "12px", color: "#45443e" },
  playBtn: {
    padding: "10px 18px", background: "#ffc800", color: "#0a0a0f",
    border: "none", borderRadius: "8px", fontSize: "14px",
    fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },

  tabs: { display: "flex", gap: "4px", background: "#0d0d14", borderRadius: "10px", padding: "4px" },
  tab: {
    flex: 1, padding: "8px", border: "none", borderRadius: "7px",
    background: "transparent", color: "#6b6860", fontSize: "13px",
    fontFamily: "'Georgia', serif", cursor: "pointer",
  },
  tabActive: { background: "#1e1e2a", color: "#ffc800", fontWeight: 600 },

  panel: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    overflow: "hidden",
  },

  tableHeader: {
    display: "flex", padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
  },
  th: { flex: 1, fontSize: "10px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, textAlign: "center" as const },
  tableRow: {
    display: "flex", padding: "12px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    borderLeft: "2px solid transparent",
    alignItems: "center",
  },
  td: { flex: 1, fontSize: "13px", color: "#f0ece0", textAlign: "center" as const },
  pos: { fontSize: "12px", color: "#45443e", width: "16px" },
  youTag: {
    fontSize: "9px", background: "rgba(255,200,0,0.1)",
    color: "#ffc800", border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "4px", padding: "1px 5px", letterSpacing: "0.06em",
  },
  playoffTag: {
    fontSize: "9px", border: "1px solid",
    borderRadius: "4px", padding: "1px 5px", letterSpacing: "0.06em",
  },

  fixtureRow: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  fixtureNum: { fontSize: "11px", color: "#45443e", width: "28px" },
  stageBadge: {
    fontSize: "10px", color: "#6b6860",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "4px", padding: "2px 7px",
  },

  resultRow: {
    display: "flex", flexDirection: "column" as const, gap: "4px",
    padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  resultTeams: { display: "flex", alignItems: "center", gap: "10px" },
  resultSummary: { fontSize: "12px", fontStyle: "italic" },

  dramaSection: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "16px 20px",
    display: "flex", flexDirection: "column" as const, gap: "10px",
  },
  dramaTitle: { fontSize: "12px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: 0 },
  dramaItem: { display: "flex", gap: "10px", alignItems: "flex-start" },
  dramaHeadline: { fontSize: "13px", color: "#a09d94", flex: 1 },

  championCard: {
    maxWidth: "480px", margin: "80px auto",
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "16px", padding: "40px",
    textAlign: "center", position: "relative", zIndex: 1,
  },
  trophy: { fontSize: "56px", marginBottom: "12px" },
  championLabel: { fontSize: "11px", letterSpacing: "0.12em", color: "#6b6860", textTransform: "uppercase" as const, margin: "0 0 8px" },
  championName: { fontSize: "30px", fontWeight: 700, margin: "0 0 4px" },
  championShort: { fontSize: "14px", color: "#6b6860", fontFamily: "'Courier New', monospace", margin: "0 0 20px" },
  congratsText: { fontSize: "14px", color: "#a09d94", lineHeight: 1.6 },

  emptyText: { fontSize: "13px", color: "#45443e", padding: "20px", textAlign: "center" as const, margin: 0 },
  muted:     { color: "#6b6860", fontFamily: "'Georgia', serif" },
  errorText: { color: "#ff5f57", fontSize: "13px", margin: 0 },
  disabled:  { opacity: 0.4, cursor: "not-allowed" },
};