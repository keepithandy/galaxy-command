# Phase 4 — Factions & Diplomacy

Phase 4 is delivered in small deterministic slices so every new diplomatic rule remains save-compatible, replayable, and testable.

## Delivered slices

- **4A — Relationships and actions:** canonical bilateral records, opinion, trust, threat, stances, diplomatic actions, cooldowns, drift, synchronized war state, invariants, and HUD controls.
- **4B — Treaties and peace:** next-turn proposal resolution, non-aggression pacts, alliances, expiry, treaty breaking, declarations of war, negotiated peace, migration, and HUD controls.
- **4C — Vassalage:** alliance-gated proposals, deterministic acceptance, one overlord per subject, no hierarchy chains, subject diplomacy restrictions, controlled release, independence after a minimum term, independence wars, migration, invariants, and HUD controls.

Vassalage is a permanent bilateral status rather than an expiring treaty. Establishing it supersedes treaties between the overlord and subject and ends the subject's independent treaties and pending offers. Subjects cannot independently propose treaties or participate in ordinary war declarations. An overlord may release a subject at any time; a subject may declare independence after three turns, which ends vassalage and begins a war.

Economic tribute is intentionally deferred to Phase 5, where it can use the shared economy and income model.

## Next slice

Phase 4D adds autonomous diplomatic AI. AI decisions must use the same public availability and action APIs as the player, process factions in stable order, remain deterministic for a given campaign state, and emit visible events for every action.
