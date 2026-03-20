import { NextRequest, NextResponse } from "next/server";
import { ref, set, get, update } from "firebase/database";
import { db } from "@/lib/firebase";
import {
  Room,
  RoomPlayer,
  CreateRoomPayload,
  CreateRoomResponse,
  JoinRoomPayload,
  JoinRoomResponse,
  IPL_TEAMS,
  AUCTION_BUDGET,
} from "@/types/game";

// ── Helpers ────────────────────────────────────────────────

function generateRoomId(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `IPL-${digits}`;
}

function generateUid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildEmptyRoom(roomId: string, hostUid: string): Room {
  // Build empty squads for all 10 teams
  const squads = Object.fromEntries(
    IPL_TEAMS.map((team) => [
      team,
      {
        teamId: team,
        players: [],
        captain: null,
        viceCaptain: null,
        budgetRemaining: AUCTION_BUDGET,
      },
    ])
  ) as unknown as Room["squads"];

  return {
    roomId,
    hostUid,
    phase: "lobby",
    players: {},
    squads,
    auction: null,
    season: null,
    currentMatch: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    maxPlayers: 10,
  };
}

// ── POST /api/room ─────────────────────────────────────────
// Body: { action: "create", hostName } | { action: "join", roomId, playerName }

export async function POST(req: NextRequest) {
  const body = await req.json();

  // ── CREATE ───────────────────────────────────────────────
  if (body.action === "create") {
    const { hostName } = body as CreateRoomPayload & { action: string };

    if (!hostName?.trim()) {
      return NextResponse.json({ error: "hostName is required" }, { status: 400 });
    }

    // Try up to 5 times to get a unique room id
    let roomId = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateRoomId();
      const snapshot = await get(ref(db, `rooms/${candidate}`));
      if (!snapshot.exists()) {
        roomId = candidate;
        break;
      }
    }

    if (!roomId) {
      return NextResponse.json({ error: "Could not generate unique room. Try again." }, { status: 500 });
    }

    const hostUid = generateUid();
    const room    = buildEmptyRoom(roomId, hostUid);

    const hostPlayer: RoomPlayer = {
      uid:         hostUid,
      displayName: hostName.trim(),
      team:        null,
      isHost:      true,
      isReady:     false,
      joinedAt:    Date.now(),
    };

    room.players[hostUid] = hostPlayer;

    await set(ref(db, `rooms/${roomId}`), room);

    const response: CreateRoomResponse = { roomId, uid: hostUid };
    return NextResponse.json(response);
  }

  // ── JOIN ─────────────────────────────────────────────────
  if (body.action === "join") {
    const { roomId, playerName } = body as JoinRoomPayload & { action: string };

    if (!roomId?.trim() || !playerName?.trim()) {
      return NextResponse.json({ error: "roomId and playerName are required" }, { status: 400 });
    }

    const roomRef  = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Room not found. Check the room code." }, { status: 404 });
    }

    const room: Room = snapshot.val();

    if (room.phase !== "lobby") {
      return NextResponse.json({ error: "Game already started. Cannot join." }, { status: 400 });
    }

    const currentPlayers = Object.keys(room.players || {}).length;
    if (currentPlayers >= room.maxPlayers) {
      return NextResponse.json({ error: "Room is full." }, { status: 400 });
    }

    const uid = generateUid();

    const newPlayer: RoomPlayer = {
      uid,
      displayName: playerName.trim(),
      team:        null,
      isHost:      false,
      isReady:     false,
      joinedAt:    Date.now(),
    };

    await update(ref(db, `rooms/${roomId}/players/${uid}`), newPlayer);
    await update(ref(db, `rooms/${roomId}`), { updatedAt: Date.now() });

    // Re-fetch full room to return to client
    const updated  = await get(roomRef);
    const response: JoinRoomResponse = {
      success: true,
      uid,
      room: updated.val(),
    };

    return NextResponse.json(response);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── PATCH /api/room ────────────────────────────────────────
// Used to select a team or mark player as ready
// Body: { roomId, uid, action: "select_team" | "set_ready", team? }

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { roomId, uid, action } = body;

  if (!roomId || !uid || !action) {
    return NextResponse.json({ error: "roomId, uid, action required" }, { status: 400 });
  }

  const roomRef  = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const room: Room = snapshot.val();

  // ── SELECT TEAM ──────────────────────────────────────────
  if (action === "select_team") {
    const { team } = body;

    if (!team) {
      return NextResponse.json({ error: "team is required" }, { status: 400 });
    }

    // Check team not already taken by another player
    const takenBy = Object.values(room.players).find(
      (p) => p.team === team && p.uid !== uid
    );
    if (takenBy) {
      return NextResponse.json({ error: `${team} is already taken by ${takenBy.displayName}` }, { status: 400 });
    }

    await update(ref(db, `rooms/${roomId}/players/${uid}`), { team });
    await update(ref(db, `rooms/${roomId}`), { updatedAt: Date.now() });

    return NextResponse.json({ success: true });
  }

  // ── SET READY ────────────────────────────────────────────
  if (action === "set_ready") {
    const player = room.players[uid];

    if (!player?.team) {
      return NextResponse.json({ error: "Select a team before marking ready" }, { status: 400 });
    }

    await update(ref(db, `rooms/${roomId}/players/${uid}`), { isReady: true });

    // Check if ALL players are ready → move room to auction phase
    const allPlayers  = Object.values(room.players);
    const allReady    = allPlayers.every((p) => p.uid === uid || p.isReady);
    const enoughPlayers = allPlayers.length >= 2;

    if (allReady && enoughPlayers) {
      await update(ref(db, `rooms/${roomId}`), {
        phase:     "auction",
        updatedAt: Date.now(),
      });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}