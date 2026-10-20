# GitHub setup

The local repository is ready; choose the GitHub organization/account and visibility before publishing. Do not create a second README or .gitignore on the remote.

From the project root, after reviewing staged content:

```powershell
git add .
git commit -m "chore: initialize SproutSync development monorepo"
git remote add origin https://github.com/YOUR-OWNER/sproutsync.git
git push -u origin main
```

Replace YOUR-OWNER with the chosen account; create the empty remote first. Configure main branch protection to require PR review and successful dashboard, api and firmware CI jobs after their first successful run. Add team access and CODEOWNERS with verified handles. Enable dependency alerts. Choose a license with the team before public distribution.

