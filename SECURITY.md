# Security policy

Report a vulnerability privately through GitHub Security Advisories for `DebelToni/UnderLeaf`. Do not include real project documents or credentials in a report.

Supported code is the current `main` branch.

## Deployment boundaries

UnderLeaf is designed for a small invite-only group, not anonymous public registration. Keep the backend bound to loopback and expose it only through the managed tunnel script. Do not commit `.env`, `data/`, discovery passwords, or backup snapshots.

Agent passwords are project-scoped and displayed once. Revoke a credential immediately if it may have leaked. Stop the server before restoring a database snapshot.
