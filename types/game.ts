// ============================================================
// IPL SIMULATOR — COMPLETE TYPE DEFINITIONS
// ============================================================

// ------------------------------------------------------------
// ENUMS
// ------------------------------------------------------------

export type IPLTeam =
  | "MI"   // Mumbai Indians
  | "CSK"  // Chennai Super Kings
  | "RCB"  // Royal Challengers Bangalore
  | "KKR"  // Kolkata Knight Riders
  | "DC"   // Delhi Capitals
  | "RR"   // Rajasthan Royals
  | "SRH"  // Sunrisers Hyderabad
  | "PBKS" // Punjab Kings
  | "LSG"  // Lucknow Super Giants
  | "GT";  // Gujarat Titans

export type PlayerRole =
  | "batsman"
  | "bowler"
  | "allrounder"
  | "wicketkeeper";

export type PlayerNationality =
  | "India"
  | "Australia"
  | "England"
  | "South Africa"
  | "New Zealand"
  | "West Indies"
  | "Sri Lanka"
  | "Afghanistan";

export type BallOutcome =
  | "dot"
  | "1"
  | "2"
  | "3"
  | "4"
  | "6"
  | "wicket"
  | "wide"
  | "noball";

export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "runout"
  | "stumped"
  | "hitwicket";

export type RoomPhase =
  | "lobby"       // waiting for players, team selection
  | "auction"     // live player auction
  | "season"      // round-robin matches ongoing
  | "playoffs"    // semi-finals
  | "final"       // final match
  | "completed";  // season over, champion crowned

export type MatchPhase =
  | "not_started"
  | "innings1"
  | "strategic_timeout_1"   // after 6 overs in innings 1
  | "strategic_timeout_2"   // after 6 overs in innings 2
  | "innings_break"
  | "innings2"
  | "completed";

export type DramaType =
  | "injury"
  | "controversy"
  | "form_boost"
  | "morale_drop"
  | "morale_boost"
  | "player_unhappy"
  | "umpire_drama"
  | "weather_delay";

export type PlayoffStage =
  | "semi1"
  | "semi2"
  | "final";

// ------------------------------------------------------------
// PLAYER
// ------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  role: PlayerRole;
  nationality: PlayerNationality;
  basePrice: number;           // auction base price (out of 100 budget)

  // Stats that affect simulation
  battingRating: number;       // 1–100
  bowlingRating: number;       // 1–100 (0 if pure batsman)
  wicketkeeperRating: number;  // 1–100 (0 if not keeper)

  // In-game dynamic state
  currentForm: number;         // -10 to +10, affected by drama events
  injured: boolean;
  injuredForMatches: number;   // matches remaining injured (0 = fit)

  // Auction result
  soldTo: IPLTeam | null;
  soldPrice: number | null;
}

// ------------------------------------------------------------
// SQUAD
// ------------------------------------------------------------

export interface Squad {
  teamId: IPLTeam;
  players: Player[];           // max 20 players
  captain: string | null;      // player id
  viceCaptain: string | null;  // player id
  budgetRemaining: number;     // starts at 100
}

// ------------------------------------------------------------
// AUCTION
// ------------------------------------------------------------

export interface AuctionLot {
  player: Player;
  currentBid: number;
  currentHighBidder: IPLTeam | null;
  status: "pending" | "live" | "sold" | "unsold";
  soldTo: IPLTeam | null;
  soldPrice: number | null;
  bidHistory: BidEntry[];
}

export interface BidEntry {
  team: IPLTeam;
  amount: number;
  timestamp: number;
}

export interface AuctionState {
  lots: AuctionLot[];
  currentLotIndex: number;     // index into lots[]
  currentLot: AuctionLot | null;
  status: "waiting" | "in_progress" | "completed";
  bidTimerEndsAt: number | null; // unix ms, countdown timer per bid
}

// ------------------------------------------------------------
// MATCH — BALL & OVER
// ------------------------------------------------------------

export interface Ball {
  overNumber: number;          // 0-indexed (0–19)
  ballNumber: number;          // 1-indexed (1–6, extras don't count)
  bowler: Player;
  batsman: Player;
  outcome: BallOutcome;
  runs: number;                // runs scored on this ball
  wicketType?: WicketType;
  dismissedBatsman?: Player;
  commentary: string;          // AI-generated or template commentary
  isExtra: boolean;
}

export interface Over {
  overNumber: number;          // 0-indexed
  bowler: Player;
  balls: Ball[];
  runsInOver: number;
  wicketsInOver: number;
}

// ------------------------------------------------------------
// MATCH — INNINGS
// ------------------------------------------------------------

export interface BatsmanStats {
  player: Player;
  runs: number;
  ballsFaced: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  dismissed: boolean;
  wicketType?: WicketType;
  dismissedBy?: Player;        // bowler or fielder
  battingPosition: number;     // 1–11
}

export interface BowlerStats {
  player: Player;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
  noBalls: number;
  wides: number;
}

export interface Innings {
  battingTeam: IPLTeam;
  bowlingTeam: IPLTeam;
  totalRuns: number;
  totalWickets: number;
  totalOvers: number;          // completed overs (float, e.g. 18.3)
  overs: Over[];
  battingOrder: Player[];      // player ids in batting order
  batsmanStats: BatsmanStats[];
  bowlerStats: BowlerStats[];
  currentBatsmen: [string, string]; // [striker id, non-striker id]
  currentBowler: string | null;     // player id
  extras: number;
  fallOfWickets: FallOfWicket[];
}

export interface FallOfWicket {
  wicketNumber: number;        // 1–10
  runs: number;
  overs: number;
  batsman: string;             // player id
}

// ------------------------------------------------------------
// MATCH — CAPTAIN DECISIONS
// ------------------------------------------------------------

export interface CaptainDecision {
  type: "choose_bowler" | "set_batting_order" | "timeout_strategy";
  teamId: IPLTeam;
  playerId?: string;           // for choose_bowler
  battingOrder?: string[];     // player ids in order
  strategyNote?: string;       // free text strategy for timeout
}

// ------------------------------------------------------------
// MATCH
// ------------------------------------------------------------

export interface Match {
  matchId: string;
  roomId: string;
  stage: "league" | PlayoffStage;
  matchNumber: number;

  team1: IPLTeam;
  team2: IPLTeam;

  tossWinner: IPLTeam | null;
  tossDecision: "bat" | "bowl" | null;

  innings1: Innings | null;
  innings2: Innings | null;

  phase: MatchPhase;

  result: MatchResult | null;

  // Strategic timeouts
  timeout1Used: boolean;       // innings 1 timeout used
  timeout2Used: boolean;       // innings 2 timeout used
  timeoutCommentary: string | null;

  startedAt: number | null;    // unix ms
  completedAt: number | null;
}

export interface MatchResult {
  winner: IPLTeam;
  loser: IPLTeam;
  margin: number;
  marginType: "runs" | "wickets";
  playerOfMatch: string;       // player id
  summary: string;             // e.g. "MI won by 24 runs"
}

// ------------------------------------------------------------
// DRAMA EVENTS
// ------------------------------------------------------------

export interface DramaEvent {
  id: string;
  type: DramaType;
  headline: string;            // e.g. "Pandya unhappy with captain"
  description: string;
  affectedTeam: IPLTeam;
  affectedPlayer?: string;     // player id
  effect: DramaEffect;
  triggeredAt: number;         // unix ms
  matchNumber: number;         // after which match it triggers
}

export interface DramaEffect {
  moraleChange?: number;       // -10 to +10 applied to whole team
  formChange?: number;         // applied to specific player
  injuredMatches?: number;     // how many matches player misses
}

// ------------------------------------------------------------
// SEASON — STANDINGS
// ------------------------------------------------------------

export interface TeamStanding {
  team: IPLTeam;
  played: number;
  won: number;
  lost: number;
  points: number;
  nrr: number;                 // net run rate
  runsFor: number;
  runsAgainst: number;
  oversFor: number;
  oversAgainst: number;
}

// ------------------------------------------------------------
// SEASON — FIXTURES
// ------------------------------------------------------------

export interface Fixture {
  matchId: string;
  team1: IPLTeam;
  team2: IPLTeam;
  stage: "league" | PlayoffStage;
  matchNumber: number;
  status: "scheduled" | "in_progress" | "completed";
  result: MatchResult | null;
}

export interface Season {
  fixtures: Fixture[];
  standings: TeamStanding[];
  dramaEvents: DramaEvent[];
  completedMatches: string[];  // match ids
  currentMatchId: string | null;
  playoffTeams: IPLTeam[];     // top 2 or top 4
  champion: IPLTeam | null;
}

// ------------------------------------------------------------
// ROOM
// ------------------------------------------------------------

export interface RoomPlayer {
  uid: string;
  displayName: string;
  team: IPLTeam | null;        // null until team is selected
  isHost: boolean;
  isReady: boolean;            // ready to start auction
  joinedAt: number;            // unix ms
}

// ------------------------------------------------------------
// PREGAME (toss + playing XI selection)
// ------------------------------------------------------------

export type TossCall = "heads" | "tails";
export type TossDecision = "bat" | "bowl";

export interface PregameState {
  // Toss
  tossCallerTeam: IPLTeam | null;      // team that calls heads/tails
  tossCall: TossCall | null;           // what they called
  tossResult: TossCall | null;         // actual coin result
  tossWinner: IPLTeam | null;          // who won the toss
  tossDecision: TossDecision | null;   // bat or bowl
  tossComplete: boolean;

  // Playing XI — team → array of player ids (exactly 11)
  playing11: Partial<Record<IPLTeam, string[]>>;
  team1Ready: boolean;
  team2Ready: boolean;
}

export interface Room {
  roomId: string;              // e.g. "IPL-9324"
  hostUid: string;
  phase: RoomPhase;
  players: Record<string, RoomPlayer>; // uid → RoomPlayer
  squads: Record<IPLTeam, Squad>;
  auction: AuctionState | null;
  season: Season | null;
  currentMatch: Match | null;
  pregame: PregameState | null;
  createdAt: number;
  updatedAt: number;
  maxPlayers: number;          // 2–10 (matches number of IPL teams)
}

// ------------------------------------------------------------
// GROQ / AI
// ------------------------------------------------------------

export interface CommentaryRequest {
  ball: Ball;
  innings: Innings;
  match: Match;
  context: "ball" | "over_end" | "timeout" | "innings_break" | "match_end";
}

export interface CommentaryResponse {
  commentary: string;
  dramaTip?: string;           // optional strategy/drama tip shown during timeout
}

export interface DramaEventRequest {
  roomId: string;
  afterMatchNumber: number;
  teams: IPLTeam[];
  recentResults: MatchResult[];
}

// ------------------------------------------------------------
// API PAYLOADS
// ------------------------------------------------------------

export interface CreateRoomPayload {
  hostName: string;
}

export interface CreateRoomResponse {
  roomId: string;
  uid: string;
}

export interface JoinRoomPayload {
  roomId: string;
  playerName: string;
}

export interface JoinRoomResponse {
  success: boolean;
  uid: string;
  room: Room;
}

export interface PlaceBidPayload {
  roomId: string;
  uid: string;
  team: IPLTeam;
  amount: number;
  lotIndex: number;
}

export interface PlaceBidResponse {
  success: boolean;
  message?: string;
}

export interface SimulateBallPayload {
  roomId: string;
  matchId: string;
  captainDecision?: CaptainDecision;
}

export interface SimulateBallResponse {
  ball: Ball;
  updatedInnings: Innings;
  matchPhase: MatchPhase;
  commentary: string;
  dramaEvent?: DramaEvent;
}

// ------------------------------------------------------------
// UI STATE (client-side only, not stored in Firebase)
// ------------------------------------------------------------

export interface UIMatchState {
  isSimulating: boolean;
  lastBall: Ball | null;
  pendingCaptainDecision: boolean;
  decisionType: "bowler" | "batting_order" | null;
  timeoutActive: boolean;
  timeoutCommentary: string | null;
}

export interface UIAuctionState {
  myTeam: IPLTeam | null;
  timeLeft: number;            // seconds left to bid
  lastBidMessage: string | null;
}

// ------------------------------------------------------------
// CONSTANTS (typed)
// ------------------------------------------------------------

export const IPL_TEAMS: IPLTeam[] = [
  "MI", "CSK", "RCB", "KKR", "DC",
  "RR", "SRH", "PBKS", "LSG", "GT",
];

export const TEAM_FULL_NAMES: Record<IPLTeam, string> = {
  MI:   "Mumbai Indians",
  CSK:  "Chennai Super Kings",
  RCB:  "Royal Challengers Bangalore",
  KKR:  "Kolkata Knight Riders",
  DC:   "Delhi Capitals",
  RR:   "Rajasthan Royals",
  SRH:  "Sunrisers Hyderabad",
  PBKS: "Punjab Kings",
  LSG:  "Lucknow Super Giants",
  GT:   "Gujarat Titans",
};

export const TEAM_COLORS: Record<IPLTeam, string> = {
  MI:   "#004BA0",
  CSK:  "#F5A623",
  RCB:  "#D4001A",
  KKR:  "#3A225D",
  DC:   "#00008B",
  RR:   "#E91E8C",
  SRH:  "#F26522",
  PBKS: "#ED1B24",
  LSG:  "#A0C4FF",
  GT:   "#1C1C5E",
};

export const AUCTION_BUDGET = 150;
export const SQUAD_SIZE = 20;
export const OVERS_PER_INNINGS = 20;
export const STRATEGIC_TIMEOUT_OVER = 6;