"""Commands executed only inside the disposable VM (no production credentials)."""

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path("/home/drill/crash-drill")
CONFIG = ROOT / "config.json"


def docker(*args, check=True):
    return subprocess.run(
        ["docker", *args], check=check, capture_output=True, text=True
    ).stdout.strip()


def api(method, path, body=None, control=False):
    config = json.loads(CONFIG.read_text())
    local = os.environ.get("DRILL_API_LOCAL") == "1"
    port = (8999 if control else 8000) if local else (18999 if control else 18000)
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={
            "authorization": "Bearer " + config["token"],
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=660) as response:
            data = response.read()
            return {
                "status": response.status,
                "body": json.loads(data) if data else None,
            }
    except urllib.error.HTTPError as error:
        return {"status": error.code, "body": json.loads(error.read())}


def controller(barrier=None):
    docker("rm", "-f", "crash-drill-controller", check=False)
    config = json.loads(CONFIG.read_text())
    args = [
        "run",
        "-d",
        "--name",
        "crash-drill-controller",
        "--restart",
        "no",
        "-v",
        "/var/run:/docker-host-run:ro",
        "-v",
        str(ROOT / "data") + ":/server-data",
        "-v",
        str(ROOT / "dist") + ":/app/dist:ro",
        "-v",
        str(ROOT / "worker.mjs") + ":/app/worker.mjs:ro",
        "-p",
        "127.0.0.1:18000:8000",
        "-p",
        "127.0.0.1:18999:8999",
        "-e",
        "DRILL_TOKEN=" + config["token"],
    ]
    if barrier:
        args += ["-e", "DRILL_BARRIER=" + json.dumps(barrier)]
    return docker(*args, "crash-controller:test", "node", "worker.mjs")


def create_game():
    config = json.loads(CONFIG.read_text())
    settings = {
        "name": "crash-drill",
        "services": {
            "minecraft": {
                "image": "itzg/minecraft-server:latest",
                "container_name": "crash-drill-game",
                "restart": "unless-stopped",
                "mem_limit": "2g",
                "entrypoint": ["/bin/sh", "/startup-gate.sh"],
                "volumes": [
                    str(ROOT / "data/minecraft") + ":/data",
                    str(ROOT / "startup-gate.sh") + ":/startup-gate.sh:ro",
                    str(ROOT / "data/startup-gate/requests") + ":/startup-requests",
                    str(ROOT / "data/startup-gate/permits") + ":/startup-permits:ro",
                ],
                "environment": {
                    "EULA": "TRUE",
                    "TYPE": "VANILLA",
                    "VERSION": "1.21.1",
                    "MEMORY": "768M",
                    "ENABLE_RCON": "true",
                    "RCON_PASSWORD": config["rcon"],
                    "LEVEL": "world",
                    "VIEW_DISTANCE": "2",
                    "SIMULATION_DISTANCE": "2",
                    "MAX_TICK_TIME": "-1",
                },
            }
        },
    }
    path = ROOT / "compose.json"
    path.write_text(json.dumps(settings))
    path.chmod(0o600)
    owner = CONFIG.stat()
    os.chown(path, owner.st_uid, owner.st_gid)
    return docker(
        "compose",
        "-p",
        "crash-drill",
        "-f",
        str(path),
        "create",
        "--no-build",
        "--pull",
        "never",
        "minecraft",
    )


command = sys.argv[1]
if command == "api":
    print(
        json.dumps(
            api(
                sys.argv[2],
                sys.argv[3],
                json.loads(base64.b64decode(sys.argv[4]))
                if len(sys.argv) > 4 and sys.argv[4] != "-"
                else None,
                len(sys.argv) > 5 and sys.argv[5] == "control",
            )
        )
    )
elif command == "controller":
    print(controller(json.loads(sys.argv[2]) if len(sys.argv) > 2 else None))
elif command == "rcon":
    print(
        docker(
            "exec",
            "crash-drill-game",
            "rcon-cli",
            "--config",
            "/data/.rcon-cli.yaml",
            "--",
            sys.argv[2],
        )
    )
elif command == "file":
    path = ROOT / "data/minecraft/mods/crash-canary.txt"
    if len(sys.argv) > 2:
        path.parent.mkdir(exist_ok=True)
        with path.open("w") as output:
            output.write(sys.argv[2])
            output.flush()
            os.fsync(output.fileno())
    print(path.read_text())
elif command == "init":
    assert ROOT.is_dir() and CONFIG.exists()
    for name in ["minecraft", "startup-gate/requests", "startup-gate/permits"]:
        (ROOT / "data" / name).mkdir(parents=True, exist_ok=True)
    print(create_game())
    print(controller())
elif command == "recreate-game":
    assert (
        docker("inspect", "crash-drill-game", "--format", "{{.State.Running}}")
        == "false"
    )
    state = json.loads((ROOT / "data/backup-state/state.json").read_text())
    assert all(
        op["status"] in ["succeeded", "failed"] and op.get("cleanupComplete", True)
        for op in state["operations"]
    )
    docker("rm", "crash-drill-game")
    print(create_game())
