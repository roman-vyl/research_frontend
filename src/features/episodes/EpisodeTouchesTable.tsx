import type { Episode, EpisodeSide } from "@/api/episodes";
import type { EpisodeHighlight } from "@/features/episodes/EpisodeLayersPrimitive";
import { formingWave, touchRows } from "@/features/episodes/episodeLookup";

const OUTCOME: Record<string, string> = { comeback: "comeback", stack_break: "stack break" };

function price(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(2);
}

function utc(ms: number | null | undefined): string {
  return ms === null || ms === undefined
    ? "—"
    : new Date(ms).toISOString().replace("T", " ").slice(0, 16);
}

type Props = {
  side: EpisodeSide;
  episode: Episode | null;
  highlight: EpisodeHighlight;
  onHighlight: (highlight: EpisodeHighlight) => void;
};

/** Touches of one episode, Engine's fields only. A row click highlights its entities on the chart. */
export function EpisodeTouchesTable({ side, episode, highlight, onHighlight }: Props) {
  if (!episode) {
    return null;
  }
  const rows = touchRows(episode);
  const forming = formingWave(episode);
  return (
    <section className="episode-touches" aria-label="Episode touches">
      <p className="episode-touches__title">
        {side.toUpperCase()} episode · S0 {utc(episode.start_ms)} ·{" "}
        {episode.stack_break_ms === null ? "running" : `stack break ${utc(episode.stack_break_ms)}`} ·
        touches {episode.touches} · false breaks {episode.false_breaks_count}
      </p>
      <div className="episode-touches__scroll">
        <table>
          <thead>
            <tr>
              <th>Touch</th>
              <th>Zone</th>
              <th>Zone low / high</th>
              <th>S* → P</th>
              <th>S* / P / touch price</th>
              <th>Up leg low / high</th>
              <th>Down leg low / high</th>
              <th>False break · outcome · depth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const selected =
                highlight !== null &&
                highlight.side === side &&
                highlight.startMs === episode.start_ms &&
                highlight.number === row.number;
              return (
                <tr
                  key={row.number}
                  className={selected ? "is-selected" : undefined}
                  onClick={() =>
                    onHighlight(selected ? null : { side, startMs: episode.start_ms, number: row.number })
                  }
                >
                  <td>№ {row.number}</td>
                  <td>
                    {utc(row.zone.start)} – {utc(row.zone.end)}
                  </td>
                  <td>
                    {price(row.zone.low)} / {price(row.zone.high)}
                  </td>
                  <td>
                    {utc(row.wave?.origin)} → {utc(row.wave?.peak)}
                  </td>
                  <td>
                    {price(row.wave?.origin_price)} / {price(row.wave?.peak_price)} /{" "}
                    {price(row.wave?.touch_price)}
                  </td>
                  <td>
                    {price(row.wave?.up_leg.low)} / {price(row.wave?.up_leg.high)}
                  </td>
                  <td>
                    {price(row.wave?.down_leg.low)} / {price(row.wave?.down_leg.high)}
                  </td>
                  <td>
                    {row.falseBreak
                      ? `${utc(row.falseBreak.start)} – ${utc(row.falseBreak.end)} · ${
                          row.falseBreak.outcome === null
                            ? "open"
                            : OUTCOME[row.falseBreak.outcome] ?? row.falseBreak.outcome
                        } · ${price(row.falseBreak.depth)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
            {forming ? (
              <tr className="episode-touches__forming">
                <td>wave {forming.number}</td>
                <td>forming</td>
                <td>—</td>
                <td>
                  {utc(forming.origin)} → {utc(forming.peak)}
                </td>
                <td>
                  {price(forming.origin_price)} / {price(forming.peak_price)} / —
                </td>
                <td>
                  {price(forming.up_leg.low)} / {price(forming.up_leg.high)}
                </td>
                <td>
                  {price(forming.down_leg.low)} / {price(forming.down_leg.high)}
                </td>
                <td>—</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
