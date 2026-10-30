# research-workbench-trade-journal-v1 Specification

## Purpose
The Trades tab: closed trades from the Central Journal with filters, summary, equity curve, calendar, table and a trade card, read-only, no recomputation of facts.
## Requirements
### Requirement: Trades tab

The Workbench navigation SHALL contain a tab labelled "Trades", placed after "Runtime
Dashboard", that shows the Trades panel. Activating it SHALL NOT change any other tab, the
selected run or the stored session tab.

#### Scenario: Open the tab
- **WHEN** the user activates "Trades"
- **THEN** exactly one `GET /journal-api/v1/closed-trades` without query parameters and one `GET /runtime-api/v1/strategy-instances` are sent
- **AND** no other request is sent

#### Scenario: Open the tab again
- **WHEN** the user leaves the tab and activates it again
- **THEN** both reads are sent again

### Requirement: The tab only reads

The Trades panel SHALL send only the two reads above, on open, on Refresh and on Retry, and
SHALL NOT send any write request or call ABI, Engine or MDS.

#### Scenario: Refresh
- **WHEN** the user presses Refresh
- **THEN** both reads are sent again and the current filters are kept

### Requirement: Strategy names

A row's strategy SHALL be shown by the deployment file name of the Runtime entry with the same
`strategy_instance_id` (file name of `source_path` without `.json`). Without such an entry, or
when the Runtime read failed, the first 8 characters of the id after its last `:` SHALL be shown.
A failed Runtime read SHALL NOT hide any trade.

#### Scenario: Name from Runtime
- **WHEN** Runtime lists the row's strategy with `source_path` `.../btc-ema200-w10.json`
- **THEN** the row shows `btc-ema200-w10`

#### Scenario: Runtime unavailable
- **WHEN** the Runtime read fails and the journal read succeeds
- **THEN** every trade is shown with the short id and one line says names are unavailable

### Requirement: Filters

The panel SHALL filter the loaded rows in the browser by strategy, coin, close date range
(inclusive UTC days of `closed_at_ms`) and status (All, Complete, Waiting for ABI; default All).
A date range SHALL leave out rows without `closed_at_ms`. Summary, curve, calendar and table
SHALL all use the filtered rows.

#### Scenario: Status filter
- **WHEN** the user picks "Waiting for ABI"
- **THEN** only incomplete rows are listed and the summary counts no trade

#### Scenario: Strategy filter
- **WHEN** the user picks one strategy
- **THEN** summary, curve, calendar and table show only that strategy's rows

### Requirement: Summary, curve and calendar

Over the filtered complete rows the panel SHALL show: Net PnL (Σ `net_pnl_usdt`, with gross
Σ `gross_pnl_usdt`), Trades (count, plus the number of filtered incomplete rows if any), Win rate
(share of rows with `net_pnl_usdt` > 0), Average R (mean `r_multiple`), Profit factor (Σ positive
net / |Σ negative net|, "—" without a losing trade), Fees (Σ `fees_usdt`) and Average duration
(mean `duration_ms`). It SHALL draw the cumulative net from 0 ordered by `closed_at_ms`, and a
month calendar of net and trade count per UTC day, opening on the month of the latest close,
with previous and next month buttons.

#### Scenario: Real Demo short alone
- **WHEN** the only row is the complete BTCUSDT short `6072511f` with `net_pnl_usdt` `-1307.99088539`, `gross_pnl_usdt` `-969.3902`, `fees_usdt` `338.60068539`, `r_multiple` `-1.3780585…`
- **THEN** Net PnL shows −1,307.99, Trades 1, Win rate 0%, Average R −1.38, Profit factor 0.00, Fees 338.60
- **AND** the calendar opens on October 2026 with −1,308 and 1 trade on the 25th

#### Scenario: Two trades
- **WHEN** the filter holds a +200 and a −100 net trade
- **THEN** Net PnL is +100.00, Win rate 50%, Profit factor 2.00

### Requirement: Trade table

The table SHALL list the filtered rows, newest `closed_at_ms` first with rows without a close
time on top, with the columns Closed (UTC), Strategy, Coin, Side, Exit reason, Entry avg, Entry
slippage %, Exit avg, Notional USDT, Gross, Fees, Net, R, Net %, Duration and Status. Side and exit
reason SHALL be words. Signed values SHALL carry a sign and not rely on color alone. An incomplete
row SHALL show "—" for every number and the status "Waiting for ABI · N attempts · last_error".

#### Scenario: Incomplete row
- **WHEN** a row has `status` `incomplete`, `attempts` 3 and `last_error` `abi_unavailable`
- **THEN** its status reads "Waiting for ABI · 3 attempts · abi_unavailable" and no PnL is shown

### Requirement: Trade card

Clicking a row SHALL open the card of that trade in the tab; Back SHALL return to the list with
the filters kept. The card SHALL show: coin, side, exit reason, status, strategy name and full
`strategy_instance_id` and `trade_cycle_id`, open and close time (UTC) and duration, net, R and
net %; plan vs fact for entry and exit with both slippages (positive = worse than plan; no
planned exit for `runtime_signal`), initial vs last stop and take; gross, entry fee, exit fee,
net, risk, R, price return % and net return %; quantity, notional, entry and exit fill counts and
attempts; and a schematic of the levels with entry and exit markers. The card SHALL use only the
row's stored values.

#### Scenario: Real Demo short
- **WHEN** the user opens `6072511f`
- **THEN** the card shows entry plan 80,484.0 vs fact 80,496.1 with slippage −0.015%, exit plan 80,744.7 (stop) vs fact 80,750.0 with +0.007%, net −1,307.99, R −1.378, fees 169.03 and 169.57

### Requirement: Loading, empty and error states

The panel SHALL show a loading state until the journal read answers, "No closed trades" for an
empty list, and on a journal read failure an error line with Retry that repeats both reads.

#### Scenario: Journal unavailable
- **WHEN** the journal read fails
- **THEN** an error line with Retry is shown and no summary or table is drawn

