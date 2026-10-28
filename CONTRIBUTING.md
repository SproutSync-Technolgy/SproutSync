# Contributing

Use short-lived feat/, fix/, docs/ or chore/ branches from main. Link each PR to an issue with clear acceptance criteria. Keep main runnable. Use descriptive commits such as feat(api): add batch creation.

Run applicable checks from README. PRs should state the changed behavior, evidence and remaining limitations. A reviewer should check interfaces, authorization, migrations, offline operation and hardware effects when relevant.

Definition of done: acceptance criteria met, appropriate checks passing, reviewed, relevant docs updated, no credentials committed, and known limitations recorded. Hardware functionality requires bench evidence in addition to compilation.

Use npm.cmd on PowerShell when npm.ps1 is blocked; do not change system execution policy. Commit package-lock.json and use npm ci. Install native Python development dependencies with the virtual environment's `python -m pip install -r requirements.txt` at the repository root. Python dependencies currently have bounded ranges; add a reviewed lock workflow before reproducible releases. PlatformIO platform is pinned in platformio.ini. Follow [SETUP.md](SETUP.md); do not add competing environment templates or startup instructions.

