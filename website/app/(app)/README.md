# Platform Boundary

Platform is a separate application in a private repo.

- **CLI + website** = MIT licensed (public monorepo)
- **Platform** = proprietary (auth, billing, integrations, dashboard, proof cards)

This stub marks the licensing + architectural boundary.
When the platform ships, it lives in its own repo and deploys independently.

See: `MATURATION_STRATEGY.md` + `INTEGRATION_ARCHITECTURE.md`
