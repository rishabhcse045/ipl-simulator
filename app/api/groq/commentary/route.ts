import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MODEL = "llama3-8b-8192";

// ── POST /api/groq/commentary ──────────────────────────────
// context types: "ball" | "over_end" | "timeout" | "innings_break" | "match_end" | "drama"

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { context } = body;

  if (!context) {
    return NextResponse.json({ error: "context required" }, { status: 400 });
  }

  try {
    const prompt = buildPrompt(body);

    const completion = await groq.chat.completions.create({
      model:       MODEL,
      max_tokens:  200,
      temperature: 0.85,
      messages: [
        {
          role: "system",
          content:
            "You are an energetic IPL cricket commentator. Be dramatic, enthusiastic, and use cricket slang naturally. Keep responses short — 1 to 3 sentences max. Never use asterisks or markdown. Write like you're live on air.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ commentary: text });

  } catch (error: any) {
    console.error("Groq error:", error?.message);
    // Fallback to template commentary if Groq fails
    return NextResponse.json({
      commentary: getFallbackCommentary(context, body),
    });
  }
}

// ── Build prompt by context ────────────────────────────────

function buildPrompt(body: any): string {
  const { context } = body;

  switch (context) {

    case "ball": {
      const { batsman, bowler, outcome, runs, overNumber, ballNumber, totalRuns, totalWickets } = body;
      if (outcome === "wicket") {
        return `IPL match. ${bowler} is bowling to ${batsman}. OUT! Wicket falls. Score: ${totalRuns}/${totalWickets}. Give dramatic live commentary for this dismissal.`;
      }
      if (outcome === "6") {
        return `IPL match. ${batsman} has just hit ${bowler} for a SIX! Over ${overNumber}, ball ${ballNumber}. Score: ${totalRuns}/${totalWickets}. Give exciting live commentary.`;
      }
      if (outcome === "4") {
        return `IPL match. ${batsman} drives ${bowler} to the boundary for FOUR! Over ${overNumber}.${ballNumber}. Score: ${totalRuns}/${totalWickets}. Describe the shot.`;
      }
      if (outcome === "dot") {
        return `IPL match. ${bowler} bowls a dot ball to ${batsman}. Tight bowling. Over ${overNumber}.${ballNumber}. Score: ${totalRuns}/${totalWickets}. Brief commentary.`;
      }
      return `IPL match. ${bowler} to ${batsman}. ${runs} run(s) scored. Over ${overNumber}.${ballNumber}. Score: ${totalRuns}/${totalWickets}. Live commentary.`;
    }

    case "over_end": {
      const { bowler, runsInOver, wicketsInOver, totalRuns, totalWickets, overNumber } = body;
      return `End of over ${overNumber} in an IPL match. ${bowler} bowled — ${runsInOver} runs, ${wicketsInOver} wicket(s). Total: ${totalRuns}/${totalWickets}. Give a brief over summary as a commentator.`;
    }

    case "timeout": {
      const { battingTeam, totalRuns, totalWickets, overNumber, target } = body;
      const chaseInfo = target ? ` They are chasing ${target}.` : "";
      return `Strategic Timeout in an IPL match after ${overNumber} overs. ${battingTeam} are ${totalRuns}/${totalWickets}.${chaseInfo} As a commentator, give a brief tactical analysis and predict what happens next.`;
    }

    case "innings_break": {
      const { battingTeam, totalRuns, totalWickets, target, overs } = body;
      return `Innings break in an IPL match. ${battingTeam} scored ${totalRuns}/${totalWickets} in ${overs} overs. Target for the second innings is ${target}. Give a dramatic innings summary and preview of the chase.`;
    }

    case "match_end": {
      const { winner, summary, playerOfMatch } = body;
      return `An IPL match just ended. ${winner} won. Result: ${summary}. Player of the match: ${playerOfMatch}. Give a dramatic post-match wrap up as a commentator. 2-3 sentences.`;
    }

    case "drama": {
      const { headline, description, team } = body;
      return `Breaking IPL news for team ${team}: "${headline}". ${description}. As a cricket journalist, give a brief reaction to this development. 1-2 sentences, dramatic tone.`;
    }

    default:
      return "Give a short excited IPL cricket commentary line.";
  }
}

// ── Fallback templates if Groq is unavailable ─────────────

function getFallbackCommentary(context: string, body: any): string {
  switch (context) {
    case "ball": {
      const { outcome, batsman, bowler } = body;
      if (outcome === "wicket") return `Massive wicket! ${batsman} is gone! ${bowler} is pumped up!`;
      if (outcome === "6")      return `${batsman} sends that into orbit! What a massive SIX!`;
      if (outcome === "4")      return `Cracking shot from ${batsman}! Racing to the boundary!`;
      if (outcome === "dot")    return `Good tight delivery from ${bowler}. Dot ball.`;
      return `${body.runs} run(s) off the bat.`;
    }
    case "timeout":
      return `Strategic timeout! The teams huddle together. Crucial decisions to be made in these two minutes.`;
    case "innings_break":
      return `What an innings! The target is set — the chase is on. Buckle up, cricket fans!`;
    case "match_end":
      return `What a match! ${body.winner} take the points. Brilliant performance from the entire squad.`;
    case "drama":
      return `Breaking news from the ${body.team} camp. This could shake up the season!`;
    default:
      return "What a game of cricket this is turning out to be!";
  }
}