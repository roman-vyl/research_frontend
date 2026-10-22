## MODIFIED Requirements

### Requirement: The tab changes Runtime only through the enable switch
The Runtime Dashboard SHALL send `GET` requests, the enable switch's `PUT`, the trash button's `DELETE` and the Research episode history `POST` (a read-only route that changes no state), and nothing else, and SHALL NOT poll.

#### Scenario: Only the allowed mutation
- **WHEN** the tab is used (open, refresh, retry, switch, delete, select a strategy)
- **THEN** every request has method `GET`, except the switch's `PUT` to `/runtime-api/v1/strategy-instances/{id}/enabled`, the confirmed `DELETE` to `/runtime-api/v1/strategy-instances/{id}` and the `POST` to `/api/market/ema-stack-episodes/history`
