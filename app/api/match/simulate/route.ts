import { NextRequest, NextResponse } from "next/server";
import { ref, get, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  simulateBall, initInnings, isInningsOver,
  getMatchResult, getDefaultBattingOrder, getNextBowler,
} from "@/lib/matchEngine";
import {
  Room, Match, Innings, MatchPhase,
  IPLTeam, Player,
} from "@/types/game";

// Add this function after imports:
function removeUndefined(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, roomId } = body;

  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

  const roomRef  = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const room: Room = snapshot.val();

  // ── START MATCH ─────────────────────────────────────────
  if (action === "start_match") {
    const { team1, team2, matchId, matchNumber, stage } = body;

    const squad1 = room.squads[team1 as IPLTeam];
    const squad2 = room.squads[team2 as IPLTeam];

    if (!squad1 || !squad2)
      return NextResponse.json({ error: "Squads not found" }, { status: 400 });

    // Toss
    const tossWinner: IPLTeam   = Math.random() > 0.5 ? team1 : team2;
    const tossDecision           = Math.random() > 0.5 ? "bat" : "bowl";
    const battingFirst: IPLTeam  = tossDecision === "bat" ? tossWinner
      : tossWinner === team1 ? team2 : team1;
    const bowlingFirst: IPLTeam  = battingFirst === team1 ? team2 : team1;

    // Safe player arrays
    const bat1Players = (squad1.players ?? []).filter((p: Player) => !p.injured);
    const bat2Players = (squad2.players ?? []).filter((p: Player) => !p.injured);

    const order1       = getDefaultBattingOrder(battingFirst === team1 ? bat1Players : bat2Players);
    const innings1     = initInnings(battingFirst, bowlingFirst, order1);

    // First bowler
    const bowlingSquad1 = (bowlingFirst === team1 ? bat1Players : bat2Players);
    const firstBowler   = getNextBowler(bowlingSquad1, [], null);
    innings1.currentBowler = firstBowler?.id ?? null;

    const match: Match = {
      matchId,
      roomId,
      stage,
      matchNumber,
      team1,
      team2,
      tossWinner,
      tossDecision,
      innings1,
      innings2:          null,
      phase:             "innings1",
      result:            null,
      timeout1Used:      false,
      timeout2Used:      false,
      timeoutCommentary: null,
      startedAt:         Date.now(),
      completedAt:       null,
    };

    await update(roomRef, { currentMatch: match, updatedAt: Date.now() });
    return NextResponse.json({ success: true, match });
  }

  // ── SIMULATE BALL ───────────────────────────────────────
  if (action === "simulate_ball") {
    const match: Match = room.currentMatch!;
    if (!match) return NextResponse.json({ error: "No active match" }, { status: 400 });

    const isInnings1   = match.phase === "innings1";
    const innings      = isInnings1 ? match.innings1! : match.innings2!;

    if (!innings) return NextResponse.json({ error: "Innings not found" }, { status: 400 });

    // Safe bowling squad
    const bowlingTeam  = innings.bowlingTeam;
    const bowlingSquad = (room.squads[bowlingTeam]?.players ?? []);

    // Find current bowler safely
    const bowler = bowlingSquad.find((p: Player) => p.id === innings.currentBowler)
      ?? getNextBowler(bowlingSquad, innings.bowlerStats ?? [], null);

    if (!bowler) return NextResponse.json({ error: "No bowler available" }, { status: 400 });

    // Simulate
    const target = isInnings1 ? undefined : (match.innings1!.totalRuns + 1);
    const { ball, updatedInnings } = simulateBall(innings, bowler, match);

    // Determine phase
    let newPhase: MatchPhase = match.phase;
    const inningsOver        = isInningsOver(updatedInnings, target);

    const safeOvers     = updatedInnings.overs ?? [];
    const lastOver      = safeOvers[safeOvers.length - 1];
    const lastOverDone  = lastOver?.balls?.length === 6;
    const prevOversLen  = (innings.overs ?? []).length;

    if (isInnings1 && !match.timeout1Used && updatedInnings.totalOvers === 6 && lastOverDone) {
      newPhase = "strategic_timeout_1";
    } else if (!isInnings1 && !match.timeout2Used && updatedInnings.totalOvers === 6 && lastOverDone) {
      newPhase = "strategic_timeout_2";
    } else if (inningsOver && isInnings1) {
      newPhase = "innings_break";
    } else if (inningsOver && !isInnings1) {
      newPhase = "completed";
    }

    // Auto-select next bowler when over completes
    if (!ball.isExtra && safeOvers.length > prevOversLen) {
      const nextBowler = getNextBowler(
        bowlingSquad,
        updatedInnings.bowlerStats ?? [],
        bowler.id
      );
      if (nextBowler) updatedInnings.currentBowler = nextBowler.id;
    }

    // Build result if completed
    let result = match.result;
    if (newPhase === "completed") {
      const res = getMatchResult({ ...match, innings2: updatedInnings });
      result    = { ...res, playerOfMatch: ball.batsman?.id ?? "" };
    }

    const updatedMatch: Match = {
      ...match,
      innings1:    isInnings1 ? updatedInnings : match.innings1,
      innings2:    isInnings1 ? match.innings2  : updatedInnings,
      phase:       newPhase,
      result,
      completedAt: newPhase === "completed" ? Date.now() : null,
    };

   await update(roomRef, { currentMatch: removeUndefined(updatedMatch), updatedAt: Date.now() });
    return NextResponse.json({ success: true, ball, match: updatedMatch });
  }

  // ── SET BOWLER ──────────────────────────────────────────
  if (action === "set_bowler") {
    const { bowlerId } = body;
    const match: Match = room.currentMatch!;
    const isInnings1   = match.phase === "innings1";
    const innings      = isInnings1 ? match.innings1! : match.innings2!;
    innings.currentBowler = bowlerId;

    const updatedMatch = {
      ...match,
      innings1: isInnings1 ? innings : match.innings1,
      innings2: isInnings1 ? match.innings2 : innings,
    };

    await update(roomRef, { currentMatch: updatedMatch, updatedAt: Date.now() });
    return NextResponse.json({ success: true });
  }

  // ── NEXT INNINGS ────────────────────────────────────────
  if (action === "next_innings") {
    const match: Match  = room.currentMatch!;
    const inn1          = match.innings1!;

    const battingTeam: IPLTeam  = inn1.bowlingTeam;
    const bowlingTeam: IPLTeam  = inn1.battingTeam;

    const battingSquad = (room.squads[battingTeam]?.players ?? []).filter(
      (p: Player) => !p.injured
    );
    const bowlingSquad = (room.squads[bowlingTeam]?.players ?? []);

    const order2   = getDefaultBattingOrder(battingSquad);
    const innings2 = initInnings(battingTeam, bowlingTeam, order2);

    const firstBowler = getNextBowler(bowlingSquad, [], null);
    innings2.currentBowler = firstBowler?.id ?? null;

    const updatedMatch: Match = {
      ...match,
      innings2,
      phase: "innings2",
    };

    await update(roomRef, { currentMatch: updatedMatch, updatedAt: Date.now() });
    return NextResponse.json({ success: true, match: updatedMatch });
  }

  // ── RESUME AFTER TIMEOUT ────────────────────────────────
  if (action === "resume_after_timeout") {
    const match: Match         = room.currentMatch!;
    const isTimeout1           = match.phase === "strategic_timeout_1";
    const newPhase: MatchPhase = isTimeout1 ? "innings1" : "innings2";

    const updatedMatch = {
      ...match,
      phase:        newPhase,
      timeout1Used: isTimeout1 ? true : match.timeout1Used,
      timeout2Used: isTimeout1 ? match.timeout2Used : true,
    };

    await update(roomRef, { currentMatch: updatedMatch, updatedAt: Date.now() });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}