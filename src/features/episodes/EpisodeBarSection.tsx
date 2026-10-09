import type { EpisodeSide } from "@/api/episodes";
import type { EpisodeHistory } from "@/features/episodes/episodeHistory";
import {
  allEpisodes,
  episodeAt,
  falseBreakAt,
  waveAt,
  zoneAt,
} from "@/features/episodes/episodeLookup";

const PHASE: Record<string, string> = {
  away: "away",
  in_zone: "in zone",
  in_false_break: "false break",
};
const OUTCOME: Record<string, string> = { comeback: "comeback", stack_break: "stack break" };

function utc(ms: number | null | undefined): string {
  return ms === null || ms === undefined
    ? "—"
    : new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

function price(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

type Props = {
  barTimeSec: number;
  sides: EpisodeSide[];
  histories: Partial<Record<EpisodeSide, EpisodeHistory>>;
};

/** "Episode on this bar": the Engine entities that contain the selected bar, per side. */
export function EpisodeBarSection({ barTimeSec, sides, histories }: Props) {
  const t = barTimeSec * 1000;
  return (
    <div className="bar-inspector__episode">
      <h4>Episode on this bar</h4>
      {sides.map((side) => {
        const history = histories[side];
        if (!history) {
          return (
            <p key={side} className="bar-inspector__hint">
              {side.toUpperCase()}: not loaded
            </p>
          );
        }
        const episode = episodeAt(allEpisodes(history), t);
        if (!episode) {
          return (
            <p key={side} className="bar-inspector__hint">
              {side.toUpperCase()}: no episode
            </p>
          );
        }
        const zone = zoneAt(episode, t);
        const fb = falseBreakAt(episode, t);
        const wave = waveAt(episode, t);
        const isCurrent = episode.stack_break_ms === null;
        return (
          <dl key={side} className="bar-inspector__dl">
            <dt>{side.toUpperCase()} episode</dt>
            <dd>
              S0 {utc(episode.start_ms)} →{" "}
              {isCurrent ? "running" : `stack break ${utc(episode.stack_break_ms)}`}
              {episode.censored ? " · censored" : ""}
            </dd>
            <dt>Zone</dt>
            <dd>
              {zone
                ? `№ ${zone.number} · ${utc(zone.start)} – ${utc(zone.end)} · low ${price(zone.low)}`
                : "—"}
            </dd>
            <dt>False break</dt>
            <dd>
              {fb
                ? `№ ${fb.number} · ${fb.outcome === null ? "open" : OUTCOME[fb.outcome] ?? fb.outcome} · depth ${price(fb.depth)}`
                : "—"}
            </dd>
            <dt>Wave</dt>
            <dd>
              {wave
                ? `${wave.number}${wave.final ? "" : " (forming)"} · S* ${price(wave.origin_price)} · P ${price(wave.peak_price)}`
                : "—"}
            </dd>
            {isCurrent ? (
              <>
                <dt>Now (last closed candle)</dt>
                <dd>
                  touch № {episode.touch_number ?? "—"} ·{" "}
                  {episode.phase ? PHASE[episode.phase] ?? episode.phase : "—"}
                </dd>
              </>
            ) : null}
          </dl>
        );
      })}
    </div>
  );
}
