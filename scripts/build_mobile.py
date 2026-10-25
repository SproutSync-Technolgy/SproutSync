"""Build an Android preview and publish its verified download metadata."""

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
settings = {}
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in line and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        settings[key.strip()] = value.strip().strip('"').strip("'")
url = settings.get("SUPABASE_URL") or settings.get("VITE_SUPABASE_URL")
anon = settings.get("SUPABASE_ANON_KEY") or settings.get("VITE_SUPABASE_ANON_KEY")
if not url or not anon:
    raise SystemExit(
        "Configure the public Supabase URL and anon key in .env before building."
    )
environment = dict(os.environ)
environment.pop("DEBUG", None)
java = list((root / ".tools/java").glob("jdk*"))
if java:
    environment["JAVA_HOME"] = str(java[0])
environment["ANDROID_HOME"] = str(root / ".tools/android-sdk")
environment["GRADLE_USER_HOME"] = str(root / ".tools/gradle")
flutter = root / ".tools/flutter/bin/flutter.bat"
with tempfile.TemporaryDirectory(
    prefix="mobile-build-", dir=root / ".tools"
) as temporary:
    config = Path(temporary) / "public-config.json"
    config.write_text(
        json.dumps({"SUPABASE_URL": url, "SUPABASE_ANON_KEY": anon}), encoding="utf-8"
    )
    command = [
        str(flutter),
        "build",
        "apk",
        "--release",
        "--no-tree-shake-icons",
        "--target-platform",
        "android-arm64",
        "--dart-define-from-file=" + str(config),
    ]
    subprocess.run(command, cwd=root / "mobile", env=environment, check=True)
apk = root / "mobile/build/app/outputs/flutter-apk/app-release.apk"
target = root / "frontend/dashboard/public/downloads"
target.mkdir(parents=True, exist_ok=True)
destination = target / "sproutsync-preview.apk"
shutil.copyfile(apk, destination)
metadata = {
    "available": True,
    "version": "0.1.0",
    "platform": "Android 7.0+ (ARM64)",
    "filename": destination.name,
    "url": "/downloads/" + destination.name,
    "size_bytes": destination.stat().st_size,
    "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
    "channel": "Development preview",
}
(target / "mobile-release.json").write_text(
    json.dumps(metadata, indent=2), encoding="utf-8"
)
print("Downloadable Android preview published:", destination.name)
print("Size:", metadata["size_bytes"], "bytes; SHA-256:", metadata["sha256"])
