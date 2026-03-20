import {
  Season, Fixture, TeamStanding, MatchResult,
  IPLTeam, Room, DramaEvent,
} from "@/types/game";
import { generateDramaEvents } from "@/lib/dramaEngine";

// ── Generate round-robin fixtures ─────────────────────────

export function generateFixtures(teams: IPLTeam[]): Fixture[] {
  const fixtures: Fixture[] = [];
  let matchNumber = 1;

  // Every team plays every other team once
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      fixtures.push({
        matchId:     `match-${matchNumber}`,
        team1:       teams[i],
        team2:       teams[j],
        stage:       "league",
        matchNumber,
        status:      "scheduled",
        result:      null,
      });
      matchNumber++;
    }
  }

  // Shuffle for variety
  return shuffleFixtures(fixtures);
}

function shuffleFixtures(fixtures: Fixture[]): Fixture[] {
  const arr = [...fixtures];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  // Re-number after shuffle
  return arr.map((f, i) => ({ ...f, matchNumber: i + 1, matchId: `match-${i + 1}` }));
}

// ── Initialize season ──────────────────────────────────────

export function initSeason(teams: IPLTeam[]): Season {
  const fixtures  = generateFixtures(teams);
  const standings = initStandings(teams);

  return {
    fixtures,
    standings,
    dramaEvents:      [],
    completedMatches: [],
    currentMatchId:   fixtures[0]?.matchId ?? null,
    playoffTeams:     [],
    champion:         null,
  };
}

// ── Initialize standings ───────────────────────────────────

function initStandings(teams: IPLTeam[]): TeamStanding[] {
  return teams.map((team) => ({
    team,
    played:        0,
    won:           0,
    lost:          0,
    points:        0,
    nrr:           0,
    runsFor:       0,
    runsAgainst:   0,
    oversFor:      0,
    oversAgainst:  0,
  }));
}

// ── Update standings after a match ────────────────────────

export function updateStandings(
  standings: TeamStanding[],
  result: MatchResult,
  inn1Runs: number, inn1Overs: number,
  inn2Runs: number, inn2Overs: number,
  battingFirst: IPLTeam,
  battingSecond: IPLTeam,
): TeamStanding[] {
  const updated = standings.map((s) => ({ ...s }));

  const t1Idx = updated.findIndex((s) => s.team === battingFirst);
  const t2Idx = updated.findIndex((s) => s.team === battingSecond);

  if (t1Idx === -1 || t2Idx === -1) return standings;

  // Team 1 (batting first)
  updated[t1Idx].played++;
  updated[t1Idx].runsFor      += inn1Runs;
  updated[t1Idx].runsAgainst  += inn2Runs;
  updated[t1Idx].oversFor     += inn1Overs || 20;
  updated[t1Idx].oversAgainst += inn2Overs || 20;

  // Team 2 (batting second)
  updated[t2Idx].played++;
  updated[t2Idx].runsFor      += inn2Runs;
  updated[t2Idx].runsAgainst  += inn1Runs;
  updated[t2Idx].oversFor     += inn2Overs || 20;
  updated[t2Idx].oversAgainst += inn1Overs || 20;

  // Points
  if (result.winner === battingFirst) {
    updated[t1Idx].won++;
    updated[t1Idx].points += 2;
    updated[t2Idx].lost++;
  } else {
    updated[t2Idx].won++;
    updated[t2Idx].points += 2;
    updated[t1Idx].lost++;
  }

  // Recalculate NRR for both
  [t1Idx, t2Idx].forEach((idx) => {
    const s = updated[idx];
    const rr1 = s.oversFor     > 0 ? s.runsFor     / s.oversFor     : 0;
    const rr2 = s.oversAgainst > 0 ? s.runsAgainst / s.oversAgainst : 0;
    s.nrr = parseFloat((rr1 - rr2).toFixed(3));
  });

  return sortStandings(updated);
}

// ── Sort standings: points desc, then NRR desc ─────────────

export function sortStandings(standings: TeamStanding[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.nrr - a.nrr;
  });
}

// ── Advance fixture after match completes ─────────────────

export function advanceFixture(
  season: Season,
  matchId: string,
  result: MatchResult,
): Season {
  const updated = { ...season };

  // Mark fixture complete
  // Firebase drops empty arrays — guard with ?? [] to prevent "not iterable" errors
  updated.fixtures = (season.fixtures ?? []).map((f) =>
    f.matchId === matchId
      ? { ...f, status: "completed", result }
      : f
  );

  updated.completedMatches = [...(season.completedMatches ?? []), matchId];

  // Find next scheduled fixture
  const next = updated.fixtures.find((f) => f.status === "scheduled");
  updated.currentMatchId = next?.matchId ?? null;

  return updated;
}

// ── Check if league phase is complete ─────────────────────

export function isLeagueComplete(season: Season): boolean {
  return (season.fixtures ?? [])
    .filter((f) => f.stage === "league")
    .every((f) => f.status === "completed");
}

// ── Generate playoff fixtures ──────────────────────────────

export function generatePlayoffs(season: Season, teams: IPLTeam[]): Season {
  const sorted   = sortStandings(season.standings);
  const numTeams = teams.length;

  let playoffFixtures: Fixture[] = [];
  let playoffTeams:    IPLTeam[] = [];
  const baseMatchNum = season.fixtures.length + 1;

  if (numTeams === 2) {
    // Best of 1 — already done in league
    playoffTeams = [sorted[0].team];
  } else if (numTeams === 3) {
    // Top 2 go to final
    playoffTeams = [sorted[0].team, sorted[1].team];
    playoffFixtures.push({
      matchId:     `playoff-final`,
      team1:       sorted[0].team,
      team2:       sorted[1].team,
      stage:       "final",
      matchNumber: baseMatchNum,
      status:      "scheduled",
      result:      null,
    });
  } else {
    // Top 4 → 2 semis → final
    playoffTeams = sorted.slice(0, 4).map((s) => s.team);
    playoffFixtures = [
      {
        matchId:     "playoff-semi1",
        team1:       sorted[0].team,
        team2:       sorted[3].team,
        stage:       "semi1",
        matchNumber: baseMatchNum,
        status:      "scheduled",
        result:      null,
      },
      {
        matchId:     "playoff-semi2",
        team1:       sorted[1].team,
        team2:       sorted[2].team,
        stage:       "semi2",
        matchNumber: baseMatchNum + 1,
        status:      "scheduled",
        result:      null,
      },
      {
        matchId:     "playoff-final",
        team1:       "TBD" as IPLTeam,
        team2:       "TBD" as IPLTeam,
        stage:       "final",
        matchNumber: baseMatchNum + 2,
        status:      "scheduled",
        result:      null,
      },
    ];
  }

  return {
    ...season,
    fixtures:    [...(season.fixtures ?? []), ...playoffFixtures],
    playoffTeams,
    currentMatchId: playoffFixtures[0]?.matchId ?? null,
  };
}

// ── After semi results, update final fixture ───────────────

export function updateFinalTeams(
  season: Season,
  semi1Winner: IPLTeam,
  semi2Winner: IPLTeam,
): Season {
  const updated = {
    ...season,
    fixtures: (season.fixtures ?? []).map((f) =>
      f.stage === "final"
        ? { ...f, team1: semi1Winner, team2: semi2Winner }
        : f
    ),
  };
  return updated;
}

// ── Generate drama events after a match ───────────────────

export function generateMatchDrama(
  room: Room,
  afterMatchNumber: number,
  recentResults: MatchResult[],
): DramaEvent[] {
  const teams   = Object.values(room.players)
    .map((p) => p.team)
    .filter(Boolean) as IPLTeam[];

  const allPlayers = teams.flatMap(
    (t) => room.squads[t]?.players ?? []
  );

  return generateDramaEvents(teams, allPlayers, afterMatchNumber, recentResults);
}

// ── Get next fixture to play ───────────────────────────────

export function getNextFixture(season: Season): Fixture | null {
  return (season.fixtures ?? []).find((f) => f.status === "scheduled") ?? null;
}

// ── Format NRR for display ─────────────────────────────────

export function formatNRR(nrr: number): string {
  return (nrr >= 0 ? "+" : "") + nrr.toFixed(3);
}

// ── Get team's remaining fixtures ─────────────────────────

export function getTeamFixtures(season: Season, team: IPLTeam): Fixture[] {
  return (season.fixtures ?? []).filter(
    (f) => f.team1 === team || f.team2 === team
  );
}