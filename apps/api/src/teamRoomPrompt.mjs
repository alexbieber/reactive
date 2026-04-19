/**
 * Conference-room: tagged roles; format matches parseAgentSegments ([Tag]\n or [Tag] text).
 * @param {{ continuation?: boolean, autonomousRound?: boolean, singleTurn?: boolean }} [opts]
 * - **singleTurn** — one `[Tag]` line per model call (ongoing conversation); bulk mode asks for many turns at once.
 */

const ROLE_LINES = `Every speaker turn MUST start with EXACTLY one of these tags (capitalization matters):

- \`[Discovery]\` — Maya Ortiz, Product Discovery Lead
- \`[Architect]\` — Jordan Park, Solution Architect
- \`[Craft]\` — Sam Rivera, Design & Content Lead
- \`[Build]\` — Alex Okonkwo, Lead Engineer · Template Delivery
- \`[Security]\` — Priya Nair, Security & Trust Lead
- \`[QA]\` — Riley Chen, QA & Reliability Lead
- \`[Docs]\` — Casey Brooks, Technical Writing Lead
- \`[Perf]\` — Morgan Lee, Performance Lead`;

/** First host/user line is the session topic for Team Space — used to anchor the model. */
export function extractTeamSpaceTopic(messages) {
  if (!Array.isArray(messages)) return "";
  const first = messages.find((m) => m && m.role === "user" && typeof m.content === "string");
  return first ? first.content.trim().slice(0, 4000) : "";
}

/**
 * One natural utterance per API call — teammates take turns like a real space.
 * @param {{ continuation?: boolean, autonomousRound?: boolean, spaceTopic?: string }} opts
 */
function buildTeamRoomSingleTurnSystem({ continuation, autonomousRound, spaceTopic = "" }) {
  const cont = continuation
    ? `The **message history** is the live transcript. Read the **last** lines — your job is **one** teammate’s **next** reply: react, disagree, joke, or hand off by first name. Do **not** restart the topic from scratch unless the host clearly changed it.`
    : `The **first user message** in the transcript is the **space topic** the host set. **One** teammate opens with a short, natural line that **hooks into that topic** — like real people around a table.`;

  const auto = autonomousRound
    ? `**Host is muted** — this round is **teammates only**. Do not address the host. Keep cross-talk going on the **same topic**; pick up from what was just said.`
    : `The **host** can speak anytime (their lines are **user** messages). When the last message is from the host, teammates should respond naturally to what they said — still **tied to the space topic** unless the host explicitly pivots.`;

  const topicBlock = spaceTopic
    ? [
        `## Space topic — stay continuously focused`,
        `The host’s topic for this session is below. **Every** reply must advance the conversation **on this topic**: tradeoffs, scope, risks, owners, timelines, or disagreements that matter **here** — not generic career advice, unrelated products, or meta filler ("as an AI team…"). If the last lines start to drift, **pull back** in a short clause (e.g. "Anyway—on our scope…", "Back to the launch risk…"). Only change subject if the **host’s latest user message** clearly does.`,
        ``,
        `**Topic:** ${spaceTopic}`,
        ``,
      ].join("\n")
    : [
        `## Space topic`,
        `The **first user message** in the transcript is the host’s topic. Keep discussion **continuously** relevant across turns — same subject matter, deeper each time.`,
        ``,
      ].join("\n");

  return [
    `You are writing **one spoken line** in a **live audio room** (like X/Twitter Spaces): coworkers talking, not a report.`,
    ``,
    topicBlock,
    `**Single turn only:** Output **exactly ONE** bracket-tagged speaker block in this response — either \`[Tag]\\n\\n...\` or \`[Tag] same-line dialogue\`. **1–4 sentences**, conversational, overlapping style ("Yeah—", "Wait,", "Sam's right but…"). **Forbidden:** a second \`[Tag]\`, JSON, \`\`\` fences, \`#\` headings, or narrator voice ("the team discussed…").`,
    ``,
    cont,
    auto,
    ``,
    `## Tags (pick exactly one for this reply)`,
    ROLE_LINES,
  ].join("\n");
}

export function buildTeamRoomSystem(opts = {}) {
  const { continuation = false, autonomousRound = false, singleTurn = false, spaceTopic = "" } = opts;

  if (singleTurn) {
    return buildTeamRoomSingleTurnSystem({ continuation, autonomousRound, spaceTopic });
  }

  const roleBlock = `## Bracket tags (required — each speaker turn)

${ROLE_LINES}

Put **either** \`[Tag]\\n\\nMaya: ...\` **or** \`[Tag] Jordan, hold up — ...\` on the same line after the tag. Do **not** write one long essay without tags. **Do not** narrate (“the team discussed…”) — **perform** the lines.`;

  const topicAnchor = spaceTopic
    ? `

## Session topic (do not drift)

The host set this topic for the **entire** session — keep **every** tagged turn **directly** about it (decisions, risks, owners, tradeoffs). Do not wander into unrelated domains or generic advice.

**Topic:** ${spaceTopic}`
    : "";

  const scenario = `You are writing a **live transcript** of coworkers in a **conference room**.  

**Chair / facilitator:** The latest **user** message is only the **chair** reading the topic or a follow-up question from outside the room — **not** a character in the scene. The **eight employees** must respond to *each other* by **first name**, react, disagree, crack a small joke, and hand the mic — like a real stand-up.

**First characters of your output:** Start with a bracket tag on its own line — e.g. \`[Discovery]\` then a newline — not a title, not “Here is”, not \`#\` markdown.${topicAnchor}`;

  const density = `**Volume:** At least **6** separate \`[Tag]\` turns in your reply, from **at least 4** different tags (more is better). Keep turns short (1–4 sentences). Use **cross-talk** (“Sam, back to what Jordan said…”).

**Format:** Every turn = one line \`[Architect]\` (or other tag) + newline + that person’s dialogue. Repeat for each speaker.`;

  const forbid = `**Forbidden:** JSON, \`\`\` fences, App Spec, “As an AI”, \`# headings\`, narrating the room (“the team discussed…”) instead of scripted lines, or one paragraph with no \`[Tag]\` lines.`;

  const example = `## Example shape (structure only — invent fresh lines for the real topic)

[Discovery]
Maya: Jordan, you wanted onboarding before polish, right?

[Architect]
Jordan: Yeah—tabs-first. Sam, you good with that for v1?

[Craft]
Sam: Fine by me if Alex isn’t painting us into a JSON corner.

[Build]
Alex: I’m not—Priya, you okay with guest read-only?

[Security]
Priya: Guest-only is fine if we don’t pretend it’s MFA.`;

  const cont =
    continuation &&
    `## This is a **continuation**

Earlier **assistant** messages contain the meeting so far. Add **only new** \`[Tag]\` turns (minimum **6** new turns). **Continue** the thread — reference what was said, don’t restart from zero. The **latest user** line is the chair’s new prompt — answer it in-character as the team.`;

  const autonomous =
    autonomousRound &&
    `## Host muted — Space round

The **latest user** line is **not** a new topic from the chair; it only means **the host is listening** while **you eight keep talking**. Do **not** thank the host or wait for them. Only the tagged teammates speak — more cross-talk, disagreements, and hand-offs. Minimum **6** new \`[Tag]\` turns.`;

  return [
    scenario,
    roleBlock,
    density,
    forbid,
    example,
    cont,
    autonomous,
  ]
    .filter(Boolean)
    .join("\n\n");
}
