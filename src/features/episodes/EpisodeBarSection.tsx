import type { EpisodeSide } from "@/api/episodes";
import type { EpisodeHistory } from "@/features/episodes/episodeHistory";
import { allEpisodes, episodeAt, episodeStateAt } from "@/features/episodes/episodeLookup";

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
 * "Episode on this bar" as it was known at the bar's close (`episodeStateAt`): open entities are shown
 * without their final values, and nothing that is decided later (zone end, whether a run below the
 * anchor becomes a false break, outcome, depth, wave prices, stack break) shows through.
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
        const state = episodeStateAt(episode, t);
        const closed = state.lastClosedZone;
        const resolved = state.lastResolvedFalseBreak;
        const wave = state.lastFinishedWave;
        return (
          <dl key={side} className="bar-inspector__dl">
            <dt>{side.toUpperCase()} episode</dt>
            <dd>
              S0 {utc(episode.start_ms)}
              {state.brokenHere ? " · stack break on this bar" : " · stack intact"}
              {episode.censored ? " · censored" : ""}
            </dd>
            <dt>Phase</dt>
            <dd>
              {state.brokenHere ? "stack break" : PHASE[state.phase]}
              {state.openZone ? ` · zone № ${state.openZone.number} open since ${utc(state.openZone.start)}` : ""}
              {state.openFalseBreak
                ? ` · false break № ${state.openFalseBreak.number} since ${utc(state.openFalseBreak.start)}`
                : ""}
            </dd>
            <dt>Last touch opened</dt>
            <dd>{state.lastTouch === null ? "none yet" : `№ ${state.lastTouch}`}</dd>
            <dt>Last closed zone</dt>
            <dd>
              {closed
                ? `№ ${closed.number} · ${utc(closed.start)} – ${utc(closed.end)} · low ${price(closed.low)} · high ${price(closed.high)}`
                : "—"}
            </dd>
            <dt>Last resolved false break</dt>
            <dd>
              {resolved
                ? `№ ${resolved.number} · ${resolved.outcome === null ? "open" : (OUTCOME[resolved.outcome] ?? resolved.outcome)} · depth ${price(resolved.depth)}`
                : "—"}
            </dd>
            <dt>Last finished wave</dt>
            <dd>
              {wave
                ? `${wave.number} · S* ${price(wave.origin_price)} · P ${price(wave.peak_price)} · touch ${price(wave.touch_price)}`
                : "—"}
            </dd>
            <dt>Forming</dt>
            <dd>{state.brokenHere ? "—" : `wave ${state.formingNumber}`}</dd>
            {episode.stack_break_ms === null ? (
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
