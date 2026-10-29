## Context

Rows come from journal_service `GET /v1/closed-trades` exactly as stored: decimals are strings,
times are UTC milliseconds, `status` is `complete` or `incomplete`; incomplete rows carry only
detection fields plus `attempts`, `last_attempt_at_ms`, `last_error`. On the Demo stack there are
21 rows today. The journal knows no strategy name; Runtime's strategy list has `source_path`, and
the Runtime Dashboard already names a strategy by its deployment file name.

## Decisions

### D1. One load, filters in the browser

The tab loads the whole list once per open, Refresh or Retry and filters locally. The count is
small (one row per closed trade); the API's own filters stay unused in this stage. Both reads are
started together; the Runtime read is only for names, so its failure never blocks the table.

### D2. Names

Strategy name = the deployment file name of `source_path` without its directory and `.json`, as
on the Runtime Dashboard. A row whose `strategy_instance_id` is not in Runtime's list, or any row
when that read failed, shows the first 8 characters of the id after its last `:`. The full id is
in the card and in a tooltip.

### D3. Numbers computed in the browser

Only arithmetic over the filtered complete rows, using the stored values:

| Tile | Formula |
|---|---|
| Net PnL | Σ `net_pnl_usdt`; sub-line gross = Σ `gross_pnl_usdt` |
| Trades | count of complete rows; sub-line: number of incomplete rows in the filter, if any |
| Win rate | count(`net_pnl_usdt` > 0) / count · 100 |
| Average R | mean of `r_multiple` |
| Profit factor | Σ positive net / |Σ negative net|; "—" when there is no losing trade |
| Fees | Σ `fees_usdt` |
| Average duration | mean of `duration_ms` |

Curve: cumulative Σ `net_pnl_usdt` ordered by `closed_at_ms`, starting at 0. Calendar: net and
trade count per UTC day of `closed_at_ms`, month of the latest close in the filter by default,
previous/next month buttons. Parsing uses `Number()` for display only; stored strings are never
rewritten.

### D4. Table

Columns: Closed (UTC), Strategy, Coin, Side, Exit reason, Entry avg, Entry slippage %, Exit avg,
Notional USDT, Gross, Fees, Net, R, Net %, Duration, Status. Newest `closed_at_ms` first;
incomplete rows (no close time) on top by `created_at_ms`. Side and reason are words (Long/Short;
Stop loss / Take profit / Runtime signal), not color alone. Signed numbers carry `+`/`−` and
color. An incomplete row shows "—" for every number and "Waiting for ABI · N attempts ·
<last_error>" as status. The table scrolls horizontally inside its box at narrow widths.

### D5. Card

A row click opens the card in the same tab (Back returns to the list with filters kept). Blocks:

- header: coin, side, exit reason, status, strategy name and full ids, open → close time and
  duration, net, R, net %;
- levels: a schematic (not a price chart) of planned entry, initial and last stop and take,
  entry and exit markers with prices and times;
- plan vs fact: entry `planned_entry_price` vs `entry_avg_price` with `entry_slippage_pct`;
  exit planned (last stop for `stop_loss`, last take for `take_profit`, none for
  `runtime_signal`) vs `exit_avg_price` with `exit_slippage_pct`; stop and take initial vs last
  ("unchanged" when equal); a note that positive slippage is worse than the plan;
- result: gross, entry fee, exit fee, net, risk, R, price return %, net return %;
- volume: `entry_qty` with the coin, notional USDT, entry and exit fill counts, duration,
  attempts it took to assemble.

An incomplete trade's card shows only the header fields it has and the waiting reason.

### D6. Look

Follows the Runtime Dashboard / Surface visual language and both themes; numbers in the mono
face with tabular figures.
