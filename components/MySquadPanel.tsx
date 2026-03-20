"use client";

import { Player, IPLTeam, TEAM_COLORS } from "@/types/game";

interface Props {
  players: Player[];
  team: IPLTeam;
  budget: number;
  maxPlayers?: number;
}

const ROLE_COLORS: Record<string, string> = {
  batsman:       "#4caf50",
  bowler:        "#ff5f57",
  allrounder:    "#ffc800",
  wicketkeeper:  "#64b5f6",
};

const ROLE_SHORT: Record<string, string> = {
  batsman:      "BAT",
  bowler:       "BOWL",
  allrounder:   "AR",
  wicketkeeper: "WK",
};

export default function MySquadPanel({ players, team, budget, maxPlayers = 20 }: Props) {
  const teamColor = TEAM_COLORS[team];

  // Group by role
  const batsmen      = players.filter((p) => p.role === "batsman");
  const wks          = players.filter((p) => p.role === "wicketkeeper");
  const allrounders  = players.filter((p) => p.role === "allrounder");
  const bowlers      = players.filter((p) => p.role === "bowler");

  const groups = [
    { label: "Batsmen",       list: batsmen,     color: ROLE_COLORS.batsman },
    { label: "Wicketkeepers", list: wks,          color: ROLE_COLORS.wicketkeeper },
    { label: "All-rounders",  list: allrounders,  color: ROLE_COLORS.allrounder },
    { label: "Bowlers",       list: bowlers,      color: ROLE_COLORS.bowler },
  ].filter((g) => g.list.length > 0);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={{ ...styles.header, borderBottomColor: teamColor + "33" }}>
        <span style={{ ...styles.teamBadge, color: teamColor, borderColor: teamColor + "44", background: teamColor + "11" }}>
          {team}
        </span>
        <span style={styles.squadCount}>
          {players.length}/{maxPlayers} players
        </span>
      </div>

      {/* Budget bar */}
      <div style={styles.budgetRow}>
        <span style={styles.budgetLabel}>Budget left</span>
        <span style={{ ...styles.budgetAmount, color: budget < 5 ? "#ff5f57" : budget < 20 ? "#ffc800" : teamColor }}>
          {budget} cr
        </span>
      </div>
      <div style={styles.budgetBarTrack}>
        <div style={{
          ...styles.budgetBarFill,
          width: `${(budget / 150) * 100}%`,
          background: budget < 5 ? "#ff5f57" : budget < 20 ? "#ffc800" : teamColor,
        }} />
      </div>

      {/* Empty state */}
      {players.length === 0 && (
        <p style={styles.emptyText}>No players yet — start bidding!</p>
      )}

      {/* Player groups */}
      {groups.map((group) => (
        <div key={group.label} style={styles.group}>
          <div style={styles.groupHeader}>
            <span style={{ ...styles.groupDot, background: group.color }} />
            <span style={styles.groupLabel}>{group.label}</span>
            <span style={styles.groupCount}>{group.list.length}</span>
          </div>
          {group.list.map((p) => (
            <div key={p.id} style={styles.playerRow}>
              <div style={styles.playerLeft}>
                <span style={{
                  ...styles.roleTag,
                  color: group.color,
                  borderColor: group.color + "44",
                  background: group.color + "11",
                }}>
                  {ROLE_SHORT[p.role]}
                </span>
                <span style={styles.playerName}>{p.name}</span>
              </div>
              <div style={styles.playerRight}>
                <span style={styles.playerPrice}>{p.soldPrice}cr</span>
                <span style={styles.playerNat}>{p.nationality.slice(0, 3).toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Total spent */}
      {players.length > 0 && (
        <div style={styles.totalRow}>
          <span style={styles.totalLabel}>Total spent</span>
          <span style={styles.totalAmount}>
            {players.reduce((sum, p) => sum + (p.soldPrice ?? 0), 0).toFixed(1)} cr
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    background: "#13131a",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxHeight: "70vh",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "10px",
    borderBottom: "1px solid",
  },
  teamBadge: {
    fontSize: "14px",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "20px",
    border: "1px solid",
    letterSpacing: "0.06em",
  },
  squadCount: {
    fontSize: "12px",
    color: "#6b6860",
  },
  budgetRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  budgetLabel: {
    fontSize: "11px",
    color: "#45443e",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  },
  budgetAmount: {
    fontSize: "18px",
    fontWeight: 700,
    fontFamily: "'Courier New', monospace",
  },
  budgetBarTrack: {
    height: "4px",
    background: "rgba(255,255,255,0.06)",
    borderRadius: "2px",
    overflow: "hidden",
    marginTop: "-4px",
  },
  budgetBarFill: {
    height: "100%",
    borderRadius: "2px",
    transition: "width 0.4s ease, background 0.3s",
  },
  emptyText: {
    fontSize: "12px",
    color: "#45443e",
    textAlign: "center" as const,
    padding: "16px 0",
    margin: 0,
  },
  group: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "2px",
  },
  groupDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  groupLabel: {
    fontSize: "10px",
    color: "#45443e",
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    flex: 1,
  },
  groupCount: {
    fontSize: "10px",
    color: "#6b6860",
  },
  playerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "5px 8px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "6px",
    gap: "8px",
  },
  playerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flex: 1,
    minWidth: 0,
  },
  roleTag: {
    fontSize: "9px",
    fontWeight: 700,
    letterSpacing: "0.06em",
    padding: "1px 5px",
    borderRadius: "4px",
    border: "1px solid",
    flexShrink: 0,
  },
  playerName: {
    fontSize: "12px",
    color: "#f0ece0",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  playerRight: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexShrink: 0,
  },
  playerPrice: {
    fontSize: "11px",
    color: "#ffc800",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
  },
  playerNat: {
    fontSize: "9px",
    color: "#45443e",
    letterSpacing: "0.06em",
  },
  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: "8px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    marginTop: "4px",
  },
  totalLabel: {
    fontSize: "11px",
    color: "#45443e",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
  },
  totalAmount: {
    fontSize: "14px",
    fontWeight: 700,
    color: "#f0ece0",
    fontFamily: "'Courier New', monospace",
  },
};