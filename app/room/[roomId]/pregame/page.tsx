"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room, IPLTeam, Player,
  TEAM_COLORS, TEAM_FULL_NAMES,
} from "@/types/game";

// ── Types ──────────────────────────────────────────────────

type TossCall = "heads" | "tails";
type TossDecision = "bat" | "bowl";

interface PregameState {
  // Toss
  tossCallerTeam: IPLTeam | null;      // who called heads/tails
  tossCall: TossCall | null;
  tossResult: TossCall | null;         // actual coin result
  tossWinner: IPLTeam | null;
  tossDecision: TossDecision | null;   // bat or bowl
  tossComplete: boolean;

  // Playing 11
  playing11: Partial<Record<IPLTeam, string[]>>;  // team → player ids
  team1Ready: boolean;
  team2Ready: boolean;
}

// ── Helpers ────────────────────────────────────────────────

function coinFlip(): TossCall {
  return Math.random() > 0.5 ? "heads" : "tails";
}

function getRoleIcon(role: string) {
  if (role === "batsman")      return "🏏";
  if (role === "bowler")       return "🎯";
  if (role === "allrounder")   return "⚡";
  if (role === "wicketkeeper") return "🧤";
  return "🏏";
}

// ── Main Component ─────────────────────────────────────────

export default function PregamePage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = params.roomId as string;

  const [room, setRoom]       = useState<Room | null>(null);
  const [uid, setUid]         = useState("");
  const [myTeam, setMyTeam]   = useState<IPLTeam | null>(null);
  const [isHost, setIsHost]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Toss animation state
  const [coinSpinning, setCoinSpinning] = useState(false);
  const [coinFace, setCoinFace]         = useState<"heads" | "tails">("heads");
  const [showResult, setShowResult]     = useState(false);

  // Local playing 11 selection (before confirming)
  const [mySelected, setMySelected] = useState<Set<string>>(new Set());

  // Pregame state from Firebase
  const [pregame, setPregame] = useState<PregameState | null>(null);

  // ── Load uid ──────────────────────────────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem("uid");
    if (!stored) { router.push("/"); return; }
    setUid(stored);
  }, [router]);

  // ── Subscribe to room ─────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (!snap.exists()) return;
      const data: Room = snap.val();
      setRoom(data);
      const currentUid = sessionStorage.getItem("uid") ?? "";
      if (currentUid && data.players[currentUid]) {
        const player = data.players[currentUid];
        setMyTeam(player.team);
        setIsHost(player.isHost);
      }
      if (data.pregame) setPregame(data.pregame as PregameState);
    });
    return () => unsub();
  }, [roomId]);

  // ── When match starts, navigate to match page ─────────
  useEffect(() => {
    if (room?.currentMatch?.phase === "innings1") {
      router.push(`/room/${roomId}/match`);
    }
  }, [room?.currentMatch?.phase, roomId, router]);

  // ── Derive match teams from season ────────────────────
  const nextFixture = room?.season?.fixtures?.find(
    (f) => f.matchId === room?.season?.currentMatchId
  );
  const team1 = nextFixture?.team1 as IPLTeam | undefined;
  const team2 = nextFixture?.team2 as IPLTeam | undefined;
  const imInThisMatch = myTeam === team1 || myTeam === team2;
  const otherTeam = myTeam === team1 ? team2 : team1;

  // Squad for my team
  const mySquad: Player[] = myTeam
    ? (room?.squads[myTeam]?.players ?? []).filter((p) => !p.injured)
    : [];

  // ── TOSS: Initiate (first team to load picks who calls) ─
  async function initiateToss() {
    if (!team1 || !team2) return;
    // team1 always calls the toss
    const initial: PregameState = {
      tossCallerTeam: team1,
      tossCall:       null,
      tossResult:     null,
      tossWinner:     null,
      tossDecision:   null,
      tossComplete:   false,
      playing11:      {},
      team1Ready:     false,
      team2Ready:     false,
    };
    await update(ref(db, `rooms/${roomId}`), { pregame: initial, updatedAt: Date.now() });
  }

  useEffect(() => {
    if (room && !room.pregame && team1 && team2 && isHost) {
      initiateToss();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.pregame, team1, team2, isHost]);

  // ── TOSS: Call heads or tails ──────────────────────────
  async function callToss(call: TossCall) {
    if (!pregame || pregame.tossCall || myTeam !== pregame.tossCallerTeam) return;
    const result = coinFlip();

    // Animate coin
    setCoinSpinning(true);
    setShowResult(false);
    let flips = 0;
    const interval = setInterval(() => {
      setCoinFace((f) => (f === "heads" ? "tails" : "heads"));
      flips++;
      if (flips >= 10) {
        clearInterval(interval);
        setCoinFace(result);
        setCoinSpinning(false);
        setShowResult(true);
      }
    }, 120);

    const winner = call === result ? pregame.tossCallerTeam : otherTeam!;
    const updated: Partial<PregameState> = {
      tossCall:   call,
      tossResult: result,
      tossWinner: winner,
    };
    await update(ref(db, `rooms/${roomId}/pregame`), updated);
  }

  // ── TOSS: Winner decides bat/bowl ─────────────────────
  async function chooseBatBowl(decision: TossDecision) {
    if (!pregame?.tossWinner || myTeam !== pregame.tossWinner) return;
    await update(ref(db, `rooms/${roomId}/pregame`), {
      tossDecision: decision,
      tossComplete:  true,
    });
  }

  // ── PLAYING 11: Toggle player selection ───────────────
  function togglePlayer(playerId: string) {
    setMySelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        if (next.size >= 11) return prev; // max 11
        next.add(playerId);
      }
      return next;
    });
  }

  // ── PLAYING 11: Validate selection ───────────────────
  function validateXI(): string | null {
    if (mySelected.size !== 11) return `Select exactly 11 players (${mySelected.size}/11 chosen)`;
    const selected = mySquad.filter((p) => mySelected.has(p.id));
    const keepers = selected.filter((p) => p.role === "wicketkeeper");
    if (keepers.length < 1) return "Must include at least 1 wicketkeeper";
    const bowlers = selected.filter((p) => p.role === "bowler" || p.role === "allrounder");
    if (bowlers.length < 3) return "Must include at least 3 bowlers/allrounders";
    return null;
  }

  // ── PLAYING 11: Confirm my XI ─────────────────────────
  async function confirmXI() {
    const err = validateXI();
    if (err) { setError(err); return; }
    if (!myTeam || !team1 || !team2) return;

    setLoading(true); setError("");
    try {
      const isTeam1 = myTeam === team1;
      const updates: Record<string, any> = {
        [`pregame/playing11/${myTeam}`]: Array.from(mySelected),
        [`pregame/${isTeam1 ? "team1Ready" : "team2Ready"}`]: true,
        updatedAt: Date.now(),
      };
      await update(ref(db, `rooms/${roomId}`), updates);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── START MATCH (host only, both XIs confirmed) ───────
  async function startMatch() {
    if (!nextFixture || !pregame?.tossComplete || !pregame.tossWinner) return;
    setLoading(true); setError("");
    try {
      const battingFirst: IPLTeam = pregame.tossDecision === "bat"
        ? pregame.tossWinner
        : (pregame.tossWinner === team1 ? team2! : team1!);

      const res = await fetch("/api/match/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action:      "start_match",
          roomId,
          matchId:     nextFixture.matchId,
          matchNumber: nextFixture.matchNumber,
          stage:       nextFixture.stage,
          team1:       nextFixture.team1,
          team2:       nextFixture.team2,
          playing11:   pregame.playing11,
          tossWinner:  pregame.tossWinner,
          tossDecision: pregame.tossDecision,
          battingFirst,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/room/${roomId}/match`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Derived UI state ──────────────────────────────────
  const tossPhase     = !pregame?.tossComplete;
  const xi11Phase     = pregame?.tossComplete && (!pregame.team1Ready || !pregame.team2Ready);
  const bothReady     = pregame?.team1Ready && pregame?.team2Ready;
  const myXIConfirmed = myTeam ? !!pregame?.playing11?.[myTeam] : false;
  const amTossCaller  = myTeam === pregame?.tossCallerTeam;
  const amTossWinner  = myTeam === pregame?.tossWinner;
  const validErr      = mySelected.size > 0 ? validateXI() : null;

  const tossWinnerColor = pregame?.tossWinner ? TEAM_COLORS[pregame.tossWinner] : "#ffc800";

  if (!room || !team1 || !team2) {
    return (
      <div style={S.center}>
        <div style={S.spinner} />
        <p style={S.muted}>Loading match…</p>
      </div>
    );
  }

  return (
    <main style={S.main}>
      {/* Background grid */}
      <div style={S.grid} aria-hidden />

      <div style={S.container}>

        {/* ── Match header ── */}
        <div style={S.matchHeader}>
          <div style={S.teamLabel}>
            <span style={{ ...S.teamCode, color: TEAM_COLORS[team1] }}>{team1}</span>
            <span style={{ ...S.teamName, color: TEAM_COLORS[team1] + "99" }}>
              {TEAM_FULL_NAMES[team1]}
            </span>
          </div>
          <div style={S.vsBlock}>
            <span style={S.vsText}>VS</span>
            <span style={S.matchTag}>
              {nextFixture?.stage === "league" ? `Match #${nextFixture.matchNumber}` : nextFixture?.stage?.toUpperCase()}
            </span>
          </div>
          <div style={{ ...S.teamLabel, alignItems: "flex-end" }}>
            <span style={{ ...S.teamCode, color: TEAM_COLORS[team2] }}>{team2}</span>
            <span style={{ ...S.teamName, color: TEAM_COLORS[team2] + "99" }}>
              {TEAM_FULL_NAMES[team2]}
            </span>
          </div>
        </div>

        {/* ── Step indicator ── */}
        <div style={S.steps}>
          <div style={{ ...S.step, ...(tossPhase ? S.stepActive : S.stepDone) }}>
            <span style={S.stepNum}>{tossPhase ? "1" : "✓"}</span>
            <span>Toss</span>
          </div>
          <div style={S.stepLine} />
          <div style={{
            ...S.step,
            ...(xi11Phase ? S.stepActive : bothReady ? S.stepDone : S.stepIdle),
          }}>
            <span style={S.stepNum}>2</span>
            <span>Playing XI</span>
          </div>
          <div style={S.stepLine} />
          <div style={{ ...S.step, ...(bothReady ? S.stepActive : S.stepIdle) }}>
            <span style={S.stepNum}>3</span>
            <span>Kick Off</span>
          </div>
        </div>

        {/* ══════════ TOSS PHASE ══════════ */}
        {tossPhase && (
          <div style={S.card}>
            <p style={S.cardTitle}>🪙 The Toss</p>

            {/* Coin */}
            <div style={{
              ...S.coin,
              animation: coinSpinning ? "spin 0.24s linear infinite" : "none",
              background: coinFace === "heads"
                ? "linear-gradient(135deg, #ffc800, #ff9500)"
                : "linear-gradient(135deg, #888, #555)",
            }}>
              <span style={S.coinFace}>
                {coinFace === "heads" ? "H" : "T"}
              </span>
            </div>

            {/* Toss result */}
            {pregame?.tossResult && showResult && (
              <div style={S.tossResultBox}>
                <p style={{ ...S.tossResultText, color: tossWinnerColor }}>
                  {pregame.tossResult.toUpperCase()}! {TEAM_FULL_NAMES[pregame.tossWinner!]} won the toss
                </p>
              </div>
            )}

            {/* Toss caller prompt */}
            {!pregame?.tossCall && amTossCaller && (
              <div style={S.tossCallBox}>
                <p style={S.tossCallHint}>
                  You ({myTeam}) call the toss!
                </p>
                <div style={S.tossButtons}>
                  <button style={S.tossBtn} onClick={() => callToss("heads")}>
                    <span style={S.tossBtnIcon}>H</span>
                    Heads
                  </button>
                  <button style={{ ...S.tossBtn, ...S.tossBtnTails }} onClick={() => callToss("tails")}>
                    <span style={S.tossBtnIcon}>T</span>
                    Tails
                  </button>
                </div>
              </div>
            )}

            {/* Waiting for toss caller */}
            {!pregame?.tossCall && !amTossCaller && (
              <p style={S.waitText}>
                ⏳ Waiting for {TEAM_FULL_NAMES[pregame?.tossCallerTeam ?? team1]} to call the toss…
              </p>
            )}

            {/* Toss winner decides */}
            {pregame?.tossResult && !pregame.tossDecision && amTossWinner && (
              <div style={S.tossDecideBox}>
                <p style={S.tossDecideHint}>You won! Choose to bat or bowl first:</p>
                <div style={S.tossButtons}>
                  <button style={S.decideBtn} onClick={() => chooseBatBowl("bat")}>
                    🏏 Bat First
                  </button>
                  <button style={{ ...S.decideBtn, ...S.decideBtnBowl }} onClick={() => chooseBatBowl("bowl")}>
                    🎯 Bowl First
                  </button>
                </div>
              </div>
            )}

            {/* Waiting for toss winner to decide */}
            {pregame?.tossResult && !pregame.tossDecision && !amTossWinner && (
              <p style={S.waitText}>
                ⏳ Waiting for {TEAM_FULL_NAMES[pregame.tossWinner!]} to choose bat/bowl…
              </p>
            )}

            {/* Toss summary */}
            {pregame?.tossDecision && (
              <div style={{ ...S.tossResultBox, borderColor: tossWinnerColor + "44" }}>
                <p style={{ ...S.tossResultText, color: tossWinnerColor }}>
                  {TEAM_FULL_NAMES[pregame.tossWinner!]} chose to{" "}
                  <strong>{pregame.tossDecision === "bat" ? "BAT" : "BOWL"}</strong> first
                </p>
                <p style={S.tossSubText}>Moving to Playing XI selection…</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ PLAYING XI PHASE ══════════ */}
        {!tossPhase && (
          <>
            {/* Ready status */}
            <div style={S.readyStatus}>
              <div style={S.readyTeam}>
                <span style={{ color: TEAM_COLORS[team1], fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
                  {team1}
                </span>
                <span style={pregame?.team1Ready ? S.readyBadge : S.notReadyBadge}>
                  {pregame?.team1Ready ? "✓ Ready" : "Selecting…"}
                </span>
              </div>
              <div style={S.readyDivider} />
              <div style={S.readyTeam}>
                <span style={{ color: TEAM_COLORS[team2], fontWeight: 700, fontFamily: "'Courier New', monospace" }}>
                  {team2}
                </span>
                <span style={pregame?.team2Ready ? S.readyBadge : S.notReadyBadge}>
                  {pregame?.team2Ready ? "✓ Ready" : "Selecting…"}
                </span>
              </div>
            </div>

            {/* My XI selector (only if I'm in this match and not yet confirmed) */}
            {imInThisMatch && !myXIConfirmed && (
              <div style={S.card}>
                <div style={S.xiHeader}>
                  <p style={{ ...S.cardTitle, margin: 0 }}>
                    Select Your Playing XI
                    <span style={{ ...S.teamCode, color: TEAM_COLORS[myTeam!], marginLeft: "10px", fontSize: "16px" }}>
                      {myTeam}
                    </span>
                  </p>
                  <span style={{
                    ...S.xiCount,
                    color: mySelected.size === 11 ? "#4caf50" : mySelected.size > 0 ? "#ffc800" : "#45443e",
                  }}>
                    {mySelected.size}/11
                  </span>
                </div>

                {/* Role legend */}
                <div style={S.legend}>
                  {["batsman","bowler","allrounder","wicketkeeper"].map((r) => (
                    <span key={r} style={S.legendItem}>
                      {getRoleIcon(r)} {r}
                    </span>
                  ))}
                </div>

                {/* Validation hint */}
                {validErr && mySelected.size > 0 && (
                  <p style={S.validHint}>{validErr}</p>
                )}

                {/* Player grid */}
                <div style={S.playerGrid}>
                  {mySquad.map((player) => {
                    const sel = mySelected.has(player.id);
                    const color = TEAM_COLORS[myTeam!];
                    return (
                      <button
                        key={player.id}
                        onClick={() => togglePlayer(player.id)}
                        style={{
                          ...S.playerCard,
                          ...(sel ? {
                            background: color + "18",
                            borderColor: color + "88",
                          } : {}),
                        }}
                      >
                        <div style={S.playerCardTop}>
                          <span style={S.playerRoleIcon}>{getRoleIcon(player.role)}</span>
                          {sel && <span style={{ ...S.checkMark, color }}>✓</span>}
                        </div>
                        <span style={{ ...S.playerName, color: sel ? color : "#f0ece0" }}>
                          {player.name}
                        </span>
                        <span style={S.playerNat}>{player.nationality}</span>
                        <div style={S.playerStats}>
                          <span style={S.statPill}>BAT {player.battingRating}</span>
                          {player.bowlingRating > 20 && (
                            <span style={S.statPill}>BOWL {player.bowlingRating}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {error && <p style={S.errorText}>{error}</p>}

                <button
                  style={{
                    ...S.confirmBtn,
                    background: mySelected.size === 11 && !validateXI() ? TEAM_COLORS[myTeam!] : "#2a2a35",
                    color: mySelected.size === 11 && !validateXI() ? "#0a0a0f" : "#45443e",
                    cursor: mySelected.size === 11 && !validateXI() ? "pointer" : "not-allowed",
                  }}
                  onClick={confirmXI}
                  disabled={loading || mySelected.size !== 11 || !!validateXI()}
                >
                  {loading ? "Confirming…" : `Lock in ${myTeam} Playing XI`}
                </button>
              </div>
            )}

            {/* My XI confirmed */}
            {imInThisMatch && myXIConfirmed && (
              <div style={S.confirmedBox}>
                <p style={S.confirmedText}>
                  ✓ Your Playing XI is locked in!
                </p>
                {!bothReady && (
                  <p style={S.waitText}>Waiting for {TEAM_FULL_NAMES[otherTeam!]} to select their XI…</p>
                )}
              </div>
            )}

            {/* Not in this match */}
            {!imInThisMatch && !bothReady && (
              <div style={S.spectatorBox}>
                <p style={S.muted}>You're spectating. Waiting for both teams to select their XI…</p>
              </div>
            )}
          </>
        )}

        {/* ══════════ KICK OFF ══════════ */}
        {bothReady && (
          <div style={S.kickoffCard}>
            <p style={S.kickoffTitle}>⚡ Both teams are ready!</p>
            <div style={S.tossInfoRow}>
              <span style={{ color: TEAM_COLORS[pregame!.tossWinner!], fontWeight: 700 }}>
                {TEAM_FULL_NAMES[pregame!.tossWinner!]}
              </span>
              <span style={S.muted}>won toss &amp; chose to</span>
              <span style={{ color: "#ffc800", fontWeight: 700 }}>
                {pregame?.tossDecision?.toUpperCase()} FIRST
              </span>
            </div>

            {/* Both XIs preview */}
            <div style={S.xiPreviewRow}>
              {[team1, team2].map((t) => {
                const xi11 = pregame?.playing11?.[t] ?? [];
                const squad = room.squads[t]?.players ?? [];
                const color = TEAM_COLORS[t];
                return (
                  <div key={t} style={S.xiPreview}>
                    <p style={{ ...S.xiPreviewTitle, color }}>{t} XI</p>
                    {xi11.map((id) => {
                      const p = squad.find((pl) => pl.id === id);
                      return p ? (
                        <div key={id} style={S.xiPlayerRow}>
                          <span style={S.xiRoleIcon}>{getRoleIcon(p.role)}</span>
                          <span style={S.xiPlayerName}>{p.name}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                );
              })}
            </div>

            {isHost && (
              <button
                style={{ ...S.startBtn, ...(loading ? S.disabled : {}) }}
                onClick={startMatch}
                disabled={loading}
              >
                {loading ? "Starting…" : "🏏 Start Match!"}
              </button>
            )}
            {!isHost && (
              <p style={S.waitText}>Waiting for the host to start the match…</p>
            )}
            {error && <p style={S.errorText}>{error}</p>}
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin {
          0%   { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}

// ── Styles ─────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  main: {
    minHeight: "100vh",
    background: "#0a0a0f",
    padding: "20px 16px 40px",
    fontFamily: "'Georgia', serif",
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    position: "fixed", inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    pointerEvents: "none", zIndex: 0,
  },
  center: {
    minHeight: "100vh", display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    background: "#0a0a0f", gap: "16px",
  },
  spinner: {
    width: "32px", height: "32px",
    border: "2px solid rgba(255,200,0,0.1)",
    borderTop: "2px solid #ffc800",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  container: {
    maxWidth: "680px", margin: "0 auto",
    position: "relative", zIndex: 1,
    display: "flex", flexDirection: "column", gap: "16px",
  },

  // Match header
  matchHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px", padding: "20px 24px",
  },
  teamLabel: {
    display: "flex", flexDirection: "column", gap: "3px", flex: 1,
  },
  teamCode: {
    fontSize: "22px", fontFamily: "'Courier New', monospace",
    fontWeight: "700", letterSpacing: "0.06em",
  },
  teamName: {
    fontSize: "11px", letterSpacing: "0.04em",
  },
  vsBlock: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "0 16px",
  },
  vsText: {
    fontSize: "13px", color: "#45443e",
    fontFamily: "'Courier New', monospace", letterSpacing: "0.2em",
  },
  matchTag: {
    fontSize: "10px", color: "#6b6860",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "4px", padding: "2px 8px",
    letterSpacing: "0.06em",
  },

  // Steps
  steps: {
    display: "flex", alignItems: "center", gap: "0",
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "14px 20px",
  },
  step: {
    display: "flex", alignItems: "center", gap: "8px",
    fontSize: "13px", flex: 1, justifyContent: "center",
  },
  stepActive: { color: "#ffc800" },
  stepDone:   { color: "#4caf50" },
  stepIdle:   { color: "#45443e" },
  stepNum: {
    width: "20px", height: "20px", borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "11px",
  },
  stepLine: {
    flex: 0, width: "24px", height: "1px",
    background: "rgba(255,255,255,0.08)", margin: "0 8px",
  },

  // Card
  card: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "14px", padding: "24px",
    display: "flex", flexDirection: "column", gap: "16px",
    animation: "fadeIn 0.3s ease",
  },
  cardTitle: {
    fontSize: "16px", color: "#f0ece0",
    margin: "0 0 4px", fontWeight: 600,
  },

  // Coin
  coin: {
    width: "80px", height: "80px", borderRadius: "50%",
    margin: "8px auto",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    transformStyle: "preserve-3d",
  },
  coinFace: {
    fontSize: "28px", fontWeight: "700",
    fontFamily: "'Courier New', monospace",
    color: "#0a0a0f",
  },

  // Toss
  tossResultBox: {
    background: "rgba(255,200,0,0.06)",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "10px", padding: "14px",
    textAlign: "center", animation: "fadeIn 0.4s ease",
  },
  tossResultText: { margin: 0, fontSize: "15px", fontWeight: 600 },
  tossSubText:    { margin: "6px 0 0", fontSize: "12px", color: "#6b6860" },
  tossCallBox:    { display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" },
  tossCallHint:   { fontSize: "14px", color: "#a09d94", margin: 0, textAlign: "center" },
  tossDecideBox:  { display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" },
  tossDecideHint: { fontSize: "14px", color: "#a09d94", margin: 0, textAlign: "center" },
  tossButtons: {
    display: "flex", gap: "12px", justifyContent: "center", width: "100%",
  },
  tossBtn: {
    flex: 1, maxWidth: "140px",
    padding: "14px 0",
    background: "linear-gradient(135deg, #ffc800, #ff9500)",
    color: "#0a0a0f", border: "none", borderRadius: "10px",
    fontSize: "15px", fontWeight: "700", fontFamily: "'Georgia', serif",
    cursor: "pointer", display: "flex", flexDirection: "column",
    alignItems: "center", gap: "4px",
  },
  tossBtnTails: {
    background: "linear-gradient(135deg, #555, #333)",
    color: "#f0ece0",
  },
  tossBtnIcon: {
    width: "28px", height: "28px", borderRadius: "50%",
    background: "rgba(0,0,0,0.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "13px", fontFamily: "'Courier New', monospace",
  },
  decideBtn: {
    flex: 1, maxWidth: "150px", padding: "13px 0",
    background: "#ffc800", color: "#0a0a0f",
    border: "none", borderRadius: "10px",
    fontSize: "14px", fontWeight: "700", fontFamily: "'Georgia', serif",
    cursor: "pointer",
  },
  decideBtnBowl: {
    background: "#1e1e2a", color: "#f0ece0",
    border: "1px solid rgba(255,255,255,0.1)",
  },

  // Ready status
  readyStatus: {
    display: "flex", alignItems: "center",
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "14px 20px", gap: "0",
  },
  readyTeam:    { flex: 1, display: "flex", alignItems: "center", gap: "10px" },
  readyDivider: { width: "1px", height: "24px", background: "rgba(255,255,255,0.08)", margin: "0 16px" },
  readyBadge: {
    fontSize: "11px", color: "#4caf50",
    background: "rgba(76,175,80,0.1)",
    border: "1px solid rgba(76,175,80,0.2)",
    borderRadius: "4px", padding: "2px 8px",
  },
  notReadyBadge: {
    fontSize: "11px", color: "#6b6860",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "4px", padding: "2px 8px",
  },

  // XI Selection
  xiHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  xiCount: {
    fontSize: "20px", fontFamily: "'Courier New', monospace", fontWeight: "700",
  },
  legend: {
    display: "flex", gap: "12px", flexWrap: "wrap",
  },
  legendItem: {
    fontSize: "11px", color: "#6b6860",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "4px", padding: "3px 8px",
  },
  validHint: {
    fontSize: "12px", color: "#ff9500", margin: 0,
    padding: "8px 12px",
    background: "rgba(255,149,0,0.08)",
    border: "1px solid rgba(255,149,0,0.2)",
    borderRadius: "6px",
  },
  playerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "8px",
  },
  playerCard: {
    background: "#0d0d14",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "12px",
    cursor: "pointer", textAlign: "left",
    display: "flex", flexDirection: "column", gap: "4px",
    transition: "all 0.15s",
  },
  playerCardTop: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  playerRoleIcon: { fontSize: "16px" },
  checkMark:      { fontSize: "14px", fontWeight: "700" },
  playerName: {
    fontSize: "13px", fontWeight: 600, lineHeight: 1.2,
  },
  playerNat: {
    fontSize: "10px", color: "#45443e",
  },
  playerStats: {
    display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px",
  },
  statPill: {
    fontSize: "9px", color: "#6b6860",
    background: "rgba(255,255,255,0.04)",
    borderRadius: "3px", padding: "1px 5px",
    fontFamily: "'Courier New', monospace",
  },
  confirmBtn: {
    width: "100%", padding: "13px",
    border: "none", borderRadius: "8px",
    fontSize: "15px", fontWeight: "700",
    fontFamily: "'Georgia', serif",
    transition: "all 0.2s",
  },

  // Confirmed / spectator
  confirmedBox: {
    background: "rgba(76,175,80,0.06)",
    border: "1px solid rgba(76,175,80,0.2)",
    borderRadius: "10px", padding: "16px 20px",
    textAlign: "center",
    animation: "fadeIn 0.3s ease",
  },
  confirmedText: { color: "#4caf50", fontSize: "15px", margin: "0 0 6px", fontWeight: 600 },
  spectatorBox: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "16px 20px", textAlign: "center",
  },

  // Kickoff card
  kickoffCard: {
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.2)",
    borderRadius: "14px", padding: "24px",
    display: "flex", flexDirection: "column", gap: "16px",
    animation: "fadeIn 0.4s ease",
  },
  kickoffTitle: {
    fontSize: "17px", color: "#ffc800", margin: 0, fontWeight: 700, textAlign: "center",
  },
  tossInfoRow: {
    display: "flex", alignItems: "center", gap: "10px",
    justifyContent: "center", fontSize: "14px", flexWrap: "wrap",
  },
  xiPreviewRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
  },
  xiPreview: {
    background: "#0d0d14",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "10px", padding: "14px",
    display: "flex", flexDirection: "column", gap: "6px",
  },
  xiPreviewTitle: {
    fontSize: "13px", fontFamily: "'Courier New', monospace",
    fontWeight: 700, letterSpacing: "0.06em", margin: "0 0 4px",
  },
  xiPlayerRow: {
    display: "flex", alignItems: "center", gap: "6px",
  },
  xiRoleIcon:   { fontSize: "12px" },
  xiPlayerName: { fontSize: "12px", color: "#a09d94" },

  startBtn: {
    width: "100%", padding: "15px",
    background: "#ffc800", color: "#0a0a0f",
    border: "none", borderRadius: "10px",
    fontSize: "16px", fontWeight: "700",
    fontFamily: "'Georgia', serif", cursor: "pointer",
  },

  // Utils
  waitText:  { fontSize: "13px", color: "#6b6860", margin: 0, textAlign: "center" },
  errorText: { fontSize: "13px", color: "#ff5f57", margin: 0 },
  muted:     { fontSize: "13px", color: "#6b6860", margin: 0 },
  disabled:  { opacity: 0.4, cursor: "not-allowed" },
};