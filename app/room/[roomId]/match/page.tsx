"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room, Match, Innings,
  IPLTeam, TEAM_COLORS,
} from "@/types/game";

export default function MatchPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = params.roomId as string;

  const [room, setRoom]             = useState<Room | null>(null);
  const [uid, setUid]               = useState("");
  const [myTeam, setMyTeam]         = useState<IPLTeam | null>(null);
  const [commentary, setCommentary] = useState<string[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [autoPlay, setAutoPlay]     = useState(false);
  const [error, setError]           = useState("");
  const autoRef    = useRef(autoPlay);
  const commentRef = useRef<HTMLDivElement>(null);
  autoRef.current  = autoPlay;

  // ── Session ───────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("uid");
    if (!stored) { router.push("/"); return; }
    setUid(stored);
  }, [router]);

  // ── Firebase listener ─────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (!snap.exists()) return;
      const data: Room = snap.val();
      setRoom(data);
      const currentUid = sessionStorage.getItem("uid") || "";
      if (currentUid && data.players[currentUid]) {
        setMyTeam(data.players[currentUid].team);
      }
    });
    return () => unsub();
  }, [roomId]);

  // ── Sync commentary from Firebase for ALL players ─────
  // This runs whenever Firebase updates — so non-host sees live commentary too
  useEffect(() => {
    if (!room?.currentMatch) return;

    const match  = room.currentMatch;
    const innings =
      match.phase === "innings2" || match.phase === "strategic_timeout_2"
        ? match.innings2
        : match.innings1;

    if (!innings?.overs) return;

    const allBalls: string[] = [];
    (innings.overs ?? []).forEach((over: any) => {
      (over.balls ?? []).forEach((ball: any) => {
        if (ball.commentary) allBalls.push(ball.commentary);
      });
    });

    setCommentary(allBalls);
  }, [
    room?.currentMatch?.innings1?.totalRuns,
    room?.currentMatch?.innings2?.totalRuns,
    room?.currentMatch?.phase,
  ]);

  // ── Auto scroll commentary ────────────────────────────
  useEffect(() => {
    if (commentRef.current) {
      commentRef.current.scrollTop = commentRef.current.scrollHeight;
    }
  }, [commentary]);

  // ── Auto play loop ────────────────────────────────────
  useEffect(() => {
    if (!autoPlay) return;
    const match = room?.currentMatch;
    if (!match) return;
    if (
      match.phase === "completed" ||
      match.phase === "innings_break" ||
      match.phase === "strategic_timeout_1" ||
      match.phase === "strategic_timeout_2"
    ) {
      setAutoPlay(false);
      return;
    }
    const t = setTimeout(() => {
      if (autoRef.current) simulateBall();
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, room?.currentMatch?.innings1?.totalRuns, room?.currentMatch?.innings2?.totalRuns]);

  // ── Actions ───────────────────────────────────────────

  async function startMatch() {
    if (!room) return;
    const scheduled = room.season?.fixtures?.find((f) => f.status === "scheduled");
    if (!scheduled) return setError("No scheduled match found");
    setError("");
    const res = await fetch("/api/match/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:      "start_match",
        roomId,
        matchId:     scheduled.matchId,
        matchNumber: scheduled.matchNumber,
        stage:       scheduled.stage,
        team1:       scheduled.team1,
        team2:       scheduled.team2,
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
  }

  async function simulateBall() {
    if (simulating) return;
    setSimulating(true);
    try {
      const res = await fetch("/api/match/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate_ball", roomId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      // Commentary is synced via the useEffect above — no need to set it here
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  }

  async function nextInnings() {
    setCommentary([]);
    const res = await fetch("/api/match/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "next_innings", roomId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
  }

  async function resumeAfterTimeout() {
    const res = await fetch("/api/match/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume_after_timeout", roomId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
  }

  // ── Helpers ───────────────────────────────────────────

  function getActiveInnings(match: Match): Innings | null {
    if (match.phase === "innings2" || match.phase === "strategic_timeout_2")
      return match.innings2;
    return match.innings1;
  }

  function getStrikerStats(innings: Innings) {
    return (innings.batsmanStats ?? []).find(
      (b) => b.player.id === innings.currentBatsmen[0]
    );
  }

  function getNonStrikerStats(innings: Innings) {
    return (innings.batsmanStats ?? []).find(
      (b) => b.player.id === innings.currentBatsmen[1]
    );
  }

  function getCurrentBowlerStats(innings: Innings) {
    return (innings.bowlerStats ?? []).find(
      (b) => b.player.id === innings.currentBowler
    );
  }

  function formatOvers(inn: Innings): string {
    const complete = Math.floor(inn.totalOvers ?? 0);
    const overs    = inn.overs ?? [];
    const last     = overs[overs.length - 1];
    const balls    = last?.balls?.length ?? 0;
    return `${complete}.${balls}`;
  }

  // ── Render ────────────────────────────────────────────

  const match   = room?.currentMatch;
  const innings = match ? getActiveInnings(match) : null;

  if (!room || !match) {
    return (
      <div style={styles.center}>
        <p style={styles.muted}>Loading match…</p>
        <button style={styles.startBtn} onClick={startMatch}>Start Match</button>
        {error && <p style={styles.errorText}>{error}</p>}
      </div>
    );
  }

  const batColor = innings ? TEAM_COLORS[innings.battingTeam] : "#ffc800";

  // ── Strategic Timeout ─────────────────────────────────
  if (match.phase === "strategic_timeout_1" || match.phase === "strategic_timeout_2") {
    const inn = match.phase === "strategic_timeout_1" ? match.innings1! : match.innings2!;
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.timeoutCard}>
          <span style={styles.timeoutBadge}>⏸ STRATEGIC TIMEOUT</span>
          <h2 style={styles.timeoutScore}>
            {inn.battingTeam} — {inn.totalRuns}/{inn.totalWickets}
          </h2>
          <p style={styles.timeoutOvers}>after {inn.totalOvers} overs</p>
          <div style={styles.timeoutTips}>
            <p style={styles.tipText}>💡 Review your bowling options for the next 7 overs</p>
            <p style={styles.tipText}>💡 Consider your powerhouses for death overs</p>
          </div>
          <button style={styles.resumeBtn} onClick={resumeAfterTimeout}>
            Resume Match →
          </button>
        </div>
      </main>
    );
  }

  // ── Innings Break ─────────────────────────────────────
  if (match.phase === "innings_break") {
    const inn1 = match.innings1!;
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.timeoutCard}>
          <span style={styles.timeoutBadge}>🏏 INNINGS BREAK</span>
          <h2 style={styles.timeoutScore}>
            {inn1.battingTeam} scored {inn1.totalRuns}/{inn1.totalWickets}
          </h2>
          <p style={styles.timeoutOvers}>in {inn1.totalOvers} overs</p>
          <div style={{ ...styles.targetBox, borderColor: TEAM_COLORS[inn1.bowlingTeam] }}>
            <span style={styles.targetLabel}>Target for {inn1.bowlingTeam}</span>
            <span style={{ ...styles.targetNum, color: TEAM_COLORS[inn1.bowlingTeam] }}>
              {inn1.totalRuns + 1}
            </span>
          </div>
          <button style={styles.resumeBtn} onClick={nextInnings}>
            Start 2nd Innings →
          </button>
        </div>
      </main>
    );
  }

  // ── Match Complete ────────────────────────────────────
  if (match.phase === "completed" && match.result) {
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.timeoutCard}>
          <span style={styles.timeoutBadge}>🏆 MATCH RESULT</span>
          <h2 style={{ ...styles.timeoutScore, color: TEAM_COLORS[match.result.winner] }}>
            {match.result.winner} WON!
          </h2>
          <p style={styles.timeoutOvers}>{match.result.summary}</p>
          <div style={styles.scoreRow}>
            <div style={styles.scoreBox}>
              <span style={{ color: TEAM_COLORS[match.team1] }}>{match.team1}</span>
              <span style={styles.scoreNum}>
                {match.innings1?.totalRuns}/{match.innings1?.totalWickets}
              </span>
              <span style={styles.scoreOvers}>
                ({match.innings1 ? formatOvers(match.innings1) : "0"} ov)
              </span>
            </div>
            <div style={styles.scoreBox}>
              <span style={{ color: TEAM_COLORS[match.team2] }}>{match.team2}</span>
              <span style={styles.scoreNum}>
                {match.innings2?.totalRuns ?? 0}/{match.innings2?.totalWickets ?? 0}
              </span>
              <span style={styles.scoreOvers}>
                ({match.innings2 ? formatOvers(match.innings2) : "0"} ov)
              </span>
            </div>
          </div>
          <button
            style={styles.resumeBtn}
            onClick={() => router.push(`/room/${roomId}/standings`)}
          >
            View Standings →
          </button>
        </div>
      </main>
    );
  }

  // ── Main Match UI ─────────────────────────────────────
  const striker     = innings ? getStrikerStats(innings) : null;
  const nonStriker  = innings ? getNonStrikerStats(innings) : null;
  const bowlerStat  = innings ? getCurrentBowlerStats(innings) : null;
  const target      = match.phase === "innings2" && match.innings1
    ? match.innings1.totalRuns + 1 : null;
  const runsNeeded  = target && innings ? target - innings.totalRuns : null;
  const overs       = innings?.overs ?? [];
  const lastOver    = overs.length > 0 ? overs[overs.length - 1] : null;
  const recentBalls = lastOver?.balls?.slice(-6) ?? [];

  return (
    <main style={styles.main}>
      <div style={styles.grid} aria-hidden />

      <div style={styles.layout}>
        {/* LEFT — Scoreboard + Commentary */}
        <div style={styles.leftCol}>

          {/* Score header */}
          <div style={{ ...styles.scoreHeader, borderColor: batColor + "44" }}>
            <div style={styles.scoreHeaderTop}>
              <span style={{ ...styles.scoreTeam, color: batColor }}>
                {innings?.battingTeam}
              </span>
              <span style={styles.scoreBig}>
                {innings?.totalRuns ?? 0}/{innings?.totalWickets ?? 0}
              </span>
              <span style={styles.scoreOversSmall}>
                {innings ? formatOvers(innings) : "0.0"} / 20 ov
              </span>
            </div>

            {target && runsNeeded !== null && (
              <div style={styles.targetRow}>
                <span style={styles.targetRowText}>
                  Need {runsNeeded} off {Math.max(0, (20 - (innings?.totalOvers ?? 0)) * 6)} balls
                </span>
                <span style={styles.targetRowText}>Target: {target}</span>
              </div>
            )}

            <div style={styles.ballRow}>
              {recentBalls.map((b, i) => (
                <span key={i} style={{
                  ...styles.ballDot,
                  background:
                    b.outcome === "wicket" ? "#ff5f57" :
                    b.outcome === "6"      ? "#ffc800" :
                    b.outcome === "4"      ? "#4caf50" :
                    b.outcome === "dot"    ? "rgba(255,255,255,0.06)" :
                    "rgba(255,255,255,0.12)",
                  color:
                    b.outcome === "wicket" ? "#fff" :
                    b.outcome === "6"      ? "#0a0a0f" :
                    b.outcome === "4"      ? "#0a0a0f" : "#f0ece0",
                }}>
                  {b.outcome === "wicket" ? "W" :
                   b.outcome === "dot"    ? "·" :
                   b.outcome === "wide"   ? "Wd" :
                   b.outcome === "noball" ? "Nb" : b.runs}
                </span>
              ))}
            </div>
          </div>

          {/* Batsmen */}
          <div style={styles.panel}>
            {[striker, nonStriker].map((bs, i) => bs && (
              <div key={i} style={styles.batsmanRow}>
                <span style={styles.batsmanName}>
                  {bs.player.name}
                  {i === 0 && <span style={styles.strikerStar}> ✦</span>}
                </span>
                <span style={styles.batsmanStats}>
                  {bs.runs} ({bs.ballsFaced}) · SR {bs.strikeRate}
                </span>
                <span style={styles.batsmanFours}>
                  4s: {bs.fours}  6s: {bs.sixes}
                </span>
              </div>
            ))}
          </div>

          {/* Bowler */}
          {bowlerStat && (
            <div style={styles.panel}>
              <div style={styles.bowlerRow}>
                <span style={styles.bowlerName}>{bowlerStat.player.name} (bowling)</span>
                <span style={styles.bowlerStats}>
                  {bowlerStat.overs}-{bowlerStat.maidens}-{bowlerStat.runs}-{bowlerStat.wickets}
                  · Eco: {bowlerStat.economy}
                </span>
              </div>
            </div>
          )}

          {/* Commentary */}
          <div style={styles.commentaryBox} ref={commentRef}>
            {commentary.length === 0 && (
              <p style={styles.commentaryEmpty}>Commentary will appear here ball by ball…</p>
            )}
            {commentary.map((c, i) => (
              <p key={i} style={{
                ...styles.commentaryLine,
                ...(c.includes("SIX")  ? styles.commentarySix :
                    c.includes("FOUR") ? styles.commentaryFour :
                    c.includes("OUT") || c.includes("GONE") || c.includes("wicket")
                      ? styles.commentaryWicket : {}),
              }}>
                {c}
              </p>
            ))}
          </div>
        </div>

        {/* RIGHT — Controls + Scorecard */}
        <div style={styles.rightCol}>

          <div style={styles.controlsPanel}>
            <button
              style={{
                ...styles.simBtn,
                background: simulating ? "rgba(255,200,0,0.2)" : "#ffc800",
                color:      simulating ? "#ffc800" : "#0a0a0f",
                cursor:     simulating ? "not-allowed" : "pointer",
              }}
              onClick={simulateBall}
              disabled={simulating}
            >
              {simulating ? "Simulating…" : "▶ Next Ball"}
            </button>

            <button
              style={{
                ...styles.autoBtn,
                background:  autoPlay ? "rgba(76,175,80,0.15)" : "rgba(255,255,255,0.04)",
                color:       autoPlay ? "#4caf50" : "#6b6860",
                borderColor: autoPlay ? "rgba(76,175,80,0.3)" : "rgba(255,255,255,0.08)",
              }}
              onClick={() => setAutoPlay((v) => !v)}
            >
              {autoPlay ? "⏸ Pause Auto" : "⏩ Auto Play"}
            </button>

            {error && <p style={styles.errorText}>{error}</p>}
          </div>

          {/* Innings 1 scorecard */}
          {match.innings1 && (
            <div style={styles.scorecardPanel}>
              <p style={styles.scorecardTitle}>
                {match.innings1.battingTeam} — {match.innings1.totalRuns}/{match.innings1.totalWickets}
                <span style={styles.scorecardOvers}> ({formatOvers(match.innings1)} ov)</span>
              </p>
              {(match.innings1.batsmanStats ?? [])
                .filter((b) => b.ballsFaced > 0 || b.dismissed)
                .slice(0, 6)
                .map((b) => (
                  <div key={b.player.id} style={styles.cardRow}>
                    <span style={styles.cardName}>
                      {b.player.name}{b.dismissed ? ` (${b.wicketType})` : " *"}
                    </span>
                    <span style={styles.cardStat}>{b.runs} ({b.ballsFaced})</span>
                  </div>
                ))}
            </div>
          )}

          {/* Innings 2 scorecard */}
          {match.innings2 && (
            <div style={styles.scorecardPanel}>
              <p style={styles.scorecardTitle}>
                {match.innings2.battingTeam} — {match.innings2.totalRuns}/{match.innings2.totalWickets}
                <span style={styles.scorecardOvers}> ({formatOvers(match.innings2)} ov)</span>
              </p>
              {(match.innings2.batsmanStats ?? [])
                .filter((b) => b.ballsFaced > 0 || b.dismissed)
                .slice(0, 6)
                .map((b) => (
                  <div key={b.player.id} style={styles.cardRow}>
                    <span style={styles.cardName}>
                      {b.player.name}{b.dismissed ? ` (${b.wicketType})` : " *"}
                    </span>
                    <span style={styles.cardStat}>{b.runs} ({b.ballsFaced})</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Styles ────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  main:   { minHeight: "100vh", background: "#0a0a0f", padding: "20px", fontFamily: "'Georgia', serif", position: "relative" },
  grid:   { position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0 },
  center: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", background: "#0a0a0f" },
  layout: { maxWidth: "960px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 280px", gap: "20px", position: "relative", zIndex: 1 },
  leftCol:  { display: "flex", flexDirection: "column", gap: "12px" },
  rightCol: { display: "flex", flexDirection: "column", gap: "12px" },

  scoreHeader:     { background: "#13131a", border: "1px solid", borderRadius: "12px", padding: "20px 24px" },
  scoreHeaderTop:  { display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" },
  scoreTeam:       { fontSize: "16px", fontWeight: 700, fontFamily: "'Courier New', monospace" },
  scoreBig:        { fontSize: "36px", fontWeight: 700, color: "#f0ece0", fontFamily: "'Courier New', monospace" },
  scoreOversSmall: { fontSize: "13px", color: "#6b6860", marginLeft: "auto" },
  targetRow:       { display: "flex", justifyContent: "space-between", marginBottom: "10px" },
  targetRowText:   { fontSize: "12px", color: "#ffc800" },
  ballRow:         { display: "flex", gap: "6px", flexWrap: "wrap" as const },
  ballDot:         { width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: "'Courier New', monospace" },

  panel:        { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px", display: "flex", flexDirection: "column" as const, gap: "10px" },
  batsmanRow:   { display: "flex", alignItems: "center", gap: "10px" },
  batsmanName:  { flex: 1, fontSize: "14px", color: "#f0ece0" },
  batsmanStats: { fontSize: "13px", color: "#ffc800", fontFamily: "'Courier New', monospace" },
  batsmanFours: { fontSize: "11px", color: "#6b6860" },
  strikerStar:  { color: "#ffc800" },
  bowlerRow:    { display: "flex", alignItems: "center", justifyContent: "space-between" },
  bowlerName:   { fontSize: "14px", color: "#f0ece0" },
  bowlerStats:  { fontSize: "12px", color: "#6b6860", fontFamily: "'Courier New', monospace" },

  commentaryBox:    { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px", height: "280px", overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: "6px" },
  commentaryEmpty:  { color: "#45443e", fontSize: "13px", margin: 0 },
  commentaryLine:   { fontSize: "13px", color: "#a09d94", margin: 0, lineHeight: 1.5 },
  commentarySix:    { color: "#ffc800", fontWeight: 600 },
  commentaryFour:   { color: "#4caf50", fontWeight: 600 },
  commentaryWicket: { color: "#ff5f57", fontWeight: 600 },

  controlsPanel: { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px", display: "flex", flexDirection: "column" as const, gap: "10px" },
  simBtn:  { padding: "12px", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 700, fontFamily: "'Georgia', serif", transition: "opacity 0.15s" },
  autoBtn: { padding: "10px", border: "1px solid", borderRadius: "8px", fontSize: "13px", fontFamily: "'Georgia', serif", cursor: "pointer", background: "transparent" },

  scorecardPanel:  { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "14px 18px" },
  scorecardTitle:  { fontSize: "13px", fontWeight: 700, color: "#f0ece0", margin: "0 0 10px", fontFamily: "'Courier New', monospace" },
  scorecardOvers:  { fontWeight: 400, color: "#6b6860" },
  cardRow:  { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  cardName: { fontSize: "12px", color: "#a09d94" },
  cardStat: { fontSize: "12px", color: "#f0ece0", fontFamily: "'Courier New', monospace" },

  timeoutCard:  { maxWidth: "480px", margin: "80px auto", background: "#13131a", border: "1px solid rgba(255,200,0,0.15)", borderRadius: "16px", padding: "36px", textAlign: "center", position: "relative", zIndex: 1 },
  timeoutBadge: { display: "inline-block", fontSize: "11px", letterSpacing: "0.1em", color: "#ffc800", background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)", borderRadius: "20px", padding: "4px 12px", marginBottom: "16px" },
  timeoutScore: { fontSize: "26px", color: "#f0ece0", margin: "0 0 6px", fontFamily: "'Courier New', monospace" },
  timeoutOvers: { fontSize: "14px", color: "#6b6860", margin: "0 0 20px" },
  timeoutTips:  { background: "rgba(255,200,0,0.04)", borderRadius: "8px", padding: "12px", marginBottom: "20px" },
  tipText:      { fontSize: "13px", color: "#a09d94", margin: "4px 0" },

  targetBox:   { border: "1px solid", borderRadius: "10px", padding: "14px", marginBottom: "20px", display: "flex", flexDirection: "column" as const, gap: "4px" },
  targetLabel: { fontSize: "12px", color: "#6b6860", letterSpacing: "0.06em" },
  targetNum:   { fontSize: "36px", fontWeight: 700, fontFamily: "'Courier New', monospace" },

  resumeBtn: { width: "100%", padding: "13px", background: "#ffc800", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer" },

  scoreRow:   { display: "flex", gap: "16px", justifyContent: "center", margin: "16px 0" },
  scoreBox:   { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: "4px" },
  scoreNum:   { fontSize: "22px", fontWeight: 700, color: "#f0ece0", fontFamily: "'Courier New', monospace" },
  scoreOvers: { fontSize: "11px", color: "#6b6860" },

  startBtn:  { padding: "12px 24px", background: "#ffc800", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer" },
  muted:     { color: "#6b6860", fontFamily: "'Georgia', serif" },
  errorText: { color: "#ff5f57", fontSize: "13px", margin: 0 },
};