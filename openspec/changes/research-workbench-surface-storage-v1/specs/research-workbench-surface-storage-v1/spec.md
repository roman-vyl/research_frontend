## ADDED Requirements

### Requirement: Storage block on Experiment cards

Each Experiment card in the Surface picker SHALL show the number of strategies (rows
of the result table), the number of Engine runs (rows with a non-empty `run_id`) and
the size on disk in GB. When the backend has no computed size the card SHALL show
"size not computed yet" and still show both counts.

#### Scenario: Replay surface

- **WHEN** an Experiment's table has 443 700 rows and no `run_id`
- **THEN** its card shows 443 700 strategies and 0 Engine runs.

#### Scenario: Size not yet computed

- **WHEN** the storage route answers with `size: null`
- **THEN** the card shows the counts and "size not computed yet".

### Requirement: Storage block on the opened Experiment

Opening an Experiment SHALL request its storage with `size=compute` and show the same
block under the title. The request SHALL NOT block loading the manifest or the heat
map. When some referenced run folders are missing the block SHALL show their number.

#### Scenario: Size after opening

- **WHEN** the user opens an Experiment and then returns to the picker
- **THEN** that Experiment's card shows its size in GB.

### Requirement: Cheap requests from the picker

The picker SHALL request storage only with `size=cached`, at most two requests at a
time, and SHALL NOT request it again for an Experiment already loaded in the session
unless that Experiment's runs were deleted. A failed request SHALL show "—" and SHALL
NOT prevent opening the card.

#### Scenario: Picker visit

- **WHEN** the picker is shown with six Experiments
- **THEN** six storage requests with `size=cached` are made and none with `size=compute`.

### Requirement: No run list request

The storage block SHALL NOT use `GET /api/research/runs` or any per-run route.

#### Scenario: Request log

- **WHEN** the picker and an opened Experiment are rendered in a test with mocked fetch
- **THEN** no request to `/api/research/runs` was made.
