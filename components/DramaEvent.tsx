"use client";

import { DramaEvent, TEAM_COLORS } from "@/types/game";
import { formatDramaEffect } from "@/lib/dramaEngine";

const DRAMA_ICONS: Record<string, string> = {
  injury:        "🤕",
  controversy:   "🔥",
  form_boost:    "⚡",
  morale_boost:  "🚀",
  morale_drop:   "💀",
  player_unhappy:"😤",
  umpire_drama:  "📋",
  weather_delay: "🌧️",
};

const DRAMA_COLORS: Record<string, string> = {
  injury:        "#ff5f57",
  controversy:   "#ff8c00",
  form_boost:    "#4caf50",
  morale_boost:  "#4caf50",
  morale_drop:   "#ff5f57",
  player_unhappy:"#ffc800",
  umpire_drama:  "#ff8c00",
  weather_delay: "#6b6860",
};

interface Props {
  events: DramaEvent[];
  onDismiss?: () => void;
}

export default function DramaEventCard({ events, onDismiss }: Props) {
  if (!events || events.length === 0) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.headerBadge}>📰 BREAKING NEWS</span>
          <span style={styles.headerSub}>Between Matches</span>
        </div>

        <div style={styles.eventList}>
          {events.map((event) => {
            const color    = DRAMA_COLORS[event.type] ?? "#6b6860";
            const teamColor = TEAM_COLORS[event.affectedTeam] ?? "#ffc800";
            const icon      = DRAMA_ICONS[event.type] ?? "📢";

            return (
              <div key={event.id} style={{ ...styles.eventItem, borderLeftColor: color }}>
                <div style={styles.eventTop}>
                  <span style={styles.eventIcon}>{icon}</span>
                  <span style={{ ...styles.eventTeam, color: teamColor }}>
                    {event.affectedTeam}
                  </span>
                  <span style={{ ...styles.eventTypeBadge, color, borderColor: color + "44", background: color + "11" }}>
                    {event.type.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>

                <h3 style={{ ...styles.eventHeadline, color }}>
                  {event.headline}
                </h3>

                <p style={styles.eventDesc}>{event.description}</p>

                <div style={styles.eventEffect}>
                  <span style={{ ...styles.effectText, color }}>
                    {formatDramaEffect(event.effect)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {onDismiss && (
          <button style={styles.dismissBtn} onClick={onDismiss}>
            Continue to Next Match →
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: "20px",
  },
  card: {
    background: "#13131a",
    border: "1px solid rgba(255,200,0,0.15)",
    borderRadius: "16px",
    padding: "28px",
    maxWidth: "520px",
    width: "100%",
    maxHeight: "80vh",
    overflowY: "auto",
    fontFamily: "'Georgia', serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  headerBadge: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#ffc800",
    letterSpacing: "0.06em",
  },
  headerSub: {
    fontSize: "11px",
    color: "#45443e",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  eventList: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    marginBottom: "20px",
  },
  eventItem: {
    borderLeft: "3px solid",
    paddingLeft: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  eventTop: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  eventIcon: { fontSize: "16px" },
  eventTeam: {
    fontSize: "12px",
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    letterSpacing: "0.06em",
  },
  eventTypeBadge: {
    fontSize: "9px",
    letterSpacing: "0.1em",
    padding: "2px 8px",
    borderRadius: "20px",
    border: "1px solid",
    marginLeft: "auto",
  },
  eventHeadline: {
    fontSize: "15px",
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.3,
  },
  eventDesc: {
    fontSize: "13px",
    color: "#a09d94",
    margin: 0,
    lineHeight: 1.5,
  },
  eventEffect: {
    marginTop: "4px",
  },
  effectText: {
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    fontFamily: "'Courier New', monospace",
  },
  dismissBtn: {
    width: "100%",
    padding: "13px",
    background: "#ffc800",
    color: "#0a0a0f",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 700,
    fontFamily: "'Georgia', serif",
    cursor: "pointer",
  },
};