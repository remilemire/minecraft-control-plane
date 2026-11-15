# Isolated crash drill

This opt-in harness controls **only its own disposable ARM64 QEMU/HVF VM**.
It needs macOS Apple Silicon, QEMU, Python 3.11+, SSH, and enough memory/disk
for two CPUs, 4 GiB RAM, and a persistent 32 GiB ext4 guest disk. Never point it
at production. Never restart Docker Desktop or another VM for these tests.

Keep VM disks, credentials, logs, and JSON evidence outside the checkout.
Use a private temporary directory and download the official Debian 12 generic
ARM64 qcow2 image plus `SHA512SUMS` from
<https://cloud.debian.org/images/cloud/bookworm/latest/>. Verify its SHA-512
against that official manifest; save the image as `base.qcow2` and the expected
hash alone as `image.sha512`. `bootstrap.py ROOT` rechecks it before every boot.
Cloud-init installs Docker from its
[official Debian repository](https://docs.docker.com/engine/install/debian/).
It creates temporary SSH keys and uses loopback-only SSH forwarding.
The disposable daemon enables `live-restore` so the daemon-only reconnect test
can retain the controller process. The daemon crash matrix separately kills
the test controller; VM termination kills the whole guest. Production's daemon
configuration is never changed by this harness or the deployment.

The persistent qcow2 overlay uses `cache=writeback,cache.no-flush=off` so guest
flushes remain enabled. See [QEMU cache documentation](https://www.qemu.org/docs/master/system/invocation.html).
No unsafe snapshot caching or global guest `sync` is used before fault injection.
The same disk is reopened after abrupt QEMU termination; this is not a reset to
an old VM snapshot. These tests exercise software/guest failure, not physical
storage hardware or every unsaved gameplay tick.

Build the production controller image inside the VM as `crash-controller:test`
using the current source (exclude credentials, `.env`, `.git`, live data, and
host build residue). Load the existing `itzg/minecraft-server:latest` ARM64 image
into the guest. Record its digest, the Debian image checksum, QEMU version,
`uname -r`, `findmnt /`, and Docker/package versions in `ROOT/evidence`.
Run `make build pkg=minecraft-controller` locally, then:

```sh
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT setup
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT prepare
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT trial \
  --fault vm --event moved:world --phase 'Replacing server data' --second
```

`prepare` creates a real Vanilla 1.21.1 world with a stone block and server-file
canary A, then makes a verified full backup. Each trial changes them to a gold
block and canary B. Before a durable completion, recovery must preserve B; after
completion (`--event committed --after`), it must preserve A. `--stopped` checks
that recovery leaves an originally stopped game stopped.

Test all three failures (`controller`, `docker`, `vm`) at these barriers:

| Barrier                           | Extra arguments                                      | Expected after recovery |
| --------------------------------- | ---------------------------------------------------- | ----------------------- |
| `staged-entry:server.properties`  |                                                      | B                       |
| `archive-entry:server.properties` | `--phase 'Creating and verifying the safety backup'` | B                       |
| `moved:world`                     | `--phase 'Replacing server data'`                    | B                       |
| `verification-boot`               |                                                      | B                       |
| `before-commit`                   |                                                      | B                       |
| `committed`                       | `--after`                                            | A                       |

The controller test worker is mounted separately from the production image.
Its read-only host-runtime directory mount matches production, so recreated
Docker sockets become visible to the surviving controller.
Its injected observers pause in memory; the production server never imports it
and exposes no fault-control route. The Docker failure kills the guest daemon
and the test controller process to exercise an interrupted transaction with
lost Docker access. Also test a transient daemon-only outage: release the
barrier while Docker is unavailable, verify `recoverOnReconnect`, reconnect,
and confirm the **existing** controller recovers without reapplying restore.

The harness attempts a Minecraft-first Docker start before recovery, checks that
PID 1 remains in the gate without Java, rejects conflicting APIs, checks readable
status, confirms original running/stopped state, verifies both canaries, and
checks retained safety-archive checksums. `--second` crashes the VM again while
rollback is moving the world back. JSON evidence records the exact checkpoint
and terminal result. Separately verify fresh challenges/stale permits, read-only
permit writes, wrong-container requests, controller unavailability, missing or
corrupt journals, unknown versions, and direct Compose starts during recovery.

After passing, stop only the test containers and this VM. Retain evidence outside
the checkout; the disposable disk may remain for inspection.

After the matrix, run the additional checks against the same disposable VM:

```sh
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT security
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT transient
python3 apps/minecraft-controller/test/crash-vm/run.py ROOT happy
```

`security` deliberately damages only the disposable journal, confirms startup
remains blocked, and restores its saved test state between cases. `transient`
kills only the guest Docker daemon and releases the test barrier while it is
unavailable; it verifies recovery by the same controller process after reconnect.
`happy` completes a normal restore with real block and server-file checks.
