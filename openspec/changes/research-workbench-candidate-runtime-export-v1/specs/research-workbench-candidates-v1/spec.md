## MODIFIED Requirements

### Requirement: Spec snapshot is historical

When a record has a strategy spec snapshot, the details SHALL show it labelled as
the spec of the picked run at the time of the star, never as the current
specification of the point. The label SHALL say that "To Runtime" exports this stored
snapshot. The tab SHALL offer no trading action, and the only deployment action it
offers SHALL be the create-only export of a switched-off (`enabled: false`)
deployment file described by `research-workbench-candidate-runtime-export-v1`; it
SHALL NOT switch, edit or delete a deployment.

#### Scenario: Changed candidate with a spec

- **WHEN** a `changed` candidate with a spec snapshot is expanded
- **THEN** the spec is shown with the historical label.

#### Scenario: Export is the only deployment action

- **WHEN** the tab is rendered for any candidate
- **THEN** no action switches, edits or deletes a Runtime deployment.
