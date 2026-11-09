"""Linux launcher acceptance checks using isolated local services, not the real DB/MQTT."""

import os
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

SOURCE = Path(__file__).resolve().parents[1]
SUPPORTED = sys.platform == "linux" and all(
    shutil.which(tool) for tool in ("bash", "node", "flock", "python3")
)

FAKE_PYTHON = r"""
import json, os, sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
root = Path(__file__).resolve().parents[1]
args = sys.argv[1:]
if args == ["-B", "scripts/check_python_dependencies.py"]:
    broken = (root / ".broken-python").exists()
    ready = (root / ".python-ready").exists() and not broken
    print(json.dumps({"ready": ready, "packages": [{"name":"fastapi", "installed":"0.120.0" if ready or broken else None, "expected":">=0.115", "status":"OK" if ready else "BROKEN" if broken else "MISSING"}], "problems":[], "repair":["fastapi==0.120.0"] if broken else []}))
    raise SystemExit(0 if ready else 1)
if args[:2] == ["-m", "pip"]:
    with (root / ".calls").open("a") as stream: stream.write("pip " + " ".join(args[2:]) + "\n")
    if "--force-reinstall" in args:
        (root / ".broken-python").unlink(missing_ok=True)
    else:
        (root / ".python-ready").touch()
    raise SystemExit(0)
if args[:2] in (["-m", "app.check_setup"], ["-m", "alembic"]):
    with (root / ".calls").open("a") as stream: stream.write(args[1] + "\n")
    raise SystemExit(0)
if args[:2] == ["-m", "uvicorn"]:
    if os.environ.get("TEST_API_FAILURE"): raise SystemExit(3)
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
            self.wfile.write(b'{"status":"ok","service":"sproutsync-api"}')
        def log_message(self, *args): pass
    HTTPServer.allow_reuse_address = True
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
os.execv(sys.executable, [sys.executable] + args)
"""


@unittest.skipUnless(
    SUPPORTED, "Requires Linux, Bash, Node.js, Python 3.12+, and flock"
)
class LinuxLauncherTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(
            prefix="sproutsync linux launchers "
        )
        self.root = Path(self.temporary.name)
        self.launcher = None
        self.log = None
        for relative in (
            "start.sh",
            "stop.sh",
            "verify.sh",
            "scripts/linux-session.sh",
        ):
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, target)
        (self.root / "scripts/fake-python.py").write_text(FAKE_PYTHON)
        python = self.root / "backend/api/.venv/bin/python"
        python.parent.mkdir(parents=True)
        python.write_text(
            f'#!/bin/sh\nexec {shlex.quote(sys.executable)} {shlex.quote(str(self.root / "scripts/fake-python.py"))} "$@"\n'
        )
        python.chmod(0o755)
        (self.root / "scripts/check-node-dependencies.mjs").write_text("""
import {existsSync} from 'node:fs';
const ready = existsSync('.node-ready');
console.log(JSON.stringify({ready,lockValid:true,packages:[{name:'vite',installed:ready?'7.0.0':null,expected:'7.0.0',status:ready?'OK':'MISSING'}],problems:[]}));
process.exitCode = ready ? 0 : 1;
""")
        (self.root / "scripts/check-setup.mjs").write_text(
            "console.log('Fixture configuration checked.');\n"
        )
        vite = self.root / "node_modules/vite/bin/vite.js"
        vite.parent.mkdir(parents=True)
        vite.write_text(
            "if(process.env.TEST_DASHBOARD_FAILURE)process.exit(3);require('node:http').createServer((req,res)=>{res.end('SproutSync fixture');}).listen(5173,'127.0.0.1');\n"
        )
        (self.root / "frontend/dashboard").mkdir(parents=True)
        binaries = self.root / "test-bin"
        binaries.mkdir()
        npm = binaries / "npm"
        npm.write_text("""#!/usr/bin/env bash
case "$1" in
  --version) printf '10.0.0\\n' ;;
  ci) printf 'npm ci\\n' >> .calls; touch .node-ready ;;
  run) exec node scripts/check-setup.mjs ;;
  *) exit 2 ;;
esac
""")
        npm.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": str(binaries) + os.pathsep + os.environ["PATH"],
        }
        # A dotenv value is data, never executable shell input.
        (self.root / ".env").write_text("NOTE='$(touch .env-was-executed)'\n")
        (self.root / ".env.example").write_text("NOTE=fixture\n")
        for flag in (".node-ready", ".python-ready"):
            (self.root / flag).touch()

    def tearDown(self):
        if self.launcher:
            if self.launcher.poll() is None:
                self.launcher.terminate()
            try:
                self.launcher.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.launcher.kill()
                self.launcher.wait(timeout=5)
        if self.log:
            self.log.close()
        self.temporary.cleanup()

    def run_script(self, name, *args):
        return subprocess.run(
            ["bash", str(self.root / name), *args],
            cwd=self.root.parent,
            env=self.env,
            text=True,
            capture_output=True,
            timeout=45,
            check=False,
        )

    def calls(self):
        path = self.root / ".calls"
        return path.read_text() if path.exists() else ""

    def start(self, **extra_env):
        self.log = (self.root / "launcher.log").open("w+")
        self.launcher = subprocess.Popen(
            ["bash", str(self.root / "start.sh")],
            cwd=self.root.parent,
            env={**self.env, **extra_env},
            stdout=self.log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            output = (self.root / "launcher.log").read_text()
            if self.launcher.poll() is not None:
                self.fail("Launcher exited before readiness:\n" + output)
            if "SproutSync is running at" in output:
                return
            time.sleep(0.1)
        self.fail(
            "Launcher did not become ready:\n"
            + (self.root / "launcher.log").read_text()
        )

    def assert_port_free(self, port):
        with socket.socket() as connection:
            connection.settimeout(1)
            self.assertNotEqual(
                connection.connect_ex(("127.0.0.1", port)),
                0,
                f"Port {port} was left occupied",
            )

    def test_start_repeat_start_stop_and_read_only_verify(self):
        self.start()
        for url in ("http://127.0.0.1:8000/api/v1/health", "http://127.0.0.1:5173"):
            with urlopen(url, timeout=3) as response:
                self.assertEqual(response.status, 200)
        state = self.root / ".tools/dev-session.pid"
        original = state.read_text()
        calls = self.calls()
        repeated = self.run_script("start.sh")
        self.assertEqual(repeated.returncode, 0, repeated.stderr)
        self.assertIn("Existing healthy session reused", repeated.stdout)
        self.assertEqual(state.read_text(), original)
        self.assertEqual(self.calls(), calls)
        for args in ((), ("--online",)):
            result = self.run_script("verify.sh", *args)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("READY:", result.stdout)
        self.assertNotIn("pip", self.calls())
        self.assertFalse((self.root / ".env-was-executed").exists())
        stopped = self.run_script("stop.sh")
        self.assertEqual(stopped.returncode, 0, stopped.stderr)
        self.assertEqual(self.launcher.wait(timeout=20), 0)
        self.assertFalse(state.exists())
        self.assert_port_free(8000)
        self.assert_port_free(5173)
        self.assertEqual(self.run_script("stop.sh").returncode, 0)

    def test_install_only_installs_missing_dependencies_once(self):
        (self.root / ".node-ready").unlink()
        (self.root / ".python-ready").unlink()
        first = self.run_script("start.sh", "--install-only")
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        self.assertIn("npm ci", self.calls())
        self.assertIn("pip install -r requirements.txt", self.calls())
        before = self.calls()
        second = self.run_script("start.sh", "--install-only")
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertEqual(self.calls(), before)
        self.assertNotIn("alembic", self.calls())
        self.assertFalse((self.root / ".tools/dev-session.pid").exists())

    def test_damaged_python_packages_are_repaired(self):
        (self.root / ".broken-python").touch()
        result = self.run_script("start.sh", "--install-only")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("--force-reinstall --no-deps fastapi==0.120.0", self.calls())

    def test_verification_reports_missing_packages_without_installing(self):
        (self.root / ".python-ready").unlink()
        before = self.calls()
        for name in ("verify.sh", "start.sh"):
            result = self.run_script(name, *(["--check"] if name == "start.sh" else []))
            self.assertEqual(result.returncode, 1)
            self.assertIn("MISSING", result.stdout)
        self.assertEqual(self.calls(), before)
        self.assertFalse((self.root / ".tools").exists())

    def test_unrelated_port_is_preserved_before_install_or_migration(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 8000))
            listener.listen()
            result = self.run_script("start.sh")
            self.assertEqual(result.returncode, 1)
            self.assertIn("already in use", result.stderr)
            self.assertNotEqual(listener.fileno(), -1)
            self.assertEqual(self.calls(), "")

    def test_stale_pid_identity_never_signals_an_unrelated_process(self):
        state = self.root / ".tools/dev-session.pid"
        state.parent.mkdir()
        boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        state.write_text(f"{os.getpid()}\n0\n{self.root}\n{boot}\n")
        result = self.run_script("stop.sh")
        self.assertEqual(result.returncode, 1)
        self.assertIn("No processes were stopped", result.stderr)
        self.assertTrue(state.exists())

    def test_dashboard_failure_cleans_up_the_api(self):
        self.log = (self.root / "launcher.log").open("w+")
        self.launcher = subprocess.Popen(
            ["bash", str(self.root / "start.sh")],
            cwd=self.root,
            env={**self.env, "TEST_DASHBOARD_FAILURE": "1"},
            stdout=self.log,
            stderr=subprocess.STDOUT,
        )
        self.assertNotEqual(self.launcher.wait(timeout=35), 0)
        self.assert_port_free(8000)
        self.assert_port_free(5173)
        self.assertFalse((self.root / ".tools/dev-session.pid").exists())

    def test_invalid_arguments_do_not_install_or_start_services(self):
        for script in ("start.sh", "stop.sh", "verify.sh"):
            result = self.run_script(script, "--unknown")
            self.assertEqual(result.returncode, 2)
            self.assertIn("Usage:", result.stderr)
        self.assertEqual(self.calls(), "")


if __name__ == "__main__":
    unittest.main()
