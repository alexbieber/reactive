import { useState } from "react";
import type { StudioAgent } from "./studioAgents";
import { getAgentPortraitUrl } from "./studioAgents";

type Props = {
  agent: StudioAgent;
  variant: "team-stage" | "studio-menu";
};

export default function AgentPortrait({ agent, variant }: Props) {
  const [failed, setFailed] = useState(false);
  const size = variant === "team-stage" ? 128 : 72;
  const url = getAgentPortraitUrl(agent, size);
  const initial = agent.fullName[0];

  if (variant === "studio-menu") {
    return (
      <div className="studio-mv2-menu-team-face">
        {!failed ? (
          <img
            className="studio-mv2-menu-team-photo"
            src={url}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className={`studio-mv2-menu-team-initial studio-mv2-menu-team-initial--${agent.id.toLowerCase()}`} aria-hidden>
            {initial}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="team-space__avatar-face" title={agent.personality}>
      {!failed ? (
        <img
          className="team-space__avatar-photo"
          src={url}
          alt=""
          width={38}
          height={38}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="team-space__avatar-initial" aria-hidden>
          {initial}
        </span>
      )}
    </div>
  );
}
