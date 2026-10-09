import type { EpisodeSide } from "@/api/episodes";
import type { EpisodeHistory } from "@/features/episodes/episodeHistory";
import {
  allEpisodes,
  episodeAt,
  falseBreakAt,
  knownBy,
  lastZoneOpenedBy,
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

/**
 * "Episode on this bar": the Engine entities that contain the selected bar, showing only what is
 * known at its close (`known_at` not after the bar). Later facts (zone end, false-break outcome and
 * depth, final wave prices, stack break) are not shown as known on an earlier bar.
 */
export function EpisodeBarSection({ barTimeSec, sides, histories }: Props) {
  const t = barTimeSec * 1000;
  return (
    <div className="bar-inspector__episode">
      <h4>Episode on this bar</h4>
      <p className="bar-inspector__hint">As known at this bar's close.</p>
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
        const lastTouch = lastZoneOpenedBy(episode, t);
        const brokenHere = knownBy(episode.stack_break_ms, t);
        const isCurrent = episode.stack_break_ms === null;
        return (
          <dl key={side} className="bar-inspector__dl">
            <dt>{side.toUpperCase()} episode</dt>
            <dd>
              S0 {utc(episode.start_ms)}
              {brokenHere ? ` · stack break on this bar` : " · stack intact"}
              {episode.censored ? " · censored" : ""}
            </dd>
            <dt>Last touch opened</dt>
            <dd>{lastTouch === null ? "none yet" : `№ ${lastTouch}`}</dd>
            <dt>Zone</dt>
            <dd>
              {zone
                ? knownBy(zone.known_at, t)
                  ? `№ ${zone.number} · ${utc(zone.start)} – ${utc(zone.end)} · low ${price(zone.low)}`
                  : `№ ${zone.number} · open since ${utc(zone.start)}`
                : "—"}
            </dd>
            <dt>False break</dt>
            <dd>
              {fb
                ? knownBy(fb.known_at, t)
                  ? `№ ${fb.number} · ${fb.outcome === null ? "open" : (OUTCOME[fb.outcome] ?? fb.outcome)} · depth ${price(fb.depth)}`
                  : `№ ${fb.number} · in progress since ${utc(fb.start)}`
                : "—"}
            </dd>
            <dt>Wave</dt>
            <dd>
              {wave
                ? wave.final && knownBy(wave.known_at, t)
                  ? `${wave.number} · S* ${price(wave.origin_price)} · P ${price(wave.peak_price)} · touch ${price(wave.touch_price)}`
                  : `${wave.number} forming`
                : "—"}
            </dd>
            {isCurrent ? (
              <>
                <dt>At the last closed candle</dt>
                <dd>
                  touch № {episode.touch_number ?? "—"} ·{" "}
                  {episode.phase ? (PHASE[episode.phase] ?? episode.phase) : "—"}
                </dd>
              </>
            ) : null}
          </dl>
        );
      })}
    </div>
  );
}
