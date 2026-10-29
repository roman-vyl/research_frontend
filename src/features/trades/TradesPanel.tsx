import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { fetchClosedTrades, type ClosedTrade } from "@/api/journal";
import { fetchRuntimeStrategyInstances } from "@/api/runtime";
import {
  EMPTY_FILTER,
  applyFilter,
  calendarCells,
  coinOf,
  equityCurve,
  fmt,
  formatDuration,
  formatUtc,
  formatUtcSeconds,
  latestMonth,
  plannedExit,
  price,
  reasonText,
  shiftMonth,
  sideText,
  signed,
  sortForTable,
  strategyName,
  strategyNames,
  summarize,
  tone,
  type CalendarMonth,
  type StatusFilter,
  type TradeFilter,
} from "@/features/trades/tradeStats";
import "@/features/surface/surface.css";
import "@/features/trades/trades.css";

type Phase = { kind: "loading" } | { kind: "ready"; trades: ClosedTrade[] } | { kind: "error" };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "complete", label: "Complete" },
  { id: "incomplete", label: "Waiting for ABI" },
];

function key(t: ClosedTrade): string {
  return `${t.strategy_instance_id}\u0000${t.trade_cycle_id}`;
}

/** A signed number colored by its sign; `worseWhenPositive` flips the color (slippage). */
function Num({ value, digits, worseWhenPositive = false }: { value: number; digits: number; worseWhenPositive?: boolean }) {
  return (
    <span className="sx-num tr-val" data-tone={tone(worseWhenPositive ? -value : value)}>
      {signed(value, digits)}
    </span>
  );
}

function SummaryTiles({ trades }: { trades: ClosedTrade[] }) {
  const s = summarize(trades);
  const tiles: { label: string; value: ReactNode; sub: string }[] = [
    { label: "Net PnL, USDT", value: <Num value={s.net} digits={2} />, sub: `gross ${signed(s.gross, 2)}` },
    {
      label: "Trades",
      value: <span className="sx-num">{s.trades}</span>,
      sub: s.waiting ? `${s.waiting} waiting for ABI` : "all assembled",
    },
    {
      label: "Win rate",
      value: <span className="sx-num">{s.winRatePct === null ? "—" : `${fmt(s.winRatePct, 1)}%`}</span>,
      sub: "share of trades with net > 0",
    },
    {
      label: "Average R",
      value: s.averageR === null ? <span className="sx-num">—</span> : <Num value={s.averageR} digits={2} />,
      sub: "R = net / risk to the stop",
    },
    {
      label: "Profit factor",
      value: <span className="sx-num">{s.profitFactor === null ? "—" : fmt(s.profitFactor, 2)}</span>,
      sub: "net of winners / net of losers",
    },
    { label: "Fees, USDT", value: <span className="sx-num">{fmt(s.fees, 2)}</span>, sub: "entry and exit" },
    {
      label: "Average duration",
      value: <span className="sx-num">{s.averageDurationMs === null ? "—" : formatDuration(s.averageDurationMs)}</span>,
      sub: "first entry fill to last exit fill",
    },
  ];
  return (
    <div className="tr-tiles" aria-label="Summary">
      {tiles.map((t) => (
        <div key={t.label} className="sx-panel tr-tile">
          <div className="tr-tile-label">{t.label}</div>
          <div className="tr-tile-value">{t.value}</div>
          <div className="tr-tile-sub">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function EquityCurve({ trades }: { trades: ClosedTrade[] }) {
  const points = equityCurve(trades);
  const values = points.map((p) => p.cumulative);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const y = (v: number) => 8 + (184 * (hi - v)) / span;
  const x = (i: number) => (800 * i) / Math.max(1, points.length - 1);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join(" ");
  const first = points[1]?.closedAtMs ?? null;
  const last = points[points.length - 1]?.closedAtMs ?? null;
  return (
    <section className="sx-panel tr-box tr-curve" aria-label="Cumulative net PnL">
      <div className="tr-box-head">
        <h2 className="tr-h2">Cumulative net PnL, USDT</h2>
        <span className="sx-note">by close time, after fees</span>
      </div>
      {points.length < 2 ? (
        <p className="sx-note">No complete trades in this selection.</p>
      ) : (
        <>
          <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="tr-curve-svg" role="img" aria-label={`Cumulative net ends at ${signed(values[values.length - 1], 2)} USDT`}>
            <line x1="0" x2="800" y1={y(0)} y2={y(0)} className="tr-zero" />
            <polyline points={line} className="tr-line" />
          </svg>
          <div className="tr-curve-axis sx-num">
            <span>{first === null ? "" : formatUtc(first)}</span>
            <span>{last === null ? "" : formatUtc(last)}</span>
          </div>
        </>
      )}
    </section>
  );
}

function Calendar({ trades }: { trades: ClosedTrade[] }) {
  const latest = latestMonth(trades);
  const [shown, setShown] = useState<CalendarMonth | null>(null);
  const month = shown ?? latest;
  useEffect(() => setShown(null), [latest?.year, latest?.month]);
  if (!month) {
    return (
      <section className="sx-panel tr-box tr-cal" aria-label="Calendar">
        <h2 className="tr-h2">Calendar</h2>
        <p className="sx-note">No complete trades in this selection.</p>
      </section>
    );
  }
  const { lead, days } = calendarCells(trades, month);
  return (
    <section className="sx-panel tr-box tr-cal" aria-label="Calendar">
      <div className="tr-box-head">
        <div className="tr-cal-nav">
          <button type="button" className="sx-fbtn" aria-label="Previous month" onClick={() => setShown(shiftMonth(month, -1))}>
            ‹
          </button>
          <h2 className="tr-h2">
            {MONTHS[month.month]} {month.year}
          </h2>
          <button type="button" className="sx-fbtn" aria-label="Next month" onClick={() => setShown(shiftMonth(month, 1))}>
            ›
          </button>
        </div>
        <span className="sx-note">net per UTC day</span>
      </div>
      <div className="tr-cal-grid tr-cal-dow" aria-hidden="true">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="tr-cal-grid">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {days.map((d) => (
          <div
            key={d.day}
            className="tr-cal-day"
            data-tone={d.count ? tone(d.net) : "none"}
            aria-label={d.count ? `${MONTHS[month.month]} ${d.day}: ${signed(d.net, 2)} USDT, ${d.count} trades` : undefined}
          >
            <span className="tr-cal-num">{d.day}</span>
            {d.count > 0 && (
              <>
                <span className="sx-num">{signed(d.net, 0)}</span>
                <span className="tr-cal-count">
                  {d.count} {d.count === 1 ? "trade" : "trades"}
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusText({ t }: { t: ClosedTrade }) {
  if (t.status === "complete") return <span className="tr-status">complete</span>;
  return (
    <span className="tr-status" data-waiting="true">
      Waiting for ABI · {t.attempts} attempts{t.last_error ? ` · ${t.last_error}` : ""}
    </span>
  );
}

function TradeTable({
  trades,
  names,
  onOpen,
}: {
  trades: ClosedTrade[];
  names: Map<string, string>;
  onOpen: (t: ClosedTrade) => void;
}) {
  const rows = sortForTable(trades);
  return (
    <section className="sx-panel tr-table-box" aria-label="Trades">
      <div className="tr-box-head tr-table-head">
        <h2 className="tr-h2">
          Trades <span className="sx-note">· {rows.length}</span>
        </h2>
        <span className="sx-note">one row = strategy + trade cycle with a position opened</span>
      </div>
      <div className="tr-scroll">
        <table className="tr-table">
          <thead>
            <tr>
              <th className="tr-l">Closed, UTC</th>
              <th className="tr-l">Strategy</th>
              <th className="tr-l">Coin</th>
              <th className="tr-l">Side</th>
              <th className="tr-l">Exit reason</th>
              <th>Entry avg</th>
              <th>Entry slip. %</th>
              <th>Exit avg</th>
              <th>Notional USDT</th>
              <th>Gross</th>
              <th>Fees</th>
              <th>Net</th>
              <th>R</th>
              <th>Net %</th>
              <th>Duration</th>
              <th className="tr-l">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const ok = t.status === "complete";
              return (
                <tr key={key(t)} className="tr-row">
                  <td className="tr-l sx-num">
                    <button type="button" className="tr-open" onClick={() => onOpen(t)}>
                      {ok && t.closed_at_ms !== null ? formatUtc(t.closed_at_ms) : "not closed on the exchange yet"}
                    </button>
                  </td>
                  <td className="tr-l" title={t.strategy_instance_id}>
                    {strategyName(names, t.strategy_instance_id)}
                  </td>
                  <td className="tr-l">{t.symbol ?? "—"}</td>
                  <td className="tr-l">
                    <span className="tr-side" data-side={t.side ?? "none"}>
                      {sideText(t.side)}
                    </span>
                  </td>
                  <td className="tr-l">{reasonText(t.close_reason)}</td>
                  <td className="sx-num">{ok ? price(t.entry_avg_price) : "—"}</td>
                  <td>{ok && t.entry_slippage_pct !== null ? <Num value={Number(t.entry_slippage_pct)} digits={3} worseWhenPositive /> : "—"}</td>
                  <td className="sx-num">{ok ? price(t.exit_avg_price) : "—"}</td>
                  <td className="sx-num">{ok ? fmt(Number(t.entry_notional_usdt), 0) : "—"}</td>
                  <td>{ok ? <Num value={Number(t.gross_pnl_usdt)} digits={2} /> : "—"}</td>
                  <td className="sx-num">{ok ? fmt(Number(t.fees_usdt), 2) : "—"}</td>
                  <td className="tr-strong">{ok ? <Num value={Number(t.net_pnl_usdt)} digits={2} /> : "—"}</td>
                  <td>{ok ? <Num value={Number(t.r_multiple)} digits={2} /> : "—"}</td>
                  <td>{ok ? <Num value={Number(t.net_return_pct)} digits={2} /> : "—"}</td>
                  <td className="sx-num">{ok && t.duration_ms !== null ? formatDuration(t.duration_ms) : "—"}</td>
                  <td className="tr-l">
                    <StatusText t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="sx-note tr-foot">Slippage: positive = worse than the plan.</p>
    </section>
  );
}

function Levels({ t }: { t: ClosedTrade }) {
  const levels: { label: string; value: string | null; kind: string }[] = [
    { label: "initial stop", value: t.planned_initial_stop, kind: "stop" },
    { label: "last stop", value: t.last_stop !== t.planned_initial_stop ? t.last_stop : null, kind: "stop" },
    { label: "planned entry", value: t.planned_entry_price, kind: "plan" },
    { label: "initial take", value: t.planned_initial_take, kind: "take" },
    { label: "last take", value: t.last_take !== t.planned_initial_take ? t.last_take : null, kind: "take" },
  ];
  const marks = [
    { label: "entry", value: t.entry_avg_price, at: t.opened_at_ms, x: 150 },
    { label: "exit", value: t.exit_avg_price, at: t.closed_at_ms, x: 650 },
  ];
  const all = [...levels.map((l) => l.value), ...marks.map((m) => m.value)].filter((v): v is string => v !== null).map(Number);
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const y = (v: number) => 24 + (212 * (hi - v)) / span;
  const [entry, exit] = marks;
  return (
    <section className="sx-panel tr-box" aria-label="Levels">
      <div className="tr-box-head">
        <h2 className="tr-h2">Levels</h2>
        <span className="sx-note">schematic from the journal row; the price path between entry and exit is not drawn</span>
      </div>
      <svg viewBox="0 0 1000 260" className="tr-levels" role="img" aria-label="Planned levels with entry and exit">
        {levels
          .filter((l) => l.value !== null)
          .map((l) => (
            <g key={l.label} className={`tr-lv tr-lv-${l.kind}`}>
              <line x1="100" x2="800" y1={y(Number(l.value))} y2={y(Number(l.value))} />
              <text x="92" y={y(Number(l.value)) + 4} textAnchor="end">
                {price(l.value)}
              </text>
              <text x="810" y={y(Number(l.value)) + 4}>
                {l.label}
              </text>
            </g>
          ))}
        {entry.value !== null && exit.value !== null && (
          <line className="tr-path" x1={entry.x} x2={exit.x} y1={y(Number(entry.value))} y2={y(Number(exit.value))} />
        )}
        {marks
          .filter((m) => m.value !== null)
          .map((m) => (
            <g key={m.label} className={`tr-mark tr-mark-${m.label}`}>
              <circle cx={m.x} cy={y(Number(m.value))} r="6" />
              <text x={m.x} y={y(Number(m.value)) - 12} textAnchor="middle">
                {m.label} {price(m.value)}
                {m.at !== null ? ` · ${formatUtcSeconds(m.at).slice(11)}` : ""}
              </text>
            </g>
          ))}
      </svg>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function TradeCard({ t, name, onBack }: { t: ClosedTrade; name: string; onBack: () => void }) {
  const ok = t.status === "complete";
  const exitPlan = plannedExit(t);
  return (
    <div className="tr-card">
      <button type="button" className="sx-fbtn tr-back" onClick={onBack}>
        ← All trades
      </button>
      <section className="sx-panel tr-box tr-card-head" aria-label="Trade">
        <div className="tr-card-title">
          <div className="tr-card-tags">
            <h2 className="tr-card-sym">{t.symbol ?? "—"}</h2>
            <span className="tr-side" data-side={t.side ?? "none"}>
              {sideText(t.side)}
            </span>
            <span className="tr-chip">{reasonText(t.close_reason)}</span>
            <StatusText t={t} />
          </div>
          <div className="tr-card-ids sx-num">
            {name} · {t.strategy_instance_id} · cycle {t.trade_cycle_id}
          </div>
          {ok && t.opened_at_ms !== null && t.closed_at_ms !== null && t.duration_ms !== null && (
            <div className="tr-card-time sx-num">
              {formatUtcSeconds(t.opened_at_ms)} → {formatUtcSeconds(t.closed_at_ms).slice(11)} UTC · {formatDuration(t.duration_ms)}
            </div>
          )}
        </div>
        {ok && (
          <div className="tr-card-big">
            <div>
              <span className="tr-tile-label">Net, USDT</span>
              <Num value={Number(t.net_pnl_usdt)} digits={2} />
            </div>
            <div>
              <span className="tr-tile-label">R</span>
              <Num value={Number(t.r_multiple)} digits={2} />
            </div>
            <div>
              <span className="tr-tile-label">Net to notional</span>
              <span className="sx-num tr-val" data-tone={tone(Number(t.net_return_pct))}>
                {signed(Number(t.net_return_pct), 2)}%
              </span>
            </div>
          </div>
        )}
      </section>
      {!ok && (
        <p className="sx-note">
          The exchange has not reported the closing fill to ABI yet. The journal retries every minute; the numbers appear once the trade is
          assembled.
        </p>
      )}
      {ok && (
        <>
          <Levels t={t} />
          <div className="tr-card-grid">
            <section className="sx-panel tr-box" aria-label="Plan and fact">
              <h2 className="tr-h2">Plan and fact</h2>
              <table className="tr-pf">
                <thead>
                  <tr>
                    <th />
                    <th>Plan</th>
                    <th>Fact</th>
                    <th>Slippage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Entry</th>
                    <td className="sx-num">{price(t.planned_entry_price)}</td>
                    <td className="sx-num">{price(t.entry_avg_price)}</td>
                    <td>{t.entry_slippage_pct === null ? "—" : <><Num value={Number(t.entry_slippage_pct)} digits={3} worseWhenPositive />%</>}</td>
                  </tr>
                  <tr>
                    <th>Exit</th>
                    <td className="sx-num">{exitPlan === null ? "no plan" : price(exitPlan)}</td>
                    <td className="sx-num">{price(t.exit_avg_price)}</td>
                    <td>{t.exit_slippage_pct === null ? "—" : <><Num value={Number(t.exit_slippage_pct)} digits={3} worseWhenPositive />%</>}</td>
                  </tr>
                  <tr>
                    <th>Stop</th>
                    <td className="sx-num">{price(t.planned_initial_stop)}</td>
                    <td className="sx-num">{price(t.last_stop)}</td>
                    <td className="sx-note">{t.last_stop === t.planned_initial_stop ? "unchanged" : "moved"}</td>
                  </tr>
                  <tr>
                    <th>Take</th>
                    <td className="sx-num">{price(t.planned_initial_take)}</td>
                    <td className="sx-num">{price(t.last_take)}</td>
                    <td className="sx-note">{t.last_take === t.planned_initial_take ? "unchanged" : "moved"}</td>
                  </tr>
                </tbody>
              </table>
              <p className="sx-note">Positive slippage is worse than the plan. A Runtime-signal exit has no planned price.</p>
            </section>
            <section className="sx-panel tr-box" aria-label="Result">
              <h2 className="tr-h2">Result</h2>
              <dl className="tr-dl">
                <Row label="Gross">
                  <Num value={Number(t.gross_pnl_usdt)} digits={2} />
                </Row>
                <Row label="Entry fee">
                  <span className="sx-num">{fmt(Number(t.entry_fee_usdt), 2)}</span>
                </Row>
                <Row label="Exit fee">
                  <span className="sx-num">{fmt(Number(t.exit_fee_usdt), 2)}</span>
                </Row>
                <Row label="Net">
                  <Num value={Number(t.net_pnl_usdt)} digits={2} />
                </Row>
                <Row label="Risk to the stop">
                  <span className="sx-num">{t.risk_usdt === null ? "—" : fmt(Number(t.risk_usdt), 2)}</span>
                </Row>
                <Row label="R (net / risk)">
                  {t.r_multiple === null ? "—" : <Num value={Number(t.r_multiple)} digits={3} />}
                </Row>
                <Row label="Price move">
                  <span className="sx-num tr-val" data-tone={tone(Number(t.price_return_pct))}>
                    {signed(Number(t.price_return_pct), 3)}%
                  </span>
                </Row>
                <Row label="Net to notional">
                  <span className="sx-num tr-val" data-tone={tone(Number(t.net_return_pct))}>
                    {signed(Number(t.net_return_pct), 3)}%
                  </span>
                </Row>
              </dl>
              <p className="sx-note">Funding is not included.</p>
            </section>
            <section className="sx-panel tr-box" aria-label="Size and fills">
              <h2 className="tr-h2">Size and fills</h2>
              <dl className="tr-dl">
                <Row label="Quantity">
                  <span className="sx-num">
                    {t.entry_qty} {coinOf(t.symbol)}
                  </span>
                </Row>
                <Row label="Notional, USDT">
                  <span className="sx-num">{fmt(Number(t.entry_notional_usdt), 2)}</span>
                </Row>
                <Row label="Entry fills">
                  <span className="sx-num">{t.entry_fill_count}</span>
                </Row>
                <Row label="Exit fills">
                  <span className="sx-num">{t.exit_fill_count}</span>
                </Row>
                <Row label="Duration">
                  <span className="sx-num">{t.duration_ms === null ? "—" : formatDuration(t.duration_ms)}</span>
                </Row>
                <Row label="Assembled after">
                  <span className="sx-num">
                    {t.attempts} {t.attempts === 1 ? "attempt" : "attempts"}
                  </span>
                </Row>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export function TradesPanel() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [names, setNames] = useState<Map<string, string> | null>(new Map());
  const [filter, setFilter] = useState<TradeFilter>(EMPTY_FILTER);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setPhase((p) => (p.kind === "ready" ? p : { kind: "loading" }));
    const [trades, runtime] = await Promise.allSettled([fetchClosedTrades(), fetchRuntimeStrategyInstances()]);
    if (seq !== loadSeq.current) return;
    setNames(runtime.status === "fulfilled" ? strategyNames(runtime.value.strategy_instances) : null);
    setPhase(trades.status === "fulfilled" ? { kind: "ready", trades: trades.value } : { kind: "error" });
  }, []);

  useEffect(() => {
    void load();
    return () => {
      loadSeq.current += 1;
    };
  }, [load]);

  const all = phase.kind === "ready" ? phase.trades : [];
  const nameMap = useMemo(() => names ?? new Map<string, string>(), [names]);
  const filtered = useMemo(() => applyFilter(all, filter), [all, filter]);
  const strategies = useMemo(
    () =>
      [...new Set(all.map((t) => t.strategy_instance_id))]
        .map((id) => ({ id, name: strategyName(nameMap, id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, nameMap],
  );
  const coins = useMemo(() => [...new Set(all.map((t) => t.symbol).filter((s): s is string => s !== null))].sort(), [all]);
  const opened = openKey === null ? null : all.find((t) => key(t) === openKey) ?? null;
  const set = (patch: Partial<TradeFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <section className="sx" aria-label="Trades">
      <div className="sx-wrap sx-wrap-wide">
        <header className="tr-head">
          <div className="tr-head-text">
            <div className="sx-eyebrow">Central Journal</div>
            <h1>Trades</h1>
            <p className="sx-sub">Closed trades assembled by the Central Journal from Runtime events and ABI fills.</p>
          </div>
          <button type="button" className="sx-fbtn" onClick={() => void load()} disabled={phase.kind === "loading"}>
            Refresh
          </button>
        </header>

        {phase.kind === "loading" && <p className="sx-note">Loading trades…</p>}

        {phase.kind === "error" && (
          <div className="sx-panel tr-error">
            <p role="alert" className="sx-error">
              The journal could not be read.
            </p>
            <button type="button" className="sx-fbtn" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {phase.kind === "ready" && names === null && (
          <p className="sx-note" role="status">
            Strategy names are unavailable (Runtime did not answer); short ids are shown.
          </p>
        )}

        {phase.kind === "ready" && all.length === 0 && <p className="sx-note">No closed trades</p>}

        {phase.kind === "ready" && all.length > 0 && opened !== null && (
          <TradeCard t={opened} name={strategyName(nameMap, opened.strategy_instance_id)} onBack={() => setOpenKey(null)} />
        )}

        {phase.kind === "ready" && all.length > 0 && opened === null && (
          <>
            <div className="sx-panel sx-frow tr-filters" aria-label="Filters">
              <label className="tr-field">
                <span className="sx-control-label">Strategy</span>
                <select value={filter.strategy} onChange={(e) => set({ strategy: e.target.value })}>
                  <option value="">All strategies</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tr-field">
                <span className="sx-control-label">Coin</span>
                <select value={filter.coin} onChange={(e) => set({ coin: e.target.value })}>
                  <option value="">All</option>
                  {coins.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tr-field">
                <span className="sx-control-label">Closed from (UTC)</span>
                <input type="date" value={filter.fromDay} onChange={(e) => set({ fromDay: e.target.value })} />
              </label>
              <label className="tr-field">
                <span className="sx-control-label">to</span>
                <input type="date" value={filter.toDay} onChange={(e) => set({ toDay: e.target.value })} />
              </label>
              <div className="sx-segmented" role="group" aria-label="Status">
                {STATUS_TABS.map((s) => (
                  <button key={s.id} type="button" aria-pressed={filter.status === s.id} onClick={() => set({ status: s.id })}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <SummaryTiles trades={filtered} />
            <div className="tr-charts">
              <EquityCurve trades={filtered} />
              <Calendar trades={filtered} />
            </div>
            <TradeTable trades={filtered} names={nameMap} onOpen={(t) => setOpenKey(key(t))} />
          </>
        )}
      </div>
    </section>
  );
}
