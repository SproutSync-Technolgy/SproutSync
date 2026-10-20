# Security

Never commit .env files, device credentials, private keys, real user records or database backups. Use environment-specific secrets and rotate any exposed credentials.

This starter has no authentication. Bind it to localhost during development. MQTT permits anonymous connections only in the loopback-bound development stack; production requires TLS, per-device credentials, ACLs and credential rotation. Do not expose development services on public interfaces.

Report vulnerabilities privately to the project manager through the team's existing private channel. Do not post credentials or exploit details in public issues. Add a formal security contact when the GitHub organization is configured.

