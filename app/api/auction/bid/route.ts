import { NextRequest, NextResponse } from "next/server";
import { ref, get, update } from "firebase/database";
import { db } from "@/lib/firebase";
import { getAuctionOrder } from "@/lib/players";
import {
  Room, AuctionState, AuctionLot, PlaceBidPayload,
  PlaceBidResponse, IPLTeam, SQUAD_SIZE, AUCTION_BUDGET,
} from "@/types/game";

const BID_WINDOW_MS = 10000; // 10 seconds per bid round

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, roomId } = body;

  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

  const roomRef  = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const room: Room = snapshot.val();

  // ── START AUCTION ─────────────────────────────────────
  if (action === "start") {
    if (room.auction) return NextResponse.json({ error: "Auction already started" }, { status: 400 });

    const players = getAuctionOrder();
    const lots: AuctionLot[] = players.map((player) => ({
      player,
      currentBid:        player.basePrice,
      currentHighBidder: null,
      status:            "pending",
      soldTo:            null,
      soldPrice:         null,
      bidHistory:        [],
    }));

    lots[0].status = "live";

    const auction: AuctionState = {
      lots,
      currentLotIndex: 0,
      currentLot:      lots[0],
      status:          "in_progress",
      bidTimerEndsAt:  Date.now() + BID_WINDOW_MS,
    };

    await update(roomRef, { auction, updatedAt: Date.now() });
    return NextResponse.json({ success: true });
  }

  // ── PLACE BID ─────────────────────────────────────────
  if (action === "bid") {
    const { uid, team, amount, lotIndex } = body as PlaceBidPayload & { action: string };

    if (!team || !amount || lotIndex === undefined)
      return NextResponse.json({ error: "team, amount, lotIndex required" }, { status: 400 });

    const auction: AuctionState = room.auction!;
    if (!auction) return NextResponse.json({ error: "Auction not started" }, { status: 400 });

    if (lotIndex !== auction.currentLotIndex)
      return NextResponse.json({ error: "Bidding on wrong lot" }, { status: 400 });

    const lot = auction.lots[lotIndex];

    if (auction.bidTimerEndsAt && Date.now() > auction.bidTimerEndsAt)
      return NextResponse.json({ error: "Bid timer expired" }, { status: 400 });

    const minBid = lot.currentHighBidder
      ? lot.currentBid + 0.5
      : lot.player.basePrice;

    if (amount < minBid)
      return NextResponse.json({ error: `Minimum bid is ${minBid}cr` }, { status: 400 });

    const squad = room.squads[team as IPLTeam];
    if (!squad) return NextResponse.json({ error: "Team not found" }, { status: 400 });

    if (amount > squad.budgetRemaining)
      return NextResponse.json({ error: `Insufficient budget. You have ${squad.budgetRemaining} left.` }, { status: 400 });

    if ((squad.players ?? []).length >= SQUAD_SIZE)
      return NextResponse.json({ error: "Squad full (20 players)" }, { status: 400 });

    const player = room.players[uid];
    if (!player || player.team !== team)
      return NextResponse.json({ error: "You don't control this team" }, { status: 400 });

    const newBidEntry = { team, amount, timestamp: Date.now() };
    const updatedLot: AuctionLot = {
      ...lot,
      currentBid:        amount,
      currentHighBidder: team as IPLTeam,
      bidHistory:        [...(lot.bidHistory ?? []), newBidEntry],
    };

    await update(ref(db, `rooms/${roomId}/auction/lots/${lotIndex}`), updatedLot);
    await update(ref(db, `rooms/${roomId}/auction`), {
      currentLot:     updatedLot,
      bidTimerEndsAt: Date.now() + BID_WINDOW_MS,
    });
    await update(ref(db, `rooms/${roomId}`), { updatedAt: Date.now() });

    const response: PlaceBidResponse = { success: true };
    return NextResponse.json(response);
  }

  // ── CLOSE LOT ─────────────────────────────────────────
  if (action === "close_lot") {
    const auction: AuctionState = room.auction!;
    if (!auction) return NextResponse.json({ error: "Auction not started" }, { status: 400 });

    const idx = auction.currentLotIndex;
    const lot = auction.lots[idx];
    const updates: Record<string, any> = {};

    if (lot.currentHighBidder) {
      const soldLot: AuctionLot = {
        ...lot,
        status:    "sold",
        soldTo:    lot.currentHighBidder,
        soldPrice: lot.currentBid,
      };
      updates[`auction/lots/${idx}`] = soldLot;

      const team       = lot.currentHighBidder as IPLTeam;
      const squad      = room.squads[team];
      const soldPlayer = { ...lot.player, soldTo: team, soldPrice: lot.currentBid };
      updates[`squads/${team}/players`]         = [...(squad.players ?? []), soldPlayer];
      updates[`squads/${team}/budgetRemaining`] = squad.budgetRemaining - lot.currentBid;
    } else {
      updates[`auction/lots/${idx}`] = { ...lot, status: "unsold" };
    }

    const nextIdx = idx + 1;
    if (nextIdx < auction.lots.length) {
      const nextLot = { ...auction.lots[nextIdx], status: "live" };
      updates[`auction/currentLotIndex`] = nextIdx;
      updates[`auction/currentLot`]      = nextLot;
      updates[`auction/lots/${nextIdx}`] = nextLot;
      updates[`auction/bidTimerEndsAt`]  = Date.now() + BID_WINDOW_MS;
    } else {
      updates[`auction/status`]     = "completed";
      updates[`auction/currentLot`] = null;
      updates[`phase`]              = "season";
    }

    updates[`updatedAt`] = Date.now();
    await update(ref(db, `rooms/${roomId}`), updates);
    return NextResponse.json({ success: true });
  }

  // ── PLAYER MARKS THEMSELVES DONE ──────────────────────
  if (action === "player_done") {
    const { uid } = body;
    if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

    await update(ref(db, `rooms/${roomId}/players/${uid}`), { auctionDone: true });

    // Re-fetch to check if ALL players are done
    const freshSnap = await get(roomRef);
    const freshRoom = freshSnap.val();
    const allDone   = Object.values(freshRoom.players).every(
      (p: any) => p.auctionDone === true
    );

    if (allDone) {
      await update(ref(db, `rooms/${roomId}/auction`), { allPlayersDone: true });
    }

    await update(ref(db, `rooms/${roomId}`), { updatedAt: Date.now() });
    return NextResponse.json({ success: true, allDone });
  }

  // ── END AUCTION EARLY (host only, after all done) ─────
  if (action === "end_auction") {
    const updates: Record<string, any> = {
      "auction/status":     "completed",
      "auction/currentLot": null,
      "phase":              "season",
      "updatedAt":          Date.now(),
    };
    await update(ref(db, `rooms/${roomId}`), updates);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}