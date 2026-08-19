# Galaxy Command Save Format

Galaxy Command stores campaigns in a schema-versioned JSON envelope. Save schema versions are independent from the visible game release number and make migrations explicit as campaign state evolves.

## Current envelope

Schema version 3 has this top-level shape:

```json
{
  "schemaVersion": 3,
  "savedAt": "2026-08-19T12:00:00.000Z",
  "state": {
    "version": 3,
    "seed": 1337,
    "turn": 1,
    "year": 1,
    "playerFaction": "aurora",
    "factions": {},
    "planets": {},
    "fleets": {},
    "armies": {},
    "technologies": {},
    "diplomacy": {
      "aurora::independent": {
        "factions": ["aurora", "independent"],
        "opinion": 10,
        "trust": 53,
        "threat": 30,
        "stance": "NEUTRAL",
        "atWar": false,
        "lastActions": {},
        "modifiers": []
      }
    },
    "events": [],
    "history": [],
    "lastTurnReport": null
  }
}
```

`savedAt` is envelope metadata. Deterministic gameplay and replay behavior derive from `state`, including its seed and turn number.

## Validation and compatibility

- Every current-schema save is validated against the game-state invariants before it is written or loaded.
- Schema versions newer than the running build are rejected without changing the active campaign.
- Malformed JSON, missing campaign state, invalid ranges, unknown factions, and inconsistent fleet movement state are rejected.
- Raw version 1 state and schema version 1 envelopes migrate to version 2 by adding planet, fleet, event, history, and turn-report fields.
- Version 2 state then migrates to version 3 by creating canonical bilateral diplomacy records and synchronizing legacy war lists.
- A current-schema save is never silently repaired; missing or invalid version 3 fields are treated as corruption.

## Browser storage and recovery

Each named slot uses these keys:

```text
galaxy-command-save-v3:<slot>
galaxy-command-save-v3:<slot>:pending
galaxy-command-save-v3:<slot>:recovery
```

Saving follows a recovery-safe sequence:

1. Serialize and validate the new campaign.
2. Write it to the pending key.
3. Copy the existing committed save to the recovery key.
4. Replace the committed save.
5. Remove the pending key.

If a storage write fails, the committed last-known-good save remains available. Loading tries the committed copy, then recovery, then the legacy version 2 and version 1 keys. If candidates exist but none validate, loading reports a recoverable error and leaves the active campaign unchanged.

The default `autosave` slot is updated after each completed turn. The persistence API also accepts named slots for future campaign-slot interfaces.

## Import and export

Export produces the same version 3 JSON envelope used by browser storage. Import migrates and validates the complete payload before writing the selected slot or applying it to the active campaign.

Persistence behavior is covered in `test/save.test.js`, with a browser smoke path in `test/browser/app.spec.js`.
