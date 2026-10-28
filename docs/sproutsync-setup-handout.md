# SproutSync setup handout

Follow the **[quick setup guide](../SETUP.md)**:

1. Install Git, Node.js 22.12+, and Python 3.12+.
2. Clone the repo and fill the five required `.env` values for one Supabase project.
3. Create the Python environment, install `requirements.txt`, and run the launcher.

After the first setup, start from the repository folder in PowerShell:

```powershell
.\start.bat -Backend Native
```

Open **http://localhost:5173**. Press **Ctrl+C** to stop. Docker is optional
for this hosted-Supabase workflow.

Other operating systems, Docker, and troubleshooting:
[advanced setup reference](setup-reference.md).
