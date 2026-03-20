"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ref, onValue } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room, IPLTeam, TEAM_COLORS, SQUAD_SIZE,
} from "@/types/game";
import MySquadPanel from "@/components/MySquadPanel";

const TIMER_SECONDS = 10;

export default function AuctionPage() {
  const params  = useParams();
  const router  = useRouter();
  const roomId  = params.roomId as string;

  const [room, setRoom]          = useState<Room | null>(null);
  const [uid, setUid]            = useState("");
  const [myTeam, setMyTeam]      = useState<IPLTeam | null>(null);
  const [bidAmount, setBidAmount] = useState(0);
  const [timeLeft, setTimeLeft]  = useState(TIMER_SECONDS);
  const [loading, setLoading]    = useState(false);
  const [error, setError]        = useState("");
  const [lastMsg, setLastMsg]    = useState("");
  const [rightTab, setRightTab]  = useState<"mysquad" | "overview">("mysquad");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const uidRef   = useRef("");

  // ── Session ───────────────────────────────────────────
  useEffect(() => {
    const storedUid = sessionStorage.getItem("uid");
    if (!storedUid) { router.push("/"); return; }
    setUid(storedUid);
    uidRef.current = storedUid;
  }, [router]);

  // ── Firebase listener ─────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (!snap.exists()) return;
      const data: Room = snap.val();
      setRoom(data);
      const currentUid = uidRef.current || sessionStorage.getItem("uid") || "";
      if (currentUid && data.players[currentUid]) {
        setMyTeam(data.players[currentUid].team);
      }
      if (data.phase === "season") {
        router.push(`/room/${roomId}/standings`);
      }
    });
    return () => unsub();
  }, [roomId, router]);

  // ── Countdown timer ───────────────────────────────────
  useEffect(() => {
    if (!room?.auction?.bidTimerEndsAt) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((room.auction!.bidTimerEndsAt! - Date.now()) / 1000));
      setTimeLeft(remaining);
      const currentUid = uidRef.current || sessionStorage.getItem("uid") || "";
      if (remaining === 0 && room.players[currentUid]?.isHost) {
        clearInterval(timerRef.current!);
        closeLot();
      }
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.auction?.bidTimerEndsAt]);

  // ── Default bid when lot changes ──────────────────────
  useEffect(() => {
    const lot = room?.auction?.currentLot;
    if (lot) setBidAmount(lot.player.basePrice);
  }, [room?.auction?.currentLotIndex]);

  // ── Actions ───────────────────────────────────────────

  async function startAuction() {
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", roomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function placeBid() {
    if (!myTeam) return setError("You don't have a team");
    const currentUid = uidRef.current || sessionStorage.getItem("uid") || "";
    if (!currentUid) return setError("Session expired — please rejoin");
    if (!room?.auction?.currentLot) return setError("No active lot");

    setLoading(true); setError(""); setLastMsg("");
    try {
      const res = await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bid", roomId,
          uid: currentUid, team: myTeam,
          amount: bidAmount,
          lotIndex: room.auction.currentLotIndex,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        try { throw new Error(JSON.parse(text).error); }
        catch { throw new Error(`Server error ${res.status}`); }
      }
      await res.json();
      setLastMsg(`✓ Bid of ${bidAmount}cr placed!`);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function closeLot() {
    const currentUid = uidRef.current || sessionStorage.getItem("uid") || "";
    try {
      await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_lot", roomId, uid: currentUid }),
      });
    } catch {}
  }

  async function markDone() {
    const currentUid = uidRef.current || sessionStorage.getItem("uid") || "";
    if (!currentUid) return;
    setLoading(true);
    try {
      await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "player_done", roomId, uid: currentUid }),
      });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function endAuction() {
    setLoading(true);
    try {
      await fetch("/api/auction/bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end_auction", roomId }),
      });
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Derived ───────────────────────────────────────────

  const auction        = room?.auction;
  const lot            = auction?.currentLot;
  const currentUid     = uidRef.current || uid;
  const mySquad        = myTeam ? room?.squads[myTeam] : null;
  const myBudget       = mySquad?.budgetRemaining ?? 0;
  const myPlayers      = mySquad?.players ?? [];
  const myCount        = myPlayers.length;
  const isHost         = currentUid ? room?.players[currentUid]?.isHost : false;
  const myDone         = currentUid ? (room?.players[currentUid] as any)?.auctionDone ?? false : false;
  const allPlayersDone = (auction as any)?.allPlayersDone ?? false;
  const minBid         = lot?.currentHighBidder ? (lot.currentBid + 0.5) : (lot?.player.basePrice ?? 0);
  const timerPct       = (timeLeft / TIMER_SECONDS) * 100;
  const timerColor     = timeLeft <= 3 ? "#ff5f57" : timeLeft <= 6 ? "#ffc800" : "#4caf50";
  const completedLots  = auction?.lots?.filter((l) => l.status === "sold" || l.status === "unsold") ?? [];

  // Count how many players clicked done
  const doneCount  = room ? Object.values(room.players).filter((p: any) => p.auctionDone).length : 0;
  const totalCount = room ? Object.values(room.players).length : 0;

  if (!room) return (
    <div style={styles.center}><p style={styles.loadingText}>Loading auction…</p></div>
  );

  // ── Pre-auction ───────────────────────────────────────
  if (!auction || auction.status === "waiting") {
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.waitCard}>
          <h1 style={styles.waitTitle}>🏏 Auction Room</h1>
          <p style={styles.waitSub}>All players have selected their teams. Time to build your squad.</p>
          <div style={styles.teamList}>
            {Object.values(room.players).map((p) => (
              <div key={p.uid} style={styles.teamRow}>
                <span style={styles.teamRowName}>{p.displayName}</span>
                <span style={{
                  ...styles.teamTag,
                  background:  p.team ? TEAM_COLORS[p.team] + "22" : "transparent",
                  color:       p.team ? TEAM_COLORS[p.team] : "#6b6860",
                  borderColor: p.team ? TEAM_COLORS[p.team] + "55" : "rgba(255,255,255,0.08)",
                }}>
                  {p.team ?? "—"}
                </span>
              </div>
            ))}
          </div>
          {isHost ? (
            <button style={{ ...styles.startBtn, ...(loading ? styles.disabled : {}) }} onClick={startAuction} disabled={loading}>
              {loading ? "Starting…" : "Start Auction →"}
            </button>
          ) : (
            <p style={styles.waitHint}>Waiting for host to start the auction…</p>
          )}
          {error && <p style={styles.errorText}>{error}</p>}
        </div>
      </main>
    );
  }

  // ── Auction complete ──────────────────────────────────
  if (auction.status === "completed") {
    return (
      <main style={styles.main}>
        <div style={styles.grid} aria-hidden />
        <div style={styles.waitCard}>
          <h1 style={styles.waitTitle}>🎉 Auction Complete!</h1>
          <p style={styles.waitSub}>All squads are set. Season is starting…</p>
        </div>
      </main>
    );
  }

  // ── Main Auction UI ───────────────────────────────────
  return (
    <main style={styles.main}>
      <div style={styles.grid} aria-hidden />
      <div style={styles.layout}>

        {/* LEFT — Current Lot */}
        <div style={styles.leftCol}>

          {/* Progress */}
          <div style={styles.progressBar}>
            <span style={styles.progressText}>
              Lot {(auction.currentLotIndex ?? 0) + 1} of {auction.lots?.length ?? 0}
            </span>
            <span style={styles.progressText}>{completedLots.length} sold</span>
          </div>

          {lot ? (
            <>
              {/* Player Card */}
              <div style={styles.playerCard}>
                <div style={styles.playerMeta}>
                  <span style={styles.roleBadge}>{lot.player.role.toUpperCase()}</span>
                  <span style={styles.nationalityBadge}>{lot.player.nationality}</span>
                </div>
                <h2 style={styles.playerName}>{lot.player.name}</h2>
                <div style={styles.ratingRow}>
                  {lot.player.battingRating > 30 && (
                    <div style={styles.ratingBox}>
                      <span style={styles.ratingVal}>{lot.player.battingRating}</span>
                      <span style={styles.ratingLabel}>BAT</span>
                    </div>
                  )}
                  {lot.player.bowlingRating > 30 && (
                    <div style={styles.ratingBox}>
                      <span style={styles.ratingVal}>{lot.player.bowlingRating}</span>
                      <span style={styles.ratingLabel}>BOWL</span>
                    </div>
                  )}
                  {lot.player.wicketkeeperRating > 0 && (
                    <div style={styles.ratingBox}>
                      <span style={styles.ratingVal}>{lot.player.wicketkeeperRating}</span>
                      <span style={styles.ratingLabel}>WK</span>
                    </div>
                  )}
                </div>
                <p style={styles.basePriceText}>Base price: {lot.player.basePrice} cr</p>
              </div>

              {/* Timer */}
              <div style={styles.timerWrap}>
                <div style={styles.timerTrack}>
                  <div style={{ ...styles.timerFill, width: `${timerPct}%`, background: timerColor }} />
                </div>
                <span style={{ ...styles.timerNum, color: timerColor }}>{timeLeft}s</span>
              </div>

              {/* Current Bid */}
              <div style={styles.currentBid}>
                <span style={styles.currentBidLabel}>Current Bid</span>
                <span style={styles.currentBidAmount}>{lot.currentBid} cr</span>
                {lot.currentHighBidder
                  ? <span style={{ ...styles.highBidder, color: TEAM_COLORS[lot.currentHighBidder] }}>{lot.currentHighBidder} leading</span>
                  : <span style={styles.noBids}>No bids yet</span>}
              </div>

              {/* Bid Controls */}
              <div style={styles.bidControls}>
                <div style={styles.bidInputRow}>
                  <button style={styles.nudgeBtn} onClick={() => setBidAmount(Math.max(minBid, parseFloat((bidAmount - 0.5).toFixed(1))))}>−</button>
                  <input
                    type="number"
                    style={styles.bidInput}
                    value={bidAmount}
                    step={0.5}
                    min={minBid}
                    max={myBudget}
                    onChange={(e) => setBidAmount(Number(e.target.value))}
                  />
                  <button style={styles.nudgeBtn} onClick={() => setBidAmount(Math.min(myBudget, parseFloat((bidAmount + 0.5).toFixed(1))))}>+</button>
                </div>

                <div style={styles.quickBids}>
                  {[0.5, 1, 2, 5].map((inc) => (
                    <button key={inc} style={styles.quickBtn}
                      onClick={() => setBidAmount(Math.min(myBudget, parseFloat(((lot.currentBid ?? 0) + inc).toFixed(1))))}>
                      +{inc}
                    </button>
                  ))}
                </div>

                <button
                  style={{
                    ...styles.bidBtn,
                    ...(loading || bidAmount < minBid || bidAmount > myBudget ? styles.disabled : {}),
                    ...(myTeam ? { background: TEAM_COLORS[myTeam] } : {}),
                  }}
                  onClick={placeBid}
                  disabled={loading || bidAmount < minBid || bidAmount > myBudget}
                >
                  {loading ? "Placing…" : `Bid ${bidAmount}cr for ${myTeam}`}
                </button>

                {error   && <p style={styles.errorText}>{error}</p>}
                {lastMsg && <p style={styles.successText}>{lastMsg}</p>}

                {/* Divider */}
                <div style={styles.divider} />

                {/* Done button — every player clicks this */}
                {!myDone ? (
                  <button
                    style={{ ...styles.doneBtn, ...(loading ? styles.disabled : {}) }}
                    onClick={markDone}
                    disabled={loading}
                  >
                    ✓ I'm Done Bidding
                  </button>
                ) : (
                  <div style={styles.doneStatus}>
                    <span style={styles.doneCheck}>✓</span>
                    <span style={styles.doneText}>
                      You're done — {doneCount}/{totalCount} players ready
                    </span>
                  </div>
                )}

                {/* End Auction — host only, after all players done */}
                {isHost && allPlayersDone && (
                  <button
                    style={{ ...styles.endAuctionBtn, ...(loading ? styles.disabled : {}) }}
                    onClick={endAuction}
                    disabled={loading}
                  >
                    ⏭ End Auction &amp; Start Season
                  </button>
                )}

                {/* Waiting message for host */}
                {isHost && !allPlayersDone && doneCount > 0 && (
                  <p style={styles.waitingText}>
                    Waiting for all players… {doneCount}/{totalCount} done
                  </p>
                )}
              </div>

              {/* Bid History */}
              {lot.bidHistory?.length > 0 && (
                <div style={styles.bidHistory}>
                  <p style={styles.historyLabel}>Bid History</p>
                  {[...lot.bidHistory].reverse().slice(0, 6).map((b, i) => (
                    <div key={i} style={styles.historyRow}>
                      <span style={{ color: TEAM_COLORS[b.team], fontWeight: 600 }}>{b.team}</span>
                      <span style={styles.historyAmount}>{b.amount} cr</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={styles.loadingText}>Loading next player…</p>
          )}
        </div>

        {/* RIGHT — My Squad / All Teams */}
        <div style={styles.rightCol}>

          <div style={styles.rightTabs}>
            <button
              style={{ ...styles.rightTab, ...(rightTab === "mysquad" ? styles.rightTabActive : {}) }}
              onClick={() => setRightTab("mysquad")}
            >
              My Squad {myCount > 0 ? `(${myCount})` : ""}
            </button>
            <button
              style={{ ...styles.rightTab, ...(rightTab === "overview" ? styles.rightTabActive : {}) }}
              onClick={() => setRightTab("overview")}
            >
              All Teams
            </button>
          </div>

          {rightTab === "mysquad" && myTeam && mySquad && (
            <MySquadPanel players={myPlayers} team={myTeam} budget={myBudget} />
          )}

          {rightTab === "overview" && (
            <>
              <div style={styles.squadsPanel}>
                <p style={styles.squadsPanelTitle}>All Squads</p>
                {Object.values(room.players).map((p) => {
                  if (!p.team) return null;
                  const squad  = room.squads[p.team];
                  const count  = squad?.players?.length ?? 0;
                  const budget = squad?.budgetRemaining ?? 0;
                  const color  = TEAM_COLORS[p.team];
                  const pDone  = (p as any).auctionDone;
                  return (
                    <div key={p.uid} style={styles.squadRow}>
                      <span style={{ ...styles.squadTeam, color }}>{p.team}</span>
                      <span style={styles.squadPlayerCount}>{count}/20</span>
                      <div style={styles.squadBudgetBar}>
                        <div style={{ ...styles.squadBudgetFill, width: `${(budget / 150) * 100}%`, background: color + "88" }} />
                      </div>
                      <span style={styles.squadBudgetNum}>{budget}</span>
                      {pDone && <span style={styles.donePip}>✓</span>}
                    </div>
                  );
                })}
              </div>

              {completedLots.length > 0 && (
                <div style={styles.recentPanel}>
                  <p style={styles.recentTitle}>Recent Sales</p>
                  {completedLots.slice(-8).reverse().map((l, i) => (
                    <div key={i} style={styles.recentRow}>
                      <span style={styles.recentName}>{l.player.name}</span>
                      {l.status === "sold"
                        ? <span style={{ ...styles.recentSold, color: TEAM_COLORS[l.soldTo!] }}>{l.soldTo} · {l.soldPrice}cr</span>
                        : <span style={styles.recentUnsold}>Unsold</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
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
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f" },
  layout: { maxWidth: "960px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 300px", gap: "20px", position: "relative", zIndex: 1 },
  leftCol:  { display: "flex", flexDirection: "column", gap: "14px" },
  rightCol: { display: "flex", flexDirection: "column", gap: "10px" },

  waitCard:    { maxWidth: "480px", margin: "80px auto", background: "#13131a", border: "1px solid rgba(255,200,0,0.15)", borderRadius: "16px", padding: "36px", textAlign: "center", position: "relative", zIndex: 1 },
  waitTitle:   { fontSize: "24px", color: "#f0ece0", margin: "0 0 10px" },
  waitSub:     { fontSize: "14px", color: "#6b6860", margin: "0 0 24px" },
  teamList:    { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" },
  teamRow:     { display: "flex", justifyContent: "space-between", alignItems: "center" },
  teamRowName: { fontSize: "14px", color: "#f0ece0" },
  teamTag:     { fontSize: "12px", fontFamily: "'Courier New', monospace", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", border: "1px solid", letterSpacing: "0.06em" },
  startBtn:    { width: "100%", padding: "14px", background: "#ffc800", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "15px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer" },
  waitHint:    { fontSize: "13px", color: "#45443e", margin: "12px 0 0" },

  rightTabs:      { display: "flex", gap: "4px", background: "#0d0d14", borderRadius: "10px", padding: "4px" },
  rightTab:       { flex: 1, padding: "8px", border: "none", borderRadius: "7px", background: "transparent", color: "#6b6860", fontSize: "12px", fontFamily: "'Georgia', serif", cursor: "pointer" },
  rightTabActive: { background: "#1e1e2a", color: "#ffc800", fontWeight: 600 },

  progressBar:  { display: "flex", justifyContent: "space-between", background: "#13131a", borderRadius: "8px", padding: "10px 16px", border: "1px solid rgba(255,255,255,0.06)" },
  progressText: { fontSize: "12px", color: "#6b6860", letterSpacing: "0.06em" },

  playerCard:       { background: "#13131a", border: "1px solid rgba(255,200,0,0.15)", borderRadius: "12px", padding: "24px" },
  playerMeta:       { display: "flex", gap: "8px", marginBottom: "10px" },
  roleBadge:        { fontSize: "10px", letterSpacing: "0.1em", color: "#ffc800", background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)", borderRadius: "20px", padding: "3px 10px" },
  nationalityBadge: { fontSize: "10px", letterSpacing: "0.08em", color: "#6b6860", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "3px 10px" },
  playerName:       { fontSize: "28px", color: "#f0ece0", margin: "0 0 12px", fontWeight: 700 },
  ratingRow:        { display: "flex", gap: "12px", marginBottom: "10px" },
  ratingBox:        { textAlign: "center" as const },
  ratingVal:        { display: "block", fontSize: "22px", color: "#ffc800", fontWeight: 700 },
  ratingLabel:      { display: "block", fontSize: "10px", color: "#6b6860", letterSpacing: "0.08em" },
  basePriceText:    { fontSize: "13px", color: "#45443e", margin: 0 },

  timerWrap:  { display: "flex", alignItems: "center", gap: "12px" },
  timerTrack: { flex: 1, height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "3px", overflow: "hidden" },
  timerFill:  { height: "100%", borderRadius: "3px", transition: "width 0.5s linear, background 0.3s" },
  timerNum:   { fontSize: "18px", fontWeight: 700, fontFamily: "'Courier New', monospace", minWidth: "36px" },

  currentBid:       { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", display: "flex", alignItems: "center", gap: "16px" },
  currentBidLabel:  { fontSize: "12px", color: "#6b6860", letterSpacing: "0.08em", textTransform: "uppercase" as const },
  currentBidAmount: { fontSize: "32px", fontWeight: 700, color: "#f0ece0", fontFamily: "'Courier New', monospace" },
  highBidder:       { fontSize: "14px", fontWeight: 700, marginLeft: "auto" },
  noBids:           { fontSize: "13px", color: "#45443e", marginLeft: "auto" },

  bidControls: { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", display: "flex", flexDirection: "column" as const, gap: "12px" },
  bidInputRow: { display: "flex", alignItems: "center", gap: "8px" },
  nudgeBtn:    { width: "36px", height: "36px", background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", color: "#f0ece0", fontSize: "18px", cursor: "pointer", fontFamily: "'Georgia', serif" },
  bidInput:    { flex: 1, background: "#0d0d14", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "6px", padding: "8px 12px", color: "#ffc800", fontSize: "20px", fontFamily: "'Courier New', monospace", fontWeight: 700, textAlign: "center" as const, outline: "none" },
  quickBids:   { display: "flex", gap: "8px" },
  quickBtn:    { flex: 1, padding: "6px", background: "#0d0d14", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "6px", color: "#6b6860", fontSize: "12px", cursor: "pointer", fontFamily: "'Georgia', serif" },
  bidBtn:      { padding: "13px", color: "#0a0a0f", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer" },

  divider: { height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" },

  doneBtn: {
    padding: "11px", background: "rgba(76,175,80,0.1)", color: "#4caf50",
    border: "1px solid rgba(76,175,80,0.3)", borderRadius: "8px",
    fontSize: "13px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },
  doneStatus: { display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" },
  doneCheck:  { fontSize: "16px", color: "#4caf50" },
  doneText:   { fontSize: "12px", color: "#4caf50" },

  endAuctionBtn: {
    padding: "13px", background: "rgba(255,95,87,0.1)", color: "#ff5f57",
    border: "1px solid rgba(255,95,87,0.3)", borderRadius: "8px",
    fontSize: "14px", fontWeight: 700, fontFamily: "'Georgia', serif", cursor: "pointer",
  },
  waitingText: { fontSize: "12px", color: "#6b6860", textAlign: "center" as const, margin: 0 },

  bidHistory:   { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px" },
  historyLabel: { fontSize: "11px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 10px" },
  historyRow:   { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  historyAmount:{ fontSize: "13px", color: "#f0ece0" },

  squadsPanel:      { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px" },
  squadsPanelTitle: { fontSize: "11px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 12px" },
  squadRow:         { display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" },
  squadTeam:        { fontSize: "13px", fontFamily: "'Courier New', monospace", fontWeight: 700, width: "44px" },
  squadPlayerCount: { fontSize: "11px", color: "#6b6860", width: "36px" },
  squadBudgetBar:   { flex: 1, height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" },
  squadBudgetFill:  { height: "100%", borderRadius: "2px", transition: "width 0.3s" },
  squadBudgetNum:   { fontSize: "11px", color: "#6b6860", width: "28px", textAlign: "right" as const },
  donePip:          { fontSize: "10px", color: "#4caf50" },

  recentPanel:  { background: "#13131a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px 20px" },
  recentTitle:  { fontSize: "11px", color: "#45443e", letterSpacing: "0.08em", textTransform: "uppercase" as const, margin: "0 0 12px" },
  recentRow:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" },
  recentName:   { fontSize: "12px", color: "#f0ece0" },
  recentSold:   { fontSize: "11px", fontWeight: 700, fontFamily: "'Courier New', monospace" },
  recentUnsold: { fontSize: "11px", color: "#45443e" },

  loadingText:  { color: "#6b6860", fontFamily: "'Georgia', serif", fontSize: "15px" },
  errorText:    { color: "#ff5f57", fontSize: "13px", margin: 0 },
  successText:  { color: "#4caf50", fontSize: "13px", margin: 0 },
  disabled:     { opacity: 0.4, cursor: "not-allowed" },
};