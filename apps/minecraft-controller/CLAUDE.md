# Minecraft controller

The controller is the only Docker and RCON execution authority. Compose creates
Minecraft; container lookup must use both project and service labels.

`composition.ts` constructs the shared state store, runtime, coordinator, services,
and typed task registry. It owns initialization/shutdown ordering, not workflows.

- `runtime/`: Docker transport, RCON execution, readiness, and shared server-data
  path policy. It cannot import backup, task, maintenance, or state modules.
- `maintenance/`: task-neutral admission/checkpoints/recovery, startup gate,
  operation status, and the independent Docker-reconnect recovery loop.
- `tasks/`: separate power, backup, and restore handlers; typed task journal
  variants; request creation; shared server checkpoints; restore file replacement.
  Each task defines its own recovery. Destructive restore requires verified safety.
- `backups/`: native archive IO, catalogue/compatibility, capture service, and
  scheduling/retention. It owns neither the coordinator nor power/RCON commands.
- `state/`: one atomic aggregate containing catalogue, schedules, and journal.
  Keep admission and schedule consumption in that same transaction. Do not split
  these into independently committed files. Existing schema-version-1 files and
  supported task versions remain readable; task-specific fields are discriminated
  by operation kind. Inconsistent restore checkpoints fail closed.
- `server/`: admitted power/console service and read-only status/log routes.
- `http/`: authentication, error mapping, and router composition.

External mutations go through the shared maintenance service; task handlers use
raw runtime adapters only while holding the coordinator's reservation. Reads and
logs remain available during active maintenance. ESLint enforces dependency
direction for runtime adapters, feature routes, and the generic maintenance engine.

Native snapshots use tar/gzip. FTB ZIP import/reading, migration commands, and
legacy setup gating are retired. Existing ZIP bytes and historical metadata are
left intact but omitted from the usable backup catalogue. The small historical
migration journal handler only recovers/cleans up interrupted old operations; it
never imports. Restore settings retain current credentials/access controls and
prevent older native snapshots from re-enabling the modpack backup scheduler.

Canonical operation/recovery routes live under `/maintenance`; existing
`/backups/operations/:id` and `/backups/recover` URLs remain compatibility aliases.
`make backup-recover` calls the running HTTP service via `maintenance/cli.ts`;
never start a second controller/scheduler against the same root.

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
Terminal results commit before cleanup; a committed restore must never roll back.
Task definitions are versioned and register preparation, safety, application,
verification, recovery, hold, and cleanup handlers. Recovery is task-specific.
Keep catalogue changes, schedules, and admission in the same aggregate state write.
Legacy journal entries use task version 0. Unknown versions hold startup.

`startup-gate/` is another data-root sibling. The read-only Minecraft entrypoint
wrapper sends its hostname and a fresh per-boot UUID; only the controller writes
the read-only permit mount after checking the expected managed container.
Production mounts host `/var/run` read-only at `/docker-host-run` and selects
its Docker socket there, so socket recreation does not strand a surviving
controller on an old inode. Docker Desktop dev keeps its direct socket mount.
Only the already Docker-privileged controller receives either mount.
Startup is blocked until initialization/recovery completes. Controlled task
boots require a durable safe checkpoint and exact container ID. Never give
Minecraft journal access or the controller token. Include this directory when
relocating the data root. Missing initialized journals fail closed.

Backup archives stream through tar/gzip with a file manifest and SHA-256 checks.
No extraction into live data. Reject traversal, links, devices, duplicate paths,
truncated data, checksum mismatches, and sources that change while being read.
Safety backups may preserve an already-damaged world, including a missing
`level.dat`; normal backups require a populated world.

Only scheduled archives enter retention. Each archive can belong to several
pools, and expires only when every active membership has expired. Manual and
safety backups require explicit deletion; retired ZIP files are never deleted
automatically. Schedule consumption is persisted with operation creation, so
missed runs collapse without a replay storm.

Use `make test pkg=minecraft-controller` for unit/HTTP tests. The opt-in
`pnpm --filter @minecraft-control-plane/minecraft-controller test:drill` creates
a disposable Docker container with a unique project label and temporary data,
tests actual Minecraft save/backup/restore/readiness, then removes only that
container. Set `BACKUP_DRILL_DOCKER_SOCKET` when the local socket is not
`/var/run/docker.sock`. It uses the cached `itzg/minecraft-server:latest` image and
downloads Minecraft 1.21.1 into its temporary directory.

For crash validation, use [test/crash-vm/README.md](test/crash-vm/README.md).
It uses its own QEMU/HVF Debian VM and Docker daemon, never Docker Desktop or
production for failure injection. Test-only observers block in memory at durable
checkpoints or archive/file progress. They are injected by the separate test
worker; production has no fault-control endpoint or environment switch.
