"""Host orchestrator: abrupt failures affect only the VM recorded in vm.json."""

import argparse
import base64
import datetime
import json
import os
import shlex
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
parser.add_argument(
    "command",
    choices=["setup", "prepare", "trial", "check", "security", "transient", "happy"],
)
parser.add_argument(
    "--fault", choices=["controller", "docker", "vm"], default="controller"
)
parser.add_argument("--event", default="moved:world")
parser.add_argument("--phase")
parser.add_argument("--stopped", action="store_true")
parser.add_argument("--second", action="store_true")
parser.add_argument("--second-event", choices=["moved:world", "moved:mods"], default="moved:world")
parser.add_argument("--after", action="store_true")
args = parser.parse_args()
root = args.root.resolve()
vm = json.loads((root / "vm.json").read_text())
evidence = root / "evidence"
evidence.mkdir(exist_ok=True)
ssh = [
    "ssh",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=5",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=" + str(root / "known_hosts"),
    "-i",
    str(root / "ssh-key"),
    "-p",
    str(vm["port"]),
    "drill@127.0.0.1",
]


def remote(command, check=True):
    result = subprocess.run(
        ssh + [command], check=False, capture_output=True, text=True
    )
    if check and result.returncode:
        raise RuntimeError(command + "\n" + result.stdout + result.stderr)
    return result.stdout.strip()


def guest(*parts):
    return remote(
        "python3 /home/drill/crash-drill/guest.py " + shlex.join(map(str, parts))
    )


def api(method, path, body=None, control=False):
    payload = (
        base64.b64encode(json.dumps(body).encode()).decode()
        if body is not None
        else "-"
    )
    return json.loads(
        guest("api", method, path, payload, "control" if control else "api")
    )


def wait(action, timeout=660):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            result = action()
            if result:
                return result
        except (RuntimeError, OSError, json.JSONDecodeError) as error:
            last = error
        time.sleep(0.3)
    raise TimeoutError(str(last))


def ready():
    return wait(lambda: api("GET", "/", control=True)["body"]["initialized"])


def checked(method, path, body=None):
    result = api(method, path, body)
    assert result["status"] < 300, result
    return result["body"]


def finish(operation):
    def terminal():
        operation_state = checked("GET", "/backups/operations/" + operation)
        return operation_state if operation_state["status"] != "running" else None

    return wait(terminal)


def fault(kind, kill_controller=True):
    if kind == "controller":
        remote("docker kill --signal KILL crash-drill-controller")
    elif kind == "docker":
        controller_pid = remote(
            'docker inspect crash-drill-controller --format "{{.State.Pid}}"'
        )
        # Stop socket activation; kill the daemon, not the guest or any host daemon.
        remote(
            "sudo mkdir -p /run/systemd/system/docker.service.d && printf '[Service]\\nRestart=no\\n' | sudo tee /run/systemd/system/docker.service.d/crash-drill.conf >/dev/null && sudo systemctl daemon-reload && sudo systemctl kill --kill-whom=main --signal=SIGKILL docker.service && sudo systemctl stop docker.socket"
        )
        wait(
            lambda: remote("pgrep -x dockerd >/dev/null || echo stopped", check=False),
            15,
        )
        if kill_controller:
            remote("sudo kill -KILL " + controller_pid)
    else:
        current = json.loads((root / "vm.json").read_text())
        pid = current["pid"]
        command = subprocess.check_output(
            ["ps", "-p", str(pid), "-o", "command="], text=True
        )
        assert str(root / "disk.qcow2") in command and "qemu-system-aarch64" in command
        os.kill(pid, signal.SIGKILL)
        time.sleep(1)


def reconnect(kind):
    if kind == "vm":
        subprocess.run([sys.executable, str(HERE / "bootstrap.py"), str(root)], check=True)
        wait(lambda: remote("echo ready", check=False) == "ready", 120)
    if kind in ["vm", "docker"]:
        remote("sudo systemctl start docker.service docker.socket")
        wait(
            lambda: remote('docker info --format "{{.ServerVersion}}"', check=False), 60
        )
    # Controller restart policy is "no"; explicit game-first startup must wait.
    remote("docker stop crash-drill-game")
    remote("docker start crash-drill-game")
    before = remote(
        "docker exec crash-drill-game sh -c 'cat /startup-requests/current; cat /proc/1/cmdline'"
    )
    assert "/startup-gate.sh" in before, before
    assert "java" not in remote("docker top crash-drill-game -eo pid,comm")
    remote("docker stop crash-drill-game")
    remote(
        "docker compose -p crash-drill -f /home/drill/crash-drill/compose.json start minecraft"
    )
    after = remote(
        "docker exec crash-drill-game sh -c 'cat /startup-requests/current; cat /proc/1/cmdline'"
    )
    assert "/startup-gate.sh" in after and after != before
    assert "java" not in remote("docker top crash-drill-game -eo pid,comm")
    return {"docker": before, "compose": after}


def prepare():
    ready()
    checked("POST", "/start")
    guest("rcon", "forceload add 0 0")
    time.sleep(1)
    guest("rcon", "setblock 0 100 0 minecraft:stone")
    guest("file", "archived-A")
    backup = finish(
        checked("POST", "/backups", {"requestId": str(uuid.uuid4())})["operationId"]
    )
    assert backup["status"] == "succeeded", backup
    (root / "backup.json").write_text(json.dumps(backup))
    print("Prepared archive A", backup["backupId"], flush=True)


def reset():
    checked("POST", "/start")
    guest("rcon", "setblock 0 100 0 minecraft:gold_block")
    guest("rcon", "save-all flush")
    guest("file", "pre-task-B")
    assert "Test passed" in guest(
        "rcon", "execute if block 0 100 0 minecraft:gold_block"
    )
    if args.stopped:
        checked("POST", "/stop")


def trial():
    ready()
    reset()
    backup = json.loads((root / "backup.json").read_text())["backupId"]
    arm = {"kind": "restore", "event": args.event}
    if args.phase:
        arm["phase"] = args.phase
    api("POST", "/", arm, True)
    op = checked(
        "POST", "/backups/" + backup + "/restore", {"requestId": str(uuid.uuid4())}
    )["operationId"]
    reached = wait(lambda: api("GET", "/", control=True)["body"]["reached"])
    assert reached["id"] == op, reached
    if args.event == "verification-boot":
        assert reached["checkpoint"] == "boot-safe", reached
        assert reached["phase"] == "Starting Minecraft and checking readiness", reached
        assert reached["replacementComplete"] and reached["liveDataSafe"], reached
        wait(lambda: "java" in remote("docker top crash-drill-game -eo pid,comm"))
    elif args.event.startswith("staged-entry:"):
        assert reached["checkpoint"] == "staging", reached
        assert not reached["replacementStarted"], reached
    elif args.event.startswith("archive-entry:"):
        assert reached["checkpoint"] == "safety-planned", reached
        assert reached["stoppedByOperation"] and not reached["safetyVerified"], reached
    elif args.event.startswith("moved:"):
        assert reached["checkpoint"] == args.event, reached
        assert reached["replacementStarted"] and not reached["liveDataSafe"], reached
    elif args.event in ["before-commit", "committed"]:
        assert reached["replacementComplete"] and reached["liveDataSafe"], reached
        assert reached["status"] == ("succeeded" if args.event == "committed" else "running"), reached
    # The debugger pauses the actual production process. Read/exclusion behavior
    # is verified by the real HTTP integration suite while the process runs.
    conflicts = "verified by the default HTTP integration suite"
    log = {
        "fault": args.fault,
        "barrier": reached,
        "originallyStopped": args.stopped,
        "conflicts": conflicts,
        "startedAt": datetime.datetime.now(datetime.UTC).isoformat(),
    }
    print(
        "Injecting",
        args.fault,
        args.event,
        args.phase or "",
        "stopped=" + str(args.stopped),
        flush=True,
    )
    log["controllerBefore"] = remote(
        "docker logs --tail 40 crash-drill-controller 2>&1"
    )
    path = evidence / (str(time.time_ns()) + "-" + args.fault + ".json")
    path.write_text(json.dumps(log, indent=2))
    fault(args.fault)
    log["startupAttempts"] = reconnect(args.fault)
    barrier = (
        {
            "kind": "restore",
            "event": args.second_event,
            "phase": "Recovering the pre-restore data",
        }
        if args.second
        else None
    )
    guest("controller", json.dumps(barrier)) if barrier else guest("controller")
    if args.second:
        second = wait(lambda: api("GET", "/", control=True)["body"]["reached"])
        log["secondInterruption"] = second
        fault("vm")
        log["secondStartupAttempts"] = reconnect("vm")
        guest("controller")
    ready()
    result = finish(op)
    log["result"] = result
    expected = "archived-A" if args.after else "pre-task-B"
    log["fileCanary"] = guest("file")
    assert log["fileCanary"] == expected, log
    running = (
        remote('docker inspect crash-drill-game --format "{{.State.Running}}"')
        == "true"
    )
    assert running == (not args.stopped), (running, args.stopped)
    if args.stopped:
        checked("POST", "/start")
    block = "stone" if args.after else "gold_block"
    output = wait(lambda: guest("rcon", "execute if block 0 100 0 minecraft:" + block))
    assert "Test passed" in output, output
    log["worldCanary"] = output
    assert result["status"] == ("succeeded" if args.after else "failed"), result
    preview = checked("GET", "/backups/" + backup + "/restore-preview")
    assert preview["canRestore"], preview
    state = api("GET", "/", control=True)["body"]["state"]
    safety = result["safetyBackupId"]
    if safety:
        record = next((item for item in state["backups"] if item["id"] == safety), None)
        if record is None:
            assert not reached["replacementStarted"]
            safety = None
    if safety:
        digest = remote(
            "sudo sha256sum "
            + shlex.quote(
                "/home/drill/crash-drill/data/backups/" + safety + "/archive.tar.gz"
            )
        ).split()[0]
        assert digest == record["sha256"]
        log["safetyChecksum"] = digest
    log["completedAt"] = datetime.datetime.now(datetime.UTC).isoformat()
    log["controllerAfter"] = remote("docker logs --tail 40 crash-drill-controller 2>&1")
    path.write_text(json.dumps(log, indent=2))
    print("PASS", args.fault, args.event, expected, result["status"], flush=True)


def no_java():
    assert "java" not in remote("docker top crash-drill-game -eo pid,comm")
    return True


def security():
    ready()
    checked("POST", "/start")
    old = wait(
        lambda: remote(
            "sudo cat /home/drill/crash-drill/data/startup-gate/permits/current"
        )
    )
    remote("docker kill --signal KILL crash-drill-controller")
    assert "players online" in guest("rcon", "list")
    remote("docker stop crash-drill-game && docker start crash-drill-game")
    wait(no_java, 10)
    fresh = remote(
        "sudo cat /home/drill/crash-drill/data/startup-gate/requests/current"
    )
    assert old != fresh
    # Even container root cannot write through the read-only authorization mount.
    denied = remote(
        "docker exec crash-drill-game sh -c 'echo forbidden > /startup-permits/forbidden' 2>&1",
        check=False,
    )
    assert "Read-only file system" in denied, denied
    request_path = "/home/drill/crash-drill/data/startup-gate/requests/current"
    remote(
        "printf 'wrong-container\\n00000000-0000-0000-0000-000000000000\\n' | sudo tee "
        + request_path
        + " >/dev/null"
    )
    guest("controller")
    ready()
    time.sleep(0.5)
    no_java()
    remote(
        "printf '%s\\n' "
        + shlex.quote(fresh)
        + " | sudo tee "
        + request_path
        + " >/dev/null"
    )
    checked("POST", "/start")
    for damage in ["unknown-version", "corrupt", "missing"]:
        checked("POST", "/stop")
        remote("docker kill --signal KILL crash-drill-controller")
        remote(
            "sudo cp /home/drill/crash-drill/data/backup-state/state.json /home/drill/crash-drill/saved-state.json"
        )
        code = "from pathlib import Path; import json; p=Path('/home/drill/crash-drill/data/backup-state/state.json'); "
        if damage == "unknown-version":
            code += "s=json.loads(p.read_text()); s['operations'][-1]['taskVersion']=99; p.write_text(json.dumps(s))"
        elif damage == "corrupt":
            code += "p.write_text('corrupt journal')"
        else:
            code += "p.unlink()"
        remote("sudo python3 -c " + shlex.quote(code))
        remote("docker start crash-drill-game")
        guest("controller")
        wait(
            lambda: (
                remote(
                    'docker inspect crash-drill-controller --format "{{.State.Running}}"'
                )
                == "false"
            ),
            20,
        )
        time.sleep(0.5)
        no_java()
        logs = remote("docker logs crash-drill-controller 2>&1")
        (evidence / (damage + ".log")).write_text(logs)
        assert remote(
            "sudo cat /home/drill/crash-drill/data/minecraft/mods/crash-canary.txt"
        )
        remote(
            "sudo cp /home/drill/crash-drill/saved-state.json /home/drill/crash-drill/data/backup-state/state.json"
        )
        guest("controller")
        ready()
        checked("POST", "/start")
    result = {
        "controllerUnavailability": True,
        "runningGameContinues": True,
        "freshChallenge": True,
        "stalePermitRejected": True,
        "readOnlyMount": denied,
        "wrongContainerRejected": True,
        "unknownVersionBlocked": True,
        "corruptStateBlocked": True,
        "missingInitializedStateBlocked": True,
    }
    (evidence / "startup-security.json").write_text(json.dumps(result, indent=2))
    print("PASS startup security and uncertain-state fencing", flush=True)


def transient():
    ready()
    reset()
    backup = json.loads((root / "backup.json").read_text())["backupId"]
    controller_pid = remote(
        'docker inspect crash-drill-controller --format "{{.State.Pid}}"'
    )
    production_pid = api("GET", "/", control=True)["body"]["productionPid"]
    api(
        "POST",
        "/",
        {"kind": "restore", "event": "moved:world", "phase": "Replacing server data"},
        True,
    )
    operation = checked(
        "POST", "/backups/" + backup + "/restore", {"requestId": str(uuid.uuid4())}
    )["operationId"]
    wait(lambda: api("GET", "/", control=True)["body"]["reached"])
    fault("docker", False)
    # The daemon's host-port proxy disappears, but the controller survives.
    # Enter only its network namespace to release the external debugger pause.
    local_api = (
        "sudo nsenter -t "
        + controller_pid
        + " -n env DRILL_API_LOCAL=1 python3 /home/drill/crash-drill/guest.py api "
    )
    release = base64.b64encode(json.dumps({"release": True}).encode()).decode()
    remote(local_api + "POST / " + release + " control")

    def waiting():
        state = json.loads(
            remote("sudo cat /home/drill/crash-drill/data/backup-state/state.json")
        )
        op = next(op for op in state["operations"] if op["id"] == operation)
        return op if op["recoverOnReconnect"] else None

    blocked = wait(waiting, 30)
    assert blocked["status"] == "running"
    assert json.loads(remote(local_api + "POST /start - api"))["status"] == 409
    remote("sudo systemctl start docker.service docker.socket")
    result = finish(operation)
    assert result["status"] == "failed", result
    assert guest("file") == "pre-task-B"
    assert "Test passed" in guest(
        "rcon", "execute if block 0 100 0 minecraft:gold_block"
    )
    assert (
        remote('docker inspect crash-drill-controller --format "{{.State.Pid}}"')
        == controller_pid
    )
    assert api("GET", "/", control=True)["body"]["productionPid"] == production_pid
    (evidence / "docker-reconnect.json").write_text(
        json.dumps(
            {"waiting": blocked, "result": result, "sameControllerProcess": True},
            indent=2,
        )
    )
    print("PASS transient Docker reconnect recovers without replay", flush=True)


def happy():
    ready()
    reset()
    backup = json.loads((root / "backup.json").read_text())["backupId"]
    result = finish(
        checked(
            "POST", "/backups/" + backup + "/restore", {"requestId": str(uuid.uuid4())}
        )["operationId"]
    )
    assert result["status"] == "succeeded", result
    assert guest("file") == "archived-A"
    assert "Test passed" in guest("rcon", "execute if block 0 100 0 minecraft:stone")
    assert checked("GET", "/backups/" + backup + "/restore-preview")["canRestore"]
    (evidence / "happy-path.json").write_text(json.dumps(result, indent=2))
    print("PASS real-world happy-path restore", flush=True)


if args.command == "setup":
    remote("mkdir -p /home/drill/crash-drill")
    config = {"token": str(uuid.uuid4()), "rcon": str(uuid.uuid4())}
    (root / "config.json").write_text(json.dumps(config))
    os.chmod(root / "config.json", 0o600)
    files = [
        (HERE / "guest.py", "guest.py"),
        (HERE / "worker.mjs", "worker.mjs"),
        (HERE.parents[3] / "docker/minecraft/startup-gate.sh", "startup-gate.sh"),
        (root / "config.json", "config.json"),
    ]
    # The compiled code runs with the image's exact production dependency tree.
    subprocess.run(
        ["tar", "-czf", str(root / "dist.tar.gz"), "-C", str(HERE.parents[1]), "dist"],
        check=True,
    )
    files.append((root / "dist.tar.gz", "dist.tar.gz"))
    for source, target in files:
        subprocess.run(
            [
                "scp",
                *ssh[1:-3],
                "-P",
                str(vm["port"]),
                str(source),
                "drill@127.0.0.1:/home/drill/crash-drill/" + target,
            ],
            check=True,
        )
    remote(
        "cd /home/drill/crash-drill && tar -xzf dist.tar.gz && chmod 600 config.json"
    )
    print(guest("init"))
    ready()
elif args.command == "prepare":
    prepare()
elif args.command == "trial":
    trial()
elif args.command == "security":
    security()
elif args.command == "transient":
    transient()
elif args.command == "happy":
    happy()
else:
    print(json.dumps(api("GET", "/", control=True), indent=2))
