## ADDED Requirements

### Requirement: Export a candidate to the Runtime catalog

Each Candidates row SHALL offer a "To Runtime" action. It SHALL be enabled only when
the candidate's strategy spec snapshot has a spec and `current.runtime` is
`{present: false}`. Activating it SHALL open a confirmation dialog, built on the
existing modal dialog pattern, that names the file Research will create, states that
it is created switched off (`enabled: false`) and that Research does not change it
afterwards. Confirming SHALL send `POST /api/research/candidates/{candidate_id}/runtime-export`
with no body and, after a successful response, SHALL load the candidate list again.
The action SHALL NOT be available again for the same candidate while a request is in
flight.

#### Scenario: First export

- **WHEN** the user confirms "To Runtime" for a candidate with a spec and no catalog file
- **THEN** one request without a body is sent
- **AND** the list is loaded again
- **AND** the row shows "In Runtime catalog · Off" with the file name.

#### Scenario: Cancelled confirmation

- **WHEN** the user closes the confirmation dialog without confirming
- **THEN** no request is sent.

### Requirement: Re-export is not offered

"To Runtime" SHALL be disabled, with the reason as its hint, when `current.runtime` is
`{present: true, ...}` (including a duplicate), when the snapshot has no spec
(`strategy_spec_snapshot.source` is null or the snapshot is absent), and when
`current.runtime` is null. For null with a spec the hint SHALL say the Runtime
catalog is unavailable.

#### Scenario: Already in the catalog

- **WHEN** `current.runtime` is `{present: true, file, enabled}`
- **THEN** "To Runtime" is disabled with a hint naming the file.

#### Scenario: Catalog unavailable

- **WHEN** `current.runtime` is null and the candidate has a spec
- **THEN** "To Runtime" is disabled with the hint that the Runtime catalog is unavailable.

### Requirement: The mark describes the catalog file only

The row SHALL show a mark derived only from `current.runtime`:
"In Runtime catalog · Off" when a file with `enabled` false exists, "In Runtime catalog · On"
when it exists with `enabled` true, each with the file name in its tooltip; for
`duplicate: true` a warning listing the file names and no On / Off value; nothing
for `{present: false}` or null. The Candidates tab SHALL NOT use wording that
implies the strategy is loaded, running, active or trading.

#### Scenario: File switched on outside Research

- **WHEN** `current.runtime` is `{present: true, file, enabled: true}`
- **THEN** the row shows "In Runtime catalog · On"
- **AND** the tab shows no "running", "active", "live" or "loaded" text.

#### Scenario: Duplicate

- **WHEN** `current.runtime.duplicate` is true
- **THEN** the row shows a warning that lists the files.

### Requirement: Export errors are readable

Export failures SHALL be shown through the existing `ApiError` path, with the text
chosen by the backend error code: for `runtime_duplicate` and `runtime_file_exists`
the existing file name, and for `runtime_export_busy`, `runtime_write_failed`,
`runtime_publish_failed`, `runtime_invalid_name`, `runtime_catalog_unconfigured` and
`runtime_catalog_unavailable` a failure stating that nothing was exported. After
`runtime_duplicate` or `runtime_file_exists` the list SHALL be loaded again. A
success response with `journal` `"failed"` SHALL be shown as exported, with a note
that the journal line was not written.

#### Scenario: Duplicate created by hand

- **WHEN** the export answers 409 `runtime_duplicate`
- **THEN** the message names the existing file
- **AND** the list is loaded again.

#### Scenario: Journal not written

- **WHEN** the export answers 201 with `journal` `"failed"`
- **THEN** the row shows the file as in the catalog
- **AND** a note says the journal line was not written.

### Requirement: Export is the only deployment action

The tab SHALL NOT switch, edit or delete a Runtime deployment, SHALL NOT read
Strategy Runtime state, and SHALL NOT call any API other than the export route for
this feature.

#### Scenario: Row actions

- **WHEN** a candidate is already in the catalog
- **THEN** the row offers no action that changes the file.
