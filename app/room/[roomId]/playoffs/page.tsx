"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room, Fixture, IPLTeam,
  TEAM_COLORS, TEAM_FULL_NAMES,
} from "@/types/game";
import { updateFinalTeams } from "@/lib/seasonManager";

export default function PlayoffsPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = params.roomId as string;

  const [room, setRoom]     = useState<Room | null>(null);
  const [uid, setUid]       = useState("");
  const [myTeam, setMyTeam] = useState<IPLTeam | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

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
      if (uid && data.players[uid]) setMyTeam(data.players[uid].team);
    });
    return () => unsub();
  }, [roomId, uid]);

  // ── After a playoff match, save result ────────────────
  async function savePlayoffResult() {
    if (!room?.currentMatch || !room.season) return;
    const match = room.currentMatch;
    if (match.phase !== "completed" || !match.result) return;

    setLoading(true); setError("");
    try {
      let season = { ...room.season };

      // Mark fixture complete
      season.fixtures = season.fixtures.map((f) =>
        f.matchId === match.matchId
          ? { ...f, status: "completed", result: match.result }
          : f
      );
      season.completedMatches = [...season.completedMatches, match.matchId];

      // If semi is done, update final teams
      const semi1 = season.fixtures.find((f) => f.stage === "semi1");
      const semi2 = season.fixtures.find((f) => f.stage === "semi2");
      if (semi1?.result && semi2?.result) {
        season = updateFinalTeams(season, semi1.result.winner, semi2.result.winner);
      }

      // If final is done, crown champion
      const final = season.fixtures.find((f) => f.stage === "final");
      if (final?.status === "completed" && match.stage === "final" && match.result) {
        season.champion = match.result.winner;
        await update(ref(db, `rooms/${roomId}`), {
          season,
          phase:        "completed",
          currentMatch: null,
          updatedAt:    Date.now(),
        });
        return;
      }

      // Find next playoff fixture
      const next = season.fixtures.find(
        (f) => f.status === "scheduled" && f.stage !== "league"
      );
      season.currentMatchId = next?.matchId ?? null;

      await update(ref(db, `rooms/${roomId}`), {
        season,
        currentMatch: null,
        updatedAt:    Date.now(),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Start next playoff match ───────────────────────────
  async function startPlayoffMatch(fixture: Fixture) {
    if (!fixture || fixture.team1 === "TBD" as any || fixture.team2 === "TBD" as any) {
      return setError("Teams not yet determined");
    }
    setLoading(true); setError("");
    const res = await fetch("/api/match/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:      "start_match",
        roomId,
        matchId:     fixture.matchId,
        matchNumber: fixture.matchNumber,
        stage:       fixture.stage,
        team1:       fixture.team1,
        team2:       fixture.team2,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setLoading(false); return; }
    router.push(`/room/${roomId}/match`);
    setLoading(false);
  }

  if (!room) return (
    <div style={styles.center}>
      <p style={styles.muted}>Loading playoffs…</p>
    </div>
  );

  const season   = room.season;
  const isHost   = uid ? room.players[uid]?.isHost : false;
  const matchDone = room.currentMatch?.phase === "completed";

  const semi1    = season?.fixtures.find((f) => f.stage === "semi1");
  const semi2    = season?.fixtures.find((f) => f.stage === "semi2");
  const final    = season?.fixtures.find((f) => f.stage === "final");
  const champion = season?.champion;

  // ── Champion screen ────────────────────────────────────
  if (champion) {
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.championCard}>
          <div style={styles.confetti}>🎊🏆🎊</div>
          <p style={styles.championLabel}>IPL CHAMPION</p>
          <h1 style={{ ...styles.championName, color: TEAM_COLORS[champion] }}>
            {TEAM_FULL_NAMES[champion]}
          </h1>
          <p style={styles.championShort}>{champion}</p>
          {myTeam === champion && (
            <div style={styles.winnerBanner}>
              🎉 Congratulations! Your team won the IPL!
            </div>
          )}
          <button
            style={styles.resumeBtn}
            onClick={() => router.push(`/room/${roomId}/standings`)}
          >
            View Final Standings →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.grid} aria-hidden />

      <div style={styles.container}>
        <h1 style={styles.title}>🏆 Playoffs</h1>

        {/* Match complete — save result */}
        {matchDone && isHost && (
          <div style={styles.actionBanner}>
            <p style={styles.actionText}>
              ✓ {room.currentMatch?.result?.summary}
            </p>
            <button
              style={{ ...styles.actionBtn, ...(loading ? styles.disabled : {}) }}
              onClick={savePlayoffResult}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save Result →"}
            </button>
            {error && <p style={styles.errorText}>{error}</p>}
          </div>
        )}

        {/* Bracket */}
        <div style={styles.bracket}>

          {/* Semi Finals */}
          {(semi1 || semi2) && (
            <div style={styles.bracketRound}>
              <p style={styles.roundLabel}>Semi Finals</p>
              {[semi1, semi2].map((semi, i) => semi && (
                <MatchCard
                  key={i}
                  fixture={semi}
                  myTeam={myTeam}
                  isHost={isHost}
                  loading={loading}
                  onPlay={() => startPlayoffMatch(semi)}
                />
              ))}
            </div>
          )}

          {/* Arrow */}
          {(semi1 || semi2) && final && (
            <div style={styles.bracketArrow}>→</div>
          )}

          {/* Final */}
          {final && (
            <div style={styles.bracketRound}>
              <p style={styles.roundLabel}>Final</p>
              <MatchCard
                fixture={final}
                myTeam={myTeam}
                isHost={isHost}
                loading={loading}
                onPlay={() => startPlayoffMatch(final)}
                isFinal
              />
            </div>
          )}

          {/* If only final (3 teams: round robin + final) */}
          {!semi1 && !semi2 && final && (
            <div style={styles.bracketRound}>
              <p style={styles.roundLabel}>Final</p>
              <MatchCard
                fixture={final}
                myTeam={myTeam}
                isHost={isHost}
                loading={loading}
                onPlay={() => startPlayoffMatch(final)}
                isFinal
              />
            </div>
          )}
        </div>

        {/* Playoff teams */}
        {season?.playoffTeams && season.playoffTeams.length > 0 && (
          <div style={styles.teamsPanel}>
            <p style={styles.teamsPanelTitle}>Qualified Teams</p>
            <div style={styles.teamsPanelRow}>
              {season.playoffTeams.map((team) => (
                <div key={team} style={{
                  ...styles.teamChip,
                  borderColor: TEAM_COLORS[team] + "55",
                  background:  TEAM_COLORS[team] + "11",
                }}>
                  <span style={{ color: TEAM_COLORS[team], fontFamily: "'Courier New', monospace", fontWeight: 700 }}>
                    {team}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── Match Card Component ───────────────────────────────────

function MatchCard({
  fixture, myTeam, isHost, loading, onPlay, isFinal = false,
}: {
  fixture:  Fixture;
  myTeam:   IPLTeam | null;
  isHost:   boolean;
  loading:  boolean;
  onPlay:   () => void;
  isFinal?: boolean;
}) {
  const isTBD     = (fixture.team1 as any) === "TBD" || (fixture.team2 as any) === "TBD";
  const isDone    = fixture.status === "completed";
  const isLive    = fixture.status === "in_progress";
  const canPlay   = isHost && !isDone && !isTBD;
  const myInMatch = myTeam && (fixture.team1 === myTeam || fixture.team2 === myTeam);

  return (
    <div style={{
      ...styles.matchCard,
      ...(isFinal ? styles.matchCardFinal : {}),
      ...(myInMatch ? { borderColor: (myTeam ? TEAM_COLORS[myTeam] : "#ffc800") + "44" } : {}),
    }}>
      {isFinal && <span style={styles.finalBadge}>🏆 FINAL</span>}

      <div style={styles.matchTeams}>
        <TeamSlot team={fixture.team1} winner={fixture.result?.winner} isTBD={isTBD} />
        <span style={styles.vsSmall}>vs</span>
        <TeamSlot team={fixture.team2} winner={fixture.result?.winner} isTBD={isTBD} />
      </div>

      {isDone && fixture.result && (
        <p style={{ ...styles.resultText, color: TEAM_COLORS[fixture.result.winner] }}>
          {fixture.result.summary}
        </p>
      )}

      {canPlay && (
        <button
          style={{ ...styles.playMatchBtn, ...(loading ? styles.disabled : {}) }}
          onClick={onPlay}
          disabled={loading}
        >
          {loading ? "Starting…" : "▶ Play Match"}
        </button>
      )}

      {isTBD && (
        <p style={styles.tbdText}>Waiting for semi-final results…</p>
      )}
    </div>
  );
}

function TeamSlot({
  team, winner, isTBD,
}: {
  team:    IPLTeam | "TBD";
  winner?: IPLTeam;
  isTBD:   boolean;
}) {
  if (isTBD || (team as any) === "TBD") {
    return <span style={styles.tbdSlot}>TBD</span>;
  }
  const won   = winner === team;
  const lost  = winner && winner !== team;
  const color = TEAM_COLORS[team as IPLTeam];
  return (
    <span style={{
      ...styles.teamSlot,
      color,
      opacity:    lost ? 0.4 : 1,
      fontWeight: won  ? 700 : 400,
    }}>
      {won && "🏆 "}
      {team}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh", background: "#0a0a0f",
    padding: "20px", fontFamily: "'Georgia', serif", position: "relative",
  },
  grid: {
    position: "fixed", inset: 0,
    backgroundImage: "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0,
  },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" },
  container: { maxWidth: "680px", margin: "0 auto", position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "20px" },
  title: { fontSize: "22px", color: "#f0ece0", margin: 0 },

  actionBanner: {
    background: "rgba(76,175,80,0.06)", border: "1px solid rgba(76,175,80,0.2)",
    borderRadius: "10px", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px",
  },
  actionText: { fontSize: "14px", color: "#4caf50", margin: 0 },
  actionBtn: {
    padding: "11px", background: "#4caf50", color: "#0a0a0f",
    border: "none", borderRadius: "8px", fontSize: "14px",
    fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },

  bracket: { display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" as const },
  bracketRound: { display: "flex", flexDirection: "column" as const, gap: "12px", flex: 1, minWidth: "220px" },
  bracketArrow: { fontSize: "24px", color: "#45443e" },
  roundLabel: { fontSize: "11px", color: "#45443e", letterSpacing: "0.1em", textTransform: "uppercase" as const, margin: 0 },

  matchCard: {
    background: "#13131a", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px", padding: "16px 20px",
    display: "flex", flexDirection: "column" as const, gap: "12px",
  },
  matchCardFinal: { border: "1px solid rgba(255,200,0,0.2)" },
  finalBadge: {
    fontSize: "10px", color: "#ffc800", letterSpacing: "0.1em",
    background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "20px", padding: "3px 10px", alignSelf: "flex-start",
  },
  matchTeams: { display: "flex", alignItems: "center", gap: "12px" },
  teamSlot: { fontSize: "18px", fontFamily: "'Courier New', monospace", flex: 1 },
  tbdSlot:  { fontSize: "14px", color: "#45443e", fontFamily: "'Courier New', monospace", flex: 1 },
  vsSmall:  { fontSize: "11px", color: "#45443e" },
  resultText: { fontSize: "13px", fontStyle: "italic", margin: 0 },
  playMatchBtn: {
    padding: "10px", background: "#ffc800", color: "#0a0a0f",
    border: "none", borderRadius: "7px", fontSize: "13px",
    fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },
  tbdText: { fontSize: "12px", color: "#45443e", margin: 0 },

  teamsPanel: {
    background: "#13131a", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px", padding: "16px 20px",
  },
  teamsPanelTitle: { fontSize: "11px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 12px" },
  teamsPanelRow: { display: "flex", flexWrap: "wrap" as const, gap: "8px" },
  teamChip: { padding: "6px 14px", borderRadius: "20px", border: "1px solid", fontSize: "13px" },

  championCard: {
    maxWidth: "480px", margin: "60px auto", background: "#13131a",
    border: "1px solid rgba(255,200,0,0.2)", borderRadius: "16px",
    padding: "40px", textAlign: "center", position: "relative", zIndex: 1,
  },
  confetti:       { fontSize: "40px", marginBottom: "12px" },
  championLabel:  { fontSize: "11px", letterSpacing: "0.12em", color: "#6b6860", textTransform: "uppercase" as const, margin: "0 0 8px" },
  championName:   { fontSize: "30px", fontWeight: 700, margin: "0 0 4px" },
  championShort:  { fontSize: "14px", color: "#6b6860", fontFamily: "'Courier New', monospace", margin: "0 0 20px" },
  winnerBanner: {
    background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "8px", padding: "12px", fontSize: "14px", color: "#ffc800", marginBottom: "16px",
  },
  resumeBtn: {
    width: "100%", padding: "13px", background: "#ffc800", color: "#0a0a0f",
    border: "none", borderRadius: "8px", fontSize: "15px",
    fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },

  muted:     { color: "#6b6860", fontFamily: "'Georgia', serif" },
  errorText: { color: "#ff5f57", fontSize: "13px", margin: 0 },
  disabled:  { opacity: 0.4, cursor: "not-allowed" },
};