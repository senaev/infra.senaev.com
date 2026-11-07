- [x] Write Telegram/Alisa tasks directly to Obsidian instead of the old Supabase tasks table.

## Stage

Core architecture implemented; current production code routes task writes through Obsidian Sync.

## Evidence

- `cluster-helper/src/trickyDad/actions/addTasks.ts` invokes `addObsidianTasks`, which writes to the protected `POST /tasks` route in `obsidian-sync`.
- Original implementation notes mark changes complete; plugin cleanup in the separate Obsidian repository was documented historically but not independently rechecked in this audit.
