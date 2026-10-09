import { useEffect, useState } from "react";

import type { EpisodeParams, EpisodeSide } from "@/api/episodes";
import type { EpisodeWindowOverride } from "@/features/episodes/episodeParams";
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
  /** Parameters sent to Engine (strategy values plus the user's override); null hides the inputs. */
  params: EpisodeParams | null;
  override: EpisodeWindowOverride;
  onOverrideChange: (override: EpisodeWindowOverride) => void;
};

const WINDOW_FIELDS: { key: keyof EpisodeWindowOverride; label: string; title: string }[] = [
  {
    key: "window_bars",
    label: "Window",
    title: "window_bars: bars without contact that close a zone, and bars wholly beyond the anchor that make a false break",
  },
  {
    key: "break_bars",
    label: "Break",
    title: "break_bars: bars of violated EMA order before the stack break",
  },
];

/** A positive integer field applied on Enter or blur, so Engine is not asked on every keystroke. */
function EpisodeBarsInput({
  label,
  title,
  value,
  overridden,
  onCommit,
}: {
  label: string;
  title: string;
  value: number | undefined;
  overridden: boolean;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (Number.isInteger(parsed) && parsed > 0 && parsed !== value) onCommit(parsed);
    else setDraft(value === undefined ? "" : String(value));
  };
  return (
    <label className="episode-toolbar__field" title={title}>
      {label}
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={draft}
        placeholder="default"
        data-overridden={overridden || undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
    </label>
  );
}

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
  params,
  override,
  onOverrideChange,
}: Props) {
  const overridden = Object.keys(override).length > 0;
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
      {params ? (
        <div className="episode-toolbar__group" role="group" aria-label="Episode window">
          {WINDOW_FIELDS.map((field) => (
            <EpisodeBarsInput
              key={field.key}
              label={field.label}
              title={field.title}
              value={params[field.key]}
              overridden={override[field.key] !== undefined}
              onCommit={(value) => onOverrideChange({ ...override, [field.key]: value })}
            />
          ))}
          {overridden ? (
            <button type="button" className="episode-toolbar__toggle" onClick={() => onOverrideChange({})}>
              Strategy values
            </button>
          ) : null}
        </div>
      ) : null}
      {status ? <span className="episode-toolbar__status">{status}</span> : null}
    </div>
  );
}
