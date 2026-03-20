import {
  Ball, BallOutcome, WicketType, Player,
  Innings, Over, BatsmanStats, BowlerStats,
  FallOfWicket, Match, IPLTeam,
} from "@/types/game";

// ── Outcome weights ───────────────────────────────────────

function getOutcomeWeights(
  batsman: Player,
  bowler: Player,
  overNumber: number
): Record<BallOutcome, number> {
  const bat  = Math.min(100, Math.max(0, (batsman.battingRating  + batsman.currentForm * 2))) / 100;
  const bowl = Math.min(100, Math.max(0, (bowler.bowlingRating   - bowler.currentForm  * 2))) / 100;

  const isPowerplay = overNumber <= 5;
  const isDeath     = overNumber >= 15;

  const base = {
    dot:    35 - bat * 15 + bowl * 20,
    "1":    25,
    "2":    8,
    "3":    3,
    "4":    isPowerplay ? 12 + bat * 8 : 8  + bat * 5,
    "6":    isDeath     ? 8  + bat * 8 : 4  + bat * 4,
    wicket: 6  + bowl * 12 - bat * 6,
    wide:   3  - bowl * 2,
    noball: 1,
  };

  return Object.fromEntries(
    Object.entries(base).map(([k, v]) => [k, Math.max(0.5, v)])
  ) as Record<BallOutcome, number>;
}

function pickWeighted(weights: Record<string, number>): string {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let rand    = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    rand -= w;
    if (rand <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function pickWicketType(bowler: Player): WicketType {
  const types: WicketType[] = ["caught", "bowled", "lbw", "runout", "stumped"];
  const weights = [40, 25, 15, 12, 8];
  let rand = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < types.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return types[i];
  }
  return "caught";
}

// ── Commentary ────────────────────────────────────────────

function buildCommentary(ball: Ball, batsman: Player, bowler: Player): string {
  const over = `${ball.overNumber}.${ball.ballNumber}`;

  if (ball.outcome === "wicket") {
    const templates = [
      `${over} ${bowler.name} to ${batsman.name} — OUT! ${ball.wicketType?.toUpperCase()}! What a delivery!`,
      `${over} ${bowler.name} to ${batsman.name} — GONE! ${batsman.name} is dismissed, ${ball.wicketType}!`,
      `${over} Massive wicket! ${bowler.name} gets ${batsman.name} — ${ball.wicketType}!`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  if (ball.outcome === "6") {
    const templates = [
      `${over} ${bowler.name} to ${batsman.name} — SIX! Absolutely massive hit!`,
      `${over} ${batsman.name} launches ${bowler.name} into the stands! SIX!`,
      `${over} That's gone all the way! SIX from ${batsman.name}!`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  if (ball.outcome === "4") {
    const templates = [
      `${over} ${bowler.name} to ${batsman.name} — FOUR! Cracking shot through covers!`,
      `${over} ${batsman.name} drives ${bowler.name} — FOUR to the boundary!`,
      `${over} Elegant stroke from ${batsman.name}, races away for FOUR!`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  if (ball.outcome === "dot") {
    const templates = [
      `${over} ${bowler.name} to ${batsman.name} — dot ball, good tight line.`,
      `${over} Defended solidly by ${batsman.name}. No run.`,
      `${over} Beats the bat! ${bowler.name} is on fire.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  if (ball.outcome === "wide")   return `${over} Wide! ${bowler.name} strays down leg. Extra run added.`;
  if (ball.outcome === "noball") return `${over} No ball! Free hit coming up. ${bowler.name} overstepped.`;
  return `${over} ${bowler.name} to ${batsman.name} — ${ball.runs} run${ball.runs > 1 ? "s" : ""}.`;
}

// ── Init innings ──────────────────────────────────────────

export function initInnings(
  battingTeam: IPLTeam,
  bowlingTeam: IPLTeam,
  battingOrder: Player[]
): Innings {
  const safeOrder = battingOrder ?? [];
  const batsmanStats: BatsmanStats[] = safeOrder.map((p, i) => ({
    player:          p,
    runs:            0,
    ballsFaced:      0,
    fours:           0,
    sixes:           0,
    strikeRate:      0,
    dismissed:       false,
    battingPosition: i + 1,
  }));

  return {
    battingTeam,
    bowlingTeam,
    totalRuns:      0,
    totalWickets:   0,
    totalOvers:     0,
    overs:          [],
    battingOrder:   safeOrder,
    batsmanStats,
    bowlerStats:    [],
    currentBatsmen: [safeOrder[0]?.id ?? "", safeOrder[1]?.id ?? ""],
    currentBowler:  null,
    extras:         0,
    fallOfWickets:  [],
  };
}

// ── Simulate ball ─────────────────────────────────────────

export function simulateBall(
  innings: Innings,
  bowler: Player,
  match: Match
): { ball: Ball; updatedInnings: Innings } {
  // Safe arrays
  const safeOvers       = innings.overs        ?? [];
  const safeBatsmen     = innings.currentBatsmen ?? ["", ""];

  const currentOver  = safeOvers.length;
  const lastOverBalls = safeOvers[currentOver - 1]?.balls?.length ?? 0;
  const ballInOver   = lastOverBalls + 1;

  const strikerId = safeBatsmen[0];
  const batsman   = (innings.battingOrder ?? []).find((p) => p.id === strikerId)
    ?? (innings.battingOrder ?? [])[0];

  if (!batsman) {
    throw new Error("No batsman found for striker id: " + strikerId);
  }

  const weights = getOutcomeWeights(batsman, bowler, currentOver);
  const outcome = pickWeighted(weights) as BallOutcome;

  const runsMap: Record<BallOutcome, number> = {
    dot: 0, "1": 1, "2": 2, "3": 3, "4": 4, "6": 6,
    wicket: 0, wide: 1, noball: 1,
  };
  const runs = runsMap[outcome];

  let wicketType: WicketType | undefined;
  let dismissedBatsman: Player | undefined;
  if (outcome === "wicket") {
    wicketType       = pickWicketType(bowler);
    dismissedBatsman = batsman;
  }

  const ball: Ball = {
  overNumber:   currentOver,
  ballNumber:   ballInOver,
  bowler,
  batsman,
  outcome,
  runs,
  commentary:   "",
  isExtra:      outcome === "wide" || outcome === "noball",
  // Only include these if they have values — Firebase rejects undefined
  ...(wicketType        ? { wicketType }        : {}),
  ...(dismissedBatsman  ? { dismissedBatsman }  : {}),
};

  ball.commentary = buildCommentary(ball, batsman, bowler);

  const updated = updateInningsState(innings, ball, bowler);
  return { ball, updatedInnings: updated };
}

function updateInningsState(innings: Innings, ball: Ball, bowler: Player): Innings {
  // Deep clone safely
  const inn: Innings = {
    ...innings,
    overs:          JSON.parse(JSON.stringify(innings.overs          ?? [])),
    batsmanStats:   JSON.parse(JSON.stringify(innings.batsmanStats   ?? [])),
    bowlerStats:    JSON.parse(JSON.stringify(innings.bowlerStats    ?? [])),
    currentBatsmen: [...(innings.currentBatsmen ?? ["", ""])],
    fallOfWickets:  JSON.parse(JSON.stringify(innings.fallOfWickets  ?? [])),
  };

  inn.totalRuns += ball.runs;
  if (ball.isExtra) inn.extras = (inn.extras ?? 0) + ball.runs;

  // Batsman stats
  const bIdx = inn.batsmanStats.findIndex((b) => b.player.id === ball.batsman.id);
  if (bIdx !== -1) {
    const bs = inn.batsmanStats[bIdx];
    if (!ball.isExtra) bs.ballsFaced++;
    bs.runs += ball.runs;
    if (ball.outcome === "4") bs.fours++;
    if (ball.outcome === "6") bs.sixes++;
    bs.strikeRate = bs.ballsFaced > 0
      ? parseFloat(((bs.runs / bs.ballsFaced) * 100).toFixed(1))
      : 0;

    if (ball.outcome === "wicket") {
      bs.dismissed  = true;
      bs.wicketType = ball.wicketType;
      bs.dismissedBy = bowler;
      inn.totalWickets++;

      inn.fallOfWickets.push({
        wicketNumber: inn.totalWickets,
        runs:         inn.totalRuns,
        overs:        inn.totalOvers,
        batsman:      ball.batsman.id,
      });

      // Next batsman
      const nextBatsman = inn.batsmanStats.find(
        (b) => !b.dismissed && b.player.id !== inn.currentBatsmen[1]
      );
      if (nextBatsman) {
        inn.currentBatsmen[0] = nextBatsman.player.id;
      }
    }
  }

  // Bowler stats
  let bwIdx = inn.bowlerStats.findIndex((b) => b.player.id === bowler.id);
  if (bwIdx === -1) {
    inn.bowlerStats.push({
      player: bowler, overs: 0, maidens: 0,
      runs: 0, wickets: 0, economy: 0, noBalls: 0, wides: 0,
    });
    bwIdx = inn.bowlerStats.length - 1;
  }
  const bw = inn.bowlerStats[bwIdx];
  bw.runs += ball.runs;
  if (ball.outcome === "wide")   bw.wides++;
  if (ball.outcome === "noball") bw.noBalls++;
  if (ball.outcome === "wicket") bw.wickets++;

  // Overs management
  if (!ball.isExtra) {
    if (inn.overs.length === 0 || inn.overs[inn.overs.length - 1].balls.length >= 6) {
      inn.overs.push({
        overNumber:    inn.overs.length,
        bowler,
        balls:         [ball],
        runsInOver:    ball.runs,
        wicketsInOver: ball.outcome === "wicket" ? 1 : 0,
      });
    } else {
      const lastOver = inn.overs[inn.overs.length - 1];
      lastOver.balls.push(ball);
      lastOver.runsInOver    += ball.runs;
      lastOver.wicketsInOver += ball.outcome === "wicket" ? 1 : 0;
    }

    // Over complete
    const lastOver = inn.overs[inn.overs.length - 1];
    if (lastOver.balls.length === 6) {
      bw.overs++;
      bw.economy    = parseFloat((bw.runs / bw.overs).toFixed(2));
      inn.totalOvers = inn.overs.length;
      // Swap on over completion
      [inn.currentBatsmen[0], inn.currentBatsmen[1]] =
        [inn.currentBatsmen[1], inn.currentBatsmen[0]];
    }

    // Swap on odd runs
    if (ball.runs === 1 || ball.runs === 3) {
      [inn.currentBatsmen[0], inn.currentBatsmen[1]] =
        [inn.currentBatsmen[1], inn.currentBatsmen[0]];
    }
  }

  return inn;
}

// ── Innings over check ────────────────────────────────────

export function isInningsOver(innings: Innings, target?: number): boolean {
  if ((innings.totalWickets ?? 0) >= 10) return true;
  if ((innings.totalOvers   ?? 0) >= 20) return true;
  if (target !== undefined && (innings.totalRuns ?? 0) >= target) return true;
  return false;
}

// ── Match result ──────────────────────────────────────────

export function getMatchResult(match: Match) {
  const inn1 = match.innings1!;
  const inn2 = match.innings2!;

  if (inn2.totalRuns > inn1.totalRuns) {
    const wicketsLeft = 10 - inn2.totalWickets;
    return {
      winner:     inn2.battingTeam,
      loser:      inn1.battingTeam,
      margin:     wicketsLeft,
      marginType: "wickets" as const,
      summary:    `${inn2.battingTeam} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? "s" : ""}`,
    };
  } else {
    const runMargin = inn1.totalRuns - inn2.totalRuns;
    return {
      winner:     inn1.battingTeam,
      loser:      inn2.battingTeam,
      margin:     runMargin,
      marginType: "runs" as const,
      summary:    `${inn1.battingTeam} won by ${runMargin} run${runMargin !== 1 ? "s" : ""}`,
    };
  }
}

// ── Default batting order ─────────────────────────────────

export function getDefaultBattingOrder(players: Player[]): Player[] {
  const safe        = players ?? [];
  const batsmen     = safe.filter((p) => p.role === "batsman" || p.role === "wicketkeeper");
  const allrounders = safe.filter((p) => p.role === "allrounder");
  const bowlers     = safe.filter((p) => p.role === "bowler");

  return [
    ...batsmen.sort((a, b)     => b.battingRating - a.battingRating),
    ...allrounders.sort((a, b) => b.battingRating - a.battingRating),
    ...bowlers.sort((a, b)     => b.battingRating - a.battingRating),
  ].slice(0, 11);
}

// ── Next bowler ───────────────────────────────────────────

export function getNextBowler(
  players: Player[],
  bowlerStats: BowlerStats[],
  lastBowlerId: string | null
): Player {
  const safePlayers    = players    ?? [];
  const safeBowlerStats = bowlerStats ?? [];

  const eligible = safePlayers.filter((p) => {
    if (p.role === "batsman" || p.role === "wicketkeeper") return false;
    if (p.id === lastBowlerId) return false;
    const stats = safeBowlerStats.find((b) => b.player.id === p.id);
    return !stats || stats.overs < 4;
  });

  if (eligible.length === 0) {
    return safePlayers.find((p) => p.role !== "batsman") ?? safePlayers[0];
  }

  return eligible.sort((a, b) => b.bowlingRating - a.bowlingRating)[0];
}