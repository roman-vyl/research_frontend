import type { EpisodeSide } from "@/api/episodes";
import type { EpisodeLayerToggles } from "@/features/episodes/EpisodeLayersPrimitive";
import { EPISODE_COLORS } from "@/features/episodes/EpisodeLayersPrimitive";

export type EpisodeSideChoice = EpisodeSide | "both";

const LAYERS: { key: keyof EpisodeLayerToggles; label: string; swatch: string; edge?: string }[] = [
  { key: "band", label: "Episode band", swatch: EPISODE_COLORS.bandLong, edge: EPISODE_COLORS.up },
  { key: "zones", label: "Zones", swatch: EPISODE_COLORS.zone, edge: EPISODE_COLORS.zoneEdge },
  {
    key: "falseBreaks",
    label: "False breaks",
    swatch: EPISODE_COLORS.falseBreak,
    edge: EPISODE_COLORS.falseBreakEdge,
  },
  { key: "waves", label: "Waves", swatch: EPISODE_COLORS.up },
  { key: "forming", label: "Forming wave", swatch: EPISODE_COLORS.forming },
];

const SIDES: { id: EpisodeSideChoice; label: string }[] = [
  { id: "long", label: "LONG" },
  { id: "short", label: "SHORT" },
  { id: "both", label: "Both" },
];

type Props = {
  layers: EpisodeLayerToggles;
  onLayersChange: (layers: EpisodeLayerToggles) => void;
  side: EpisodeSideChoice;
  onSideChange: (side: EpisodeSideChoice) => void;
  status: string | null;
  /** `ema_stack_episode` refs of the strategy; a choice is shown when there are several. */
  refs: string[];
  chosenRef: string | null;
  onRefChange: (ref: string) => void;
};

/** Episode layer toggles and side choice (mock "Эпизод на графике", 2026-10-08). */
export function EpisodeToolbar({
  layers,
  onLayersChange,
  side,
  onSideChange,
  status,
  refs,
  chosenRef,
  onRefChange,
}: Props) {
  return (
    <div className="episode-toolbar" aria-label="EMA stack episode layers">
      <div className="episode-toolbar__group" role="group" aria-label="Episode layers">
        <span className="episode-toolbar__label">Episode</span>
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            className="episode-toolbar__toggle"
            aria-pressed={layers[layer.key]}
            onClick={() => onLayersChange({ ...layers, [layer.key]: !layers[layer.key] })}
          >
            <i
              aria-hidden
              style={{
                background: layer.swatch,
                border: layer.edge ? `1px solid ${layer.edge}` : undefined,
              }}
            />
            {layer.label}
          </button>
        ))}
      </div>
      <div className="episode-toolbar__group" role="group" aria-label="Episode side">
        <span className="episode-toolbar__label">Side</span>
        <div className="episode-toolbar__segmented">
          {SIDES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={option.id === side}
              onClick={() => onSideChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {refs.length === 1 ? (
        <span className="episode-toolbar__label">ref {refs[0]}</span>
      ) : null}
      {refs.length > 1 ? (
        <div className="episode-toolbar__group" role="group" aria-label="Episode ref">
          <span className="episode-toolbar__label">Ref</span>
          <div className="episode-toolbar__segmented">
            {refs.map((ref) => (
              <button
                key={ref}
                type="button"
                aria-pressed={ref === chosenRef}
                onClick={() => onRefChange(ref)}
              >
                {ref}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {status ? <span className="episode-toolbar__status">{status}</span> : null}
    </div>
  );
}
