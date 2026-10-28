"""Build an Android preview and publish its verified download metadata."""

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
version_match = re.search(
    r"^version:\s*([^+\s]+)\+(\d+)\s*$",
    (root / "mobile/pubspec.yaml").read_text(encoding="utf-8"),
    re.MULTILINE,
)
if not version_match:
    raise SystemExit("Set a version and build number in mobile/pubspec.yaml.")
settings = {**dotenv_values(root / ".env", encoding="utf-8-sig"), **os.environ}
url = settings.get("SUPABASE_URL") or settings.get("VITE_SUPABASE_URL")
anon = settings.get("SUPABASE_ANON_KEY") or settings.get("VITE_SUPABASE_ANON_KEY")
if not url or not anon:
    raise SystemExit(
        "Configure the public Supabase URL and anon key in .env before building."
    )
environment = dict(os.environ)
environment.pop("DEBUG", None)
java = list((root / ".tools/java").glob("jdk*"))
if java and not environment.get("JAVA_HOME"):
    environment["JAVA_HOME"] = str(java[0])
if not environment.get("ANDROID_HOME") and not environment.get("ANDROID_SDK_ROOT") and (root / ".tools/android-sdk").is_dir():
    environment["ANDROID_HOME"] = str(root / ".tools/android-sdk")
flutter = shutil.which("flutter")
if not flutter:
    local_flutter = root / ".tools/flutter/bin" / ("flutter.bat" if os.name == "nt" else "flutter")
    if local_flutter.is_file():
        flutter = str(local_flutter)
if not flutter:
    raise SystemExit("Install Flutter and add its bin directory to PATH; run flutter doctor. See SETUP.md.")
tool_root = root / ".tools"
tool_root.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(
    prefix="mobile-build-", dir=tool_root
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
    "version": version_match[1],
    "build_number": int(version_match[2]),
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
