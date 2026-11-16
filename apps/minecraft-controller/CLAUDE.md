# Minecraft controller

The controller is the only Docker and RCON execution authority. Compose creates
Minecraft; container lookup must use both project and service labels.

`composition.ts` constructs the shared state store, runtime, coordinator, services,
and typed task registry. It owns initialization/shutdown ordering, not workflows.

- `runtime/`: Docker transport, RCON execution, semantic saving/player commands,
  readiness, and log streams. It cannot import application feature modules,
  maintenance, or state.
- `maintenance/`: task-neutral admission/checkpoints/recovery, startup gate,
  operation status, and the independent Docker-reconnect recovery loop.
- `server/`: public admitted power/console API, trusted server lifecycle
  capabilities, shared server checkpoints, and the power task definitions.
- `backups/`: public backup API, separate backup/restore task definitions, native
  archive IO, snapshot catalogue service, and scheduling/retention. It orchestrates
  server/data capabilities; it never handles Docker directly.
- `server-data/`: staging, preserved settings, child-entry replacement, rollback,
  and workspace cleanup. It knows neither Docker nor the journal/catalogue.
- `installation/`: installation/version discovery, compatibility and pinned
  startup-selector validation. JAR metadata parsing is unrelated to ZIP backups.
- `data/` and `filesystem/`: pure snapshot path policy and durable file primitives.
- `state/`: one atomic aggregate containing catalogue, schedules, and journal.
  Keep admission and schedule consumption in that same transaction. Do not split
  these into independently committed files. Schema 1 native journals decode once
  into schema 2 typed task data. Inconsistent checkpoints fail closed. The store
  clones inside its commit queue, validates, writes/fsyncs, then publishes frozen
  detached views. Failed writes retain the last published state and fence writes
  until explicit recovery reopens and validates durable storage.
- `http/`: authentication, error mapping, and router composition.

External mutations go through the shared maintenance service. Tasks receive
expiring execution leases and typed checkpoint ports, never a mutable state draft.
The composition root returns only public server/backup/maintenance APIs; trusted
capture and lifecycle capabilities remain private. Cross-module imports go through
the owning module's `service.ts`, from another service. ESLint enforces this and
the generic engine/runtime dependency direction. Reads and logs remain available
during active work. Whitelist delivery remains deferred by admission conflicts.

`transaction.ts` defines opaque commit effects. Only the state service can create
and apply them: catalogue updates and consumed schedule times can join operation
admission/checkpoints in the same aggregate write without exposing its draft.

Native snapshots use tar/gzip. FTB ZIP import/reading, migration commands, and
legacy setup gating are retired. Existing ZIP bytes and historical metadata are
left intact but omitted from the usable backup catalogue. Completed migration
records remain read-only history. An unfinished retired migration blocks the
upgrade and must be recovered with the previous release; there is no migration
executor in this controller. Restore settings retain current credentials/access controls and
prevent older native snapshots from re-enabling the modpack backup scheduler.

Before a release upgrade, retain a consistent copy of `backup-state` with the
controller and Minecraft stopped and every operation durably terminal/cleaned.
Initialization upgrades schema 1 in place to schema 2; older releases cannot read
the new format. A code downgrade therefore needs a compatible state format and
proof that no unfinished work or newer catalogue changes will be discarded.
Never copy a stale journal over an active or uncertain operation.

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
Supported flat native journal versions 0/1 decode to current task version 2.
Unknown versions hold startup. Before rollback boots Minecraft, it verifies the
recovered files against the safety manifest. A committed operation only retries
cleanup; it never repeats its destructive application or rolls back success.

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

Use `make check pkg=minecraft-controller` for formatting, lint, types, and tests.
Default tests use the actual HTTP/service/coordinator/task/filesystem assembly.
Only external Minecraft/container behavior and time are simulated. Docker adapter
tests use the real Docker SDK against a local protocol server. Tests must not
replace business modules, expose test-only production controls, or cast invented
objects into the SDK's classes. The opt-in
`pnpm --filter @minecraft-control-plane/minecraft-controller test:drill` creates
a disposable Docker container with a unique project label and temporary data,
tests actual Minecraft save/backup/restore/readiness, then removes only that
container. Set `BACKUP_DRILL_DOCKER_SOCKET` when the local socket is not
`/var/run/docker.sock`. It uses the cached `itzg/minecraft-server:latest` image and
downloads Minecraft 1.21.1 into its temporary directory.

For crash validation, use [test/crash-vm/README.md](test/crash-vm/README.md).
It uses its own QEMU/HVF Debian VM and Docker daemon, never Docker Desktop or
production for failure injection. A separate worker launches the unchanged
`dist/server.js` entrypoint and pauses it with external V8 debugger breakpoints.
Production has no test callbacks, fault-control endpoint, or fault environment
switch. A paused process cannot serve HTTP; default integration tests verify
read/exclusion behavior while workflows are running.
