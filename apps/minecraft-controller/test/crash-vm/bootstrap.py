"""Boot an isolated, flush-honoring ARM64 Linux VM. Never controls Docker Desktop."""

import hashlib
import json
import shutil
import socket
import subprocess
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
expected = (root / "image.sha512").read_text().strip()
with (root / "base.qcow2").open("rb") as source:
    actual = hashlib.file_digest(source, "sha512").hexdigest()
assert actual == expected, "The Debian base image does not match its verified checksum."
if (root / "vm.json").exists():
    previous = json.loads((root / "vm.json").read_text())
    result = subprocess.run(
        ["ps", "-p", str(previous["pid"]), "-o", "command="],
        capture_output=True,
        text=True,
        check=False,
    )
    assert str(root / "disk.qcow2") not in result.stdout, (
        "This disposable VM is already running."
    )
if not (root / "ssh-key").exists():
    subprocess.run(
        ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(root / "ssh-key")],
        check=True,
    )
seed = root / "seed"
seed.mkdir(exist_ok=True)
configuration = {
    "users": [
        {
            "name": "drill",
            "sudo": "ALL=(ALL) NOPASSWD:ALL",
            "shell": "/bin/bash",
            "ssh_authorized_keys": [(root / "ssh-key.pub").read_text().strip()],
        }
    ],
    "ssh_pwauth": False,
    "runcmd": [
        [
            "bash",
            "-lc",
            """set -eux
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo 'deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable' > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker drill
systemctl enable --now docker
printf '{"live-restore":true}\n' > /etc/docker/daemon.json
systemctl reload docker
touch /var/lib/crash-drill-ready
""",
        ]
    ],
}
(seed / "user-data").write_text("#cloud-config\n" + json.dumps(configuration))
(seed / "meta-data").write_text(
    "instance-id: minecraft-crash-drill\nlocal-hostname: minecraft-crash-drill\n"
)
if not (root / "seed.iso").exists():
    subprocess.run(
        [
            "hdiutil",
            "makehybrid",
            "-iso",
            "-joliet",
            "-default-volume-name",
            "cidata",
            "-o",
            str(root / "seed.iso"),
            str(seed),
        ],
        check=True,
    )
if not (root / "disk.qcow2").exists():
    subprocess.run(
        [
            "qemu-img",
            "create",
            "-f",
            "qcow2",
            "-F",
            "qcow2",
            "-b",
            str(root / "base.qcow2"),
            str(root / "disk.qcow2"),
            "32G",
        ],
        check=True,
    )
    shutil.copyfile("/opt/homebrew/share/qemu/edk2-arm-vars.fd", root / "vars.fd")
if (root / "vm.json").exists():
    port = json.loads((root / "vm.json").read_text())["port"]
else:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
args = [
    "qemu-system-aarch64",
    "-machine",
    "virt",
    "-accel",
    "hvf",
    "-cpu",
    "host",
    "-smp",
    "2",
    "-m",
    "4096",
    "-nographic",
    "-drive",
    "if=pflash,format=raw,readonly=on,file=/opt/homebrew/share/qemu/edk2-aarch64-code.fd",
    "-drive",
    "if=pflash,format=raw,file=" + str(root / "vars.fd"),
    "-drive",
    "if=virtio,format=qcow2,cache=writeback,cache.no-flush=off,file="
    + str(root / "disk.qcow2"),
    "-drive",
    "if=virtio,format=raw,readonly=on,file=" + str(root / "seed.iso"),
    "-netdev",
    f"user,id=net0,hostfwd=tcp:127.0.0.1:{port}-:22",
    "-device",
    "virtio-net-pci,netdev=net0",
]
with (root / "serial.log").open("ab") as log:
    process = subprocess.Popen(
        args, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True
    )
(root / "vm.json").write_text(
    json.dumps({"pid": process.pid, "port": port, "args": args}, indent=2)
)
print(json.dumps({"pid": process.pid, "port": port}))
