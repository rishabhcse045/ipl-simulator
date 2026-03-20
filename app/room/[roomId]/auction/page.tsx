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
  // Mobile bottom sheet tab: "lot" | "squad"
  const [mobileTab, setMobileTab] = useState<"lot" | "squad">("lot");
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
  const doneCount      = room ? Object.values(room.players).filter((p: any) => p.auctionDone).length : 0;
  const totalCount     = room ? Object.values(room.players).length : 0;

  // ── Loading ───────────────────────────────────────────
  if (!room) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f]">
      <p className="text-[#6b6860] font-serif text-base">Loading auction…</p>
    </div>
  );

  // ── Pre-auction ───────────────────────────────────────
  if (!auction || auction.status === "waiting") {
    return (
      <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 font-serif relative">
        <GridBg />
        <div className="max-w-sm mx-auto mt-8 bg-[#13131a] border border-yellow-400/15 rounded-2xl p-6 sm:p-9 text-center relative z-10">
          <h1 className="text-2xl text-[#f0ece0] mb-2">🏏 Auction Room</h1>
          <p className="text-sm text-[#6b6860] mb-6">All players have selected their teams. Time to build your squad.</p>
          <div className="flex flex-col gap-2 mb-6">
            {Object.values(room.players).map((p) => (
              <div key={p.uid} className="flex justify-between items-center">
                <span className="text-sm text-[#f0ece0]">{p.displayName}</span>
                <span className="text-xs font-mono font-bold px-3 py-1 rounded-full border" style={{
                  background:  p.team ? TEAM_COLORS[p.team as IPLTeam] + "22" : "transparent",
                  color:       p.team ? TEAM_COLORS[p.team as IPLTeam] : "#6b6860",
                  borderColor: p.team ? TEAM_COLORS[p.team as IPLTeam] + "55" : "rgba(255,255,255,0.08)",
                }}>
                  {p.team ?? "—"}
                </span>
              </div>
            ))}
          </div>
          {isHost ? (
            <button
              className="w-full py-3.5 bg-[#ffc800] text-[#0a0a0f] rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer"
              onClick={startAuction} disabled={loading}
            >
              {loading ? "Starting…" : "Start Auction →"}
            </button>
          ) : (
            <p className="text-xs text-[#45443e] mt-3">Waiting for host to start the auction…</p>
          )}
          {error && <p className="text-[#ff5f57] text-sm mt-2">{error}</p>}
        </div>
      </main>
    );
  }

  // ── Auction complete ──────────────────────────────────
  if (auction.status === "completed") {
    return (
      <main className="min-h-screen bg-[#0a0a0f] px-4 py-8 font-serif relative">
        <GridBg />
        <div className="max-w-sm mx-auto mt-20 bg-[#13131a] border border-yellow-400/15 rounded-2xl p-9 text-center relative z-10">
          <h1 className="text-2xl text-[#f0ece0] mb-2">🎉 Auction Complete!</h1>
          <p className="text-sm text-[#6b6860]">All squads are set. Season is starting…</p>
        </div>
      </main>
    );
  }

  // ── Main Auction UI ───────────────────────────────────
  return (
    <main className="min-h-screen bg-[#0a0a0f] font-serif relative">
      <GridBg />

      {/* ── DESKTOP layout (md+) ── */}
      <div className="hidden md:block px-5 py-5 relative z-10">
        <div className="max-w-[960px] mx-auto grid grid-cols-[1fr_300px] gap-5">

          {/* LEFT */}
          <div className="flex flex-col gap-3.5">
            <ProgressBar auction={auction} completedLots={completedLots} />
            {lot ? (
              <>
                <PlayerCard lot={lot} />
                <TimerBar timerPct={timerPct} timerColor={timerColor} timeLeft={timeLeft} />
                <CurrentBidBar lot={lot} />
                <BidControls
                  lot={lot} bidAmount={bidAmount} setBidAmount={setBidAmount}
                  minBid={minBid} myBudget={myBudget} myTeam={myTeam}
                  loading={loading} error={error} lastMsg={lastMsg}
                  onBid={placeBid} myDone={myDone} doneCount={doneCount}
                  totalCount={totalCount} isHost={isHost}
                  allPlayersDone={allPlayersDone} onDone={markDone} onEndAuction={endAuction}
                />
                {lot.bidHistory?.length > 0 && <BidHistory lot={lot} />}
              </>
            ) : (
              <p className="text-[#6b6860] text-sm">Loading next player…</p>
            )}
          </div>

          {/* RIGHT */}
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-1 bg-[#0d0d14] rounded-xl p-1">
              {(["mysquad", "overview"] as const).map((tab) => (
                <button key={tab}
                  className={`flex-1 py-2 rounded-lg text-xs font-serif cursor-pointer border-none transition-colors ${rightTab === tab ? "bg-[#1e1e2a] text-[#ffc800] font-semibold" : "bg-transparent text-[#6b6860]"}`}
                  onClick={() => setRightTab(tab)}
                >
                  {tab === "mysquad" ? `My Squad${myCount > 0 ? ` (${myCount})` : ""}` : "All Teams"}
                </button>
              ))}
            </div>
            {rightTab === "mysquad" && myTeam && mySquad && (
              <MySquadPanel players={myPlayers} team={myTeam} budget={myBudget} />
            )}
            {rightTab === "overview" && (
              <OverviewPanel room={room} completedLots={completedLots} />
            )}
          </div>
        </div>
      </div>

      {/* ── MOBILE layout (< md) ── */}
      <div className="md:hidden flex flex-col h-screen relative z-10">

        {/* Top: Progress + Timer */}
        <div className="px-3 pt-3 flex flex-col gap-2">
          <ProgressBar auction={auction} completedLots={completedLots} />
          <TimerBar timerPct={timerPct} timerColor={timerColor} timeLeft={timeLeft} />
        </div>

        {/* Mobile tab switcher */}
        <div className="flex gap-1 mx-3 mt-2 bg-[#0d0d14] rounded-xl p-1">
          <button
            className={`flex-1 py-2 rounded-lg text-xs font-serif cursor-pointer border-none transition-colors ${mobileTab === "lot" ? "bg-[#1e1e2a] text-[#ffc800] font-semibold" : "bg-transparent text-[#6b6860]"}`}
            onClick={() => setMobileTab("lot")}
          >
            🏏 Current Lot
          </button>
          <button
            className={`flex-1 py-2 rounded-lg text-xs font-serif cursor-pointer border-none transition-colors ${mobileTab === "squad" ? "bg-[#1e1e2a] text-[#ffc800] font-semibold" : "bg-transparent text-[#6b6860]"}`}
            onClick={() => setMobileTab("squad")}
          >
            My Squad {myCount > 0 ? `(${myCount})` : ""}
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 mt-2">
          {mobileTab === "lot" ? (
            lot ? (
              <div className="flex flex-col gap-3">
                <PlayerCard lot={lot} mobile />
                <CurrentBidBar lot={lot} />
                <BidControls
                  lot={lot} bidAmount={bidAmount} setBidAmount={setBidAmount}
                  minBid={minBid} myBudget={myBudget} myTeam={myTeam}
                  loading={loading} error={error} lastMsg={lastMsg}
                  onBid={placeBid} myDone={myDone} doneCount={doneCount}
                  totalCount={totalCount} isHost={isHost}
                  allPlayersDone={allPlayersDone} onDone={markDone} onEndAuction={endAuction}
                  mobile
                />
                {lot.bidHistory?.length > 0 && <BidHistory lot={lot} />}
                <OverviewPanel room={room} completedLots={completedLots} compact />
              </div>
            ) : (
              <p className="text-[#6b6860] text-sm text-center mt-10">Loading next player…</p>
            )
          ) : (
            myTeam && mySquad ? (
              <MySquadPanel players={myPlayers} team={myTeam} budget={myBudget} />
            ) : (
              <p className="text-[#6b6860] text-sm text-center mt-10">No squad data yet.</p>
            )
          )}
        </div>
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────

function GridBg() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        backgroundImage: "linear-gradient(rgba(255,200,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,200,0,0.03) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }}
      aria-hidden
    />
  );
}

function ProgressBar({ auction, completedLots }: { auction: any; completedLots: any[] }) {
  return (
    <div className="flex justify-between bg-[#13131a] rounded-lg px-4 py-2.5 border border-white/5">
      <span className="text-xs text-[#6b6860] tracking-wider">
        Lot {(auction.currentLotIndex ?? 0) + 1} of {auction.lots?.length ?? 0}
      </span>
      <span className="text-xs text-[#6b6860] tracking-wider">{completedLots.length} sold</span>
    </div>
  );
}

function PlayerCard({ lot, mobile }: { lot: any; mobile?: boolean }) {
  return (
    <div className="bg-[#13131a] border border-yellow-400/15 rounded-xl p-5">
      <div className="flex gap-2 mb-2">
        <span className="text-[10px] tracking-widest text-[#ffc800] bg-yellow-400/8 border border-yellow-400/20 rounded-full px-2.5 py-0.5">
          {lot.player.role.toUpperCase()}
        </span>
        <span className="text-[10px] tracking-wider text-[#6b6860] bg-white/4 border border-white/8 rounded-full px-2.5 py-0.5">
          {lot.player.nationality}
        </span>
      </div>
      <h2 className={`text-[#f0ece0] font-bold mb-3 ${mobile ? "text-xl" : "text-3xl"}`}>
        {lot.player.name}
      </h2>
      <div className="flex gap-4 mb-2">
        {lot.player.battingRating > 30 && (
          <div className="text-center">
            <span className="block text-xl text-[#ffc800] font-bold">{lot.player.battingRating}</span>
            <span className="block text-[10px] text-[#6b6860] tracking-wider">BAT</span>
          </div>
        )}
        {lot.player.bowlingRating > 30 && (
          <div className="text-center">
            <span className="block text-xl text-[#ffc800] font-bold">{lot.player.bowlingRating}</span>
            <span className="block text-[10px] text-[#6b6860] tracking-wider">BOWL</span>
          </div>
        )}
        {lot.player.wicketkeeperRating > 0 && (
          <div className="text-center">
            <span className="block text-xl text-[#ffc800] font-bold">{lot.player.wicketkeeperRating}</span>
            <span className="block text-[10px] text-[#6b6860] tracking-wider">WK</span>
          </div>
        )}
      </div>
      <p className="text-xs text-[#45443e]">Base price: {lot.player.basePrice} cr</p>
    </div>
  );
}

function TimerBar({ timerPct, timerColor, timeLeft }: { timerPct: number; timerColor: string; timeLeft: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${timerPct}%`, background: timerColor }}
        />
      </div>
      <span className="text-lg font-bold font-mono min-w-[36px]" style={{ color: timerColor }}>
        {timeLeft}s
      </span>
    </div>
  );
}

function CurrentBidBar({ lot }: { lot: any }) {
  return (
    <div className="bg-[#13131a] border border-white/6 rounded-xl px-5 py-4 flex items-center gap-4">
      <div>
        <p className="text-xs text-[#6b6860] tracking-wider uppercase mb-0.5">Current Bid</p>
        <p className="text-3xl font-bold font-mono text-[#f0ece0]">{lot.currentBid} cr</p>
      </div>
      {lot.currentHighBidder
        ? <span className="ml-auto text-sm font-bold" style={{ color: TEAM_COLORS[lot.currentHighBidder as IPLTeam] }}>
            {lot.currentHighBidder} leading
          </span>
        : <span className="ml-auto text-sm text-[#45443e]">No bids yet</span>
      }
    </div>
  );
}

function BidControls({
  lot, bidAmount, setBidAmount, minBid, myBudget, myTeam,
  loading, error, lastMsg, onBid, myDone, doneCount, totalCount,
  isHost, allPlayersDone, onDone, onEndAuction, mobile,
}: any) {
  return (
    <div className="bg-[#13131a] border border-white/6 rounded-xl p-5 flex flex-col gap-3">
      {/* Bid input row */}
      <div className="flex items-center gap-2">
        <button
          className="w-10 h-10 bg-[#0d0d14] border border-white/8 rounded-lg text-[#f0ece0] text-lg cursor-pointer flex-shrink-0"
          onClick={() => setBidAmount(Math.max(minBid, parseFloat((bidAmount - 0.5).toFixed(1))))}
        >−</button>
        <input
          type="number"
          className="flex-1 bg-[#0d0d14] border border-white/8 rounded-lg px-3 py-2 text-[#ffc800] text-xl font-mono font-bold text-center outline-none min-w-0"
          value={bidAmount}
          step={0.5}
          min={minBid}
          max={myBudget}
          onChange={(e) => setBidAmount(Number(e.target.value))}
        />
        <button
          className="w-10 h-10 bg-[#0d0d14] border border-white/8 rounded-lg text-[#f0ece0] text-lg cursor-pointer flex-shrink-0"
          onClick={() => setBidAmount(Math.min(myBudget, parseFloat((bidAmount + 0.5).toFixed(1))))}
        >+</button>
      </div>

      {/* Quick bid buttons */}
      <div className="grid grid-cols-4 gap-2">
        {[0.5, 1, 2, 5].map((inc) => (
          <button key={inc}
            className="py-1.5 bg-[#0d0d14] border border-white/6 rounded-lg text-[#6b6860] text-xs cursor-pointer"
            onClick={() => setBidAmount(Math.min(myBudget, parseFloat(((lot.currentBid ?? 0) + inc).toFixed(1))))}
          >
            +{inc}
          </button>
        ))}
      </div>

      {/* Budget info */}
      <p className="text-xs text-[#45443e]">Budget: {myBudget} cr remaining</p>

      {/* Bid button */}
      <button
        className="w-full py-3.5 rounded-lg text-sm font-bold text-[#0a0a0f] cursor-pointer border-none disabled:opacity-40"
        style={{ background: myTeam ? TEAM_COLORS[myTeam as IPLTeam] : "#ffc800", ...(loading || bidAmount < minBid || bidAmount > myBudget ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}
        onClick={onBid}
        disabled={loading || bidAmount < minBid || bidAmount > myBudget}
      >
        {loading ? "Placing…" : `Bid ${bidAmount}cr for ${myTeam}`}
      </button>

      {error   && <p className="text-[#ff5f57] text-sm">{error}</p>}
      {lastMsg && <p className="text-[#4caf50] text-sm">{lastMsg}</p>}

      <div className="h-px bg-white/6" />

      {/* Done button */}
      {!myDone ? (
        <button
          className="w-full py-3 bg-green-500/10 text-[#4caf50] border border-green-500/30 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40"
          onClick={onDone} disabled={loading}
        >
          ✓ I'm Done Bidding
        </button>
      ) : (
        <div className="flex items-center gap-2 py-2">
          <span className="text-[#4caf50] text-base">✓</span>
          <span className="text-xs text-[#4caf50]">You're done — {doneCount}/{totalCount} players ready</span>
        </div>
      )}

      {isHost && allPlayersDone && (
        <button
          className="w-full py-3 bg-red-500/10 text-[#ff5f57] border border-red-500/30 rounded-lg text-sm font-bold cursor-pointer disabled:opacity-40"
          onClick={onEndAuction} disabled={loading}
        >
          ⏭ End Auction &amp; Start Season
        </button>
      )}

      {isHost && !allPlayersDone && doneCount > 0 && (
        <p className="text-xs text-[#6b6860] text-center">
          Waiting for all players… {doneCount}/{totalCount} done
        </p>
      )}
    </div>
  );
}

function BidHistory({ lot }: { lot: any }) {
  return (
    <div className="bg-[#13131a] border border-white/6 rounded-xl px-5 py-4">
      <p className="text-[11px] text-[#45443e] tracking-wider uppercase mb-2.5">Bid History</p>
      {[...lot.bidHistory].reverse().slice(0, 6).map((b: any, i: number) => (
        <div key={i} className="flex justify-between py-1 border-b border-white/4">
          <span className="font-semibold" style={{ color: TEAM_COLORS[b.team as IPLTeam] }}>{b.team}</span>
          <span className="text-sm text-[#f0ece0]">{b.amount} cr</span>
        </div>
      ))}
    </div>
  );
}

function OverviewPanel({ room, completedLots, compact }: { room: Room; completedLots: any[]; compact?: boolean }) {
  return (
    <>
      <div className="bg-[#13131a] border border-white/6 rounded-xl px-5 py-4">
        <p className="text-[11px] text-[#45443e] tracking-wider uppercase mb-3">All Squads</p>
        {Object.values(room.players).map((p) => {
          if (!p.team) return null;
          const squad  = room.squads[p.team];
          const count  = squad?.players?.length ?? 0;
          const budget = squad?.budgetRemaining ?? 0;
          const color  = TEAM_COLORS[p.team as IPLTeam];
          const pDone  = (p as any).auctionDone;
          return (
            <div key={p.uid} className="flex items-center gap-2 mb-2.5">
              <span className="text-sm font-mono font-bold w-11" style={{ color }}>{p.team}</span>
              <span className="text-[11px] text-[#6b6860] w-9">{count}/20</span>
              <div className="flex-1 h-1 bg-white/6 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(budget / 150) * 100}%`, background: color + "88" }} />
              </div>
              <span className="text-[11px] text-[#6b6860] w-7 text-right">{budget}</span>
              {pDone && <span className="text-[10px] text-[#4caf50]">✓</span>}
            </div>
          );
        })}
      </div>

      {completedLots.length > 0 && (
        <div className="bg-[#13131a] border border-white/6 rounded-xl px-5 py-4 mt-2.5">
          <p className="text-[11px] text-[#45443e] tracking-wider uppercase mb-3">Recent Sales</p>
          {completedLots.slice(-8).reverse().map((l, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/4">
              <span className="text-xs text-[#f0ece0]">{l.player.name}</span>
              {l.status === "sold"
                ? <span className="text-[11px] font-bold font-mono" style={{ color: TEAM_COLORS[l.soldTo as IPLTeam] }}>
                    {l.soldTo} · {l.soldPrice}cr
                  </span>
                : <span className="text-[11px] text-[#45443e]">Unsold</span>
              }
            </div>
          ))}
        </div>
      )}
    </>
  );
}