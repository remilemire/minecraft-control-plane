# Minecraft controller

The controller is the only Docker and RCON execution authority. Compose still
creates the Minecraft container; lookup must use both project and service labels.
All power operations, backup/restore work, and panel RCON commands go through
`BackupManager`. Never add a route that bypasses that coordinator for mutations.
Logs and Docker status remain readable during maintenance.

`backups/` separates archive IO, scheduling/retention, installation version checks,
the persistent journal, migration, and orchestration. The controller uses one
process against one data root. CLI migration and recovery call the running HTTP
coordinator rather than starting a second scheduler or writing the journal directly.

`MINECRAFT_DATA_ROOT` in the root `.env` selects an absolute host directory for
all persistent Minecraft data. Compose defaults to `./data` when it is unset,
mounts that parent at `/server-data` in the controller, and mounts only its
`minecraft` child at `/data` in Minecraft. The controller's process env pins
`MINECRAFT_DATA_ROOT=/server-data`; host development reads the configured host
path directly and otherwise defaults to the repository's data directory.

Archives (`backups`), state (`backup-state`), and restore staging
(`backup-recovery`) are siblings of `minecraft`. Live data and recovery staging
must share a filesystem for atomic renames. Keep the common parent intact when
relocating storage, including its journal and catalogue; never move it while an
operation or Minecraft is running. Recreate the stopped containers after changing
the host path so their bind mounts use the new location.

Operation intent must be durably recorded before disabling saving/restarts or
moving files. A failed state write must not release the maintenance gate.
Restore keeps the mount root itself in place and journals changes to its children.
Do not delete rollback data before a successful operation record is durable.
On restart, interrupted restore work rolls back before new mutations are accepted.

Backup archives stream through tar/gzip with a file manifest and SHA-256 checks.
No extraction into live data. Reject traversal, links, devices, duplicate paths,
truncated data, checksum mismatches, and sources that change while being read.
Safety backups may preserve an already-damaged world, including a missing
`level.dat`; normal backups require a populated world.

Only scheduled archives enter retention. Each archive can belong to several
pools, and expires only when every active membership has expired. Manual, safety,
and imported legacy backups require explicit deletion. Schedule consumption is
persisted with operation creation, so missed runs collapse without a replay storm.

Use `make test pkg=minecraft-controller` for unit/HTTP tests. The opt-in
`pnpm --filter @minecraft-control-plane/minecraft-controller test:drill` creates
a disposable Docker container with a unique project label and temporary data,
tests actual Minecraft save/backup/restore/readiness, then removes only that
container. Set `BACKUP_DRILL_DOCKER_SOCKET` when the local socket is not
`/var/run/docker.sock`. It uses the cached `itzg/minecraft-server:latest` image and
downloads Minecraft 1.21.1 into its temporary directory.
