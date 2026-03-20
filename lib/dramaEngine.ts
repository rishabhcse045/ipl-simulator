import {
  DramaEvent, DramaType, DramaEffect,
  IPLTeam, Player, MatchResult,
} from "@/types/game";

// ── Drama templates ───────────────────────────────────────

interface DramaTemplate {
  type: DramaType;
  headlines: string[];
  descriptions: string[];
  effect: DramaEffect;
}

const DRAMA_TEMPLATES: DramaTemplate[] = [
  // INJURIES
  {
    type: "injury",
    headlines: [
      "{player} picks up hamstring strain in training",
      "{player} ruled out after shoulder injury scare",
      "{player} limps off — fitness test required",
    ],
    descriptions: [
      "{player} suffered a hamstring strain during training. Expected to miss {matches} match(es).",
      "{player} has a shoulder injury that needs monitoring. Out for {matches} match(es).",
      "{player} picked up a niggle and will be assessed by the physio team.",
    ],
    effect: { injuredMatches: 1 },
  },
  {
    type: "injury",
    headlines: [
      "{player} out for 2 matches with back spasm",
      "Blow for {team} — {player} injured",
    ],
    descriptions: [
      "{player} has been ruled out with a back spasm. Will miss 2 matches.",
      "Major injury concern for {team} as {player} is sidelined.",
    ],
    effect: { injuredMatches: 2 },
  },

  // CONTROVERSY
  {
    type: "controversy",
    headlines: [
      "Umpire decision sparks heated debate in {team} camp",
      "{team} captain fined for dissent after DRS row",
      "Hot mic catches {team} player's outburst on field",
    ],
    descriptions: [
      "A contentious umpiring call has left the {team} camp fuming. Team morale takes a hit.",
      "The {team} captain was seen arguing with officials. Fined and team morale dips.",
      "A stump mic caught some colourful language from a {team} player, sparking controversy.",
    ],
    effect: { moraleChange: -3 },
  },

  // PLAYER UNHAPPY
  {
    type: "player_unhappy",
    headlines: [
      "{player} unhappy with batting position, demands change",
      "Reports: {player} wants trade out of {team}",
      "{player} skips optional training session — rift rumoured",
    ],
    descriptions: [
      "{player} is reportedly unhappy with the team's decision to bat him lower in the order.",
      "Sources close to {player} suggest he is unsettled at {team} and may seek a move.",
      "{player} was absent from a training session, fuelling rumours of a rift in the camp.",
    ],
    effect: { moraleChange: -2, formChange: -3 },
  },

  // FORM BOOST
  {
    type: "form_boost",
    headlines: [
      "{player} hits purple patch in nets — in devastating form",
      "{player} returns from injury stronger than ever",
      "{player} motivated by criticism — training like never before",
    ],
    descriptions: [
      "{player} has been in exceptional form during practice sessions. Expect a big performance.",
      "After a tough patch, {player} looks rejuvenated and full of confidence.",
      "{player} has been fired up by recent criticism and looks primed for a big game.",
    ],
    effect: { formChange: 5 },
  },

  // MORALE BOOST
  {
    type: "morale_boost",
    headlines: [
      "{team} team dinner builds incredible camaraderie",
      "{team} owner personally motivates the squad",
      "Winning streak lifts spirits in {team} dressing room",
    ],
    descriptions: [
      "The {team} players enjoyed a team bonding session. The dressing room vibe is electric.",
      "The {team} franchise owner gave a rousing speech to the squad. Morale is sky-high.",
      "The recent wins have galvanised the {team} camp. Everyone is buzzing.",
    ],
    effect: { moraleChange: 4 },
  },

  // MORALE DROP
  {
    type: "morale_drop",
    headlines: [
      "Infighting reported in {team} dressing room",
      "{team} squad unhappy with team management decisions",
      "Two {team} players involved in altercation at hotel",
    ],
    descriptions: [
      "Multiple sources report tensions within the {team} camp after recent poor results.",
      "Players within {team} are reportedly unhappy with the captain's tactics.",
      "An altercation between two {team} players at the team hotel has dented morale.",
    ],
    effect: { moraleChange: -4 },
  },

  // UMPIRE DRAMA
  {
    type: "umpire_drama",
    headlines: [
      "Third umpire under fire after series of poor decisions",
      "DRS system malfunctions during key match — chaos ensues",
      "Two wrong calls in one over shock cricket fans",
    ],
    descriptions: [
      "The on-field umpire missed a clear edge, denying {team} a crucial wicket.",
      "The DRS system gave a controversial result that overturned what looked like a clean catch.",
      "Two consecutive bad calls have the {team} camp frustrated and questioning officiating standards.",
    ],
    effect: { moraleChange: -1 },
  },

  // WEATHER DELAY
  {
    type: "weather_delay",
    headlines: [
      "Rain interrupts {team} practice session",
      "Wet outfield forces {team} to adjust training plans",
      "Damp conditions ahead of next fixture — {team} worries",
    ],
    descriptions: [
      "Unexpected rain forced {team} to cut their practice session short.",
      "A waterlogged outfield disrupted {team}'s preparation.",
      "Wet conditions in the forecast have created uncertainty about {team}'s next game.",
    ],
    effect: { moraleChange: -1 },
  },
];

// ── Helper: fill template placeholders ────────────────────

function fill(template: string, player: Player | null, team: IPLTeam, matches?: number): string {
  return template
    .replace(/{player}/g, player?.name ?? "A key player")
    .replace(/{team}/g,   team)
    .replace(/{matches}/g, String(matches ?? 1));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Main: generate drama events after a match ─────────────

export function generateDramaEvents(
  teams: IPLTeam[],
  allPlayers: Player[],
  afterMatchNumber: number,
  recentResults: MatchResult[]
): DramaEvent[] {
  const events: DramaEvent[] = [];

  // 0–3 events per match (weighted toward fewer)
  const count = pickWeightedCount();

  for (let i = 0; i < count; i++) {
    const team     = pickRandom(teams);
    const teamPlayers = allPlayers.filter((p) => p.soldTo === team && !p.injured);
    const player   = teamPlayers.length > 0 ? pickRandom(teamPlayers) : null;

    // Weight drama toward negative events if team lost recently
    const teamLost = recentResults.some((r) => r.loser === team);
    const template = pickTemplate(teamLost);

    const headline    = fill(pickRandom(template.headlines),    player, team, template.effect.injuredMatches);
    const description = fill(pickRandom(template.descriptions), player, team, template.effect.injuredMatches);

    const effect: DramaEffect = { ...template.effect };

    // Apply injury to player object reference (caller handles DB update)
    if (template.type === "injury" && player) {
      player.injured            = true;
      player.injuredForMatches  = effect.injuredMatches ?? 1;
    }

    if (template.type === "form_boost" && player) {
      player.currentForm = Math.min(10, player.currentForm + (effect.formChange ?? 0));
    }

    if (template.type === "player_unhappy" && player) {
      player.currentForm = Math.max(-10, player.currentForm + (effect.formChange ?? 0));
    }

    const event: DramaEvent = {
      id:              generateId(),
      type:            template.type,
      headline,
      description,
      affectedTeam:    team,
      affectedPlayer:  player?.id,
      effect,
      triggeredAt:     Date.now(),
      matchNumber:     afterMatchNumber,
    };

    events.push(event);
  }

  return events;
}

function pickWeightedCount(): number {
  const r = Math.random();
  if (r < 0.25) return 0; // 25% — no drama
  if (r < 0.60) return 1; // 35% — 1 event
  if (r < 0.85) return 2; // 25% — 2 events
  return 3;               // 15% — 3 events
}

function pickTemplate(teamLost: boolean): DramaTemplate {
  // Negative events more likely if team lost
  const negativeTypes: DramaType[] = [
    "injury", "controversy", "player_unhappy", "morale_drop", "umpire_drama",
  ];
  const positiveTypes: DramaType[] = ["form_boost", "morale_boost"];

  const useNegative = teamLost ? Math.random() < 0.75 : Math.random() < 0.5;

  const allowedTypes = useNegative ? negativeTypes : positiveTypes;
  const candidates   = DRAMA_TEMPLATES.filter((t) => allowedTypes.includes(t.type));
  return pickRandom(candidates);
}

// ── Format event for display ──────────────────────────────

export function formatDramaEffect(effect: DramaEffect): string {
  const parts: string[] = [];
  if (effect.moraleChange) {
    parts.push(
      `Team morale ${effect.moraleChange > 0 ? "+" : ""}${effect.moraleChange}`
    );
  }
  if (effect.formChange) {
    parts.push(
      `Player form ${effect.formChange > 0 ? "+" : ""}${effect.formChange}`
    );
  }
  if (effect.injuredMatches) {
    parts.push(`Out for ${effect.injuredMatches} match(es)`);
  }
  return parts.join(" · ");
}

// ── Reduce injuries each match ────────────────────────────

export function tickInjuries(players: Player[]): Player[] {
  return players.map((p) => {
    if (!p.injured) return p;
    const remaining = p.injuredForMatches - 1;
    return {
      ...p,
      injuredForMatches: remaining,
      injured: remaining > 0,
    };
  });
}