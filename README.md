# VinoReveal Alpha

VinoReveal Alpha is a blind wine tasting web app designed for self-hosted deployment.

## Background

This project originally started as a Google AI Studio / Firebase-style prototype and was later refactored toward a more open, self-hostable architecture with Claude Code.

The repository still contains some legacy AI Studio / Firebase artifacts, but the target direction is a standard open-source deployment model using a custom backend and VPS hosting.

## Project goal

The target production deployment is:

- `vinoreveal.mofosis.de` → VinoReveal app
- `auth.mofosis.de` → shared Authelia authentication portal

Authentication for VinoReveal should be handled through Authelia.

## Architecture

Current / intended stack:

- Frontend: Vite + TypeScript
- Backend: Node.js + TypeScript
- Database: PostgreSQL
- Realtime: Server-Sent Events (SSE)
- Deployment: Docker on a VPS
- Authentication: Authelia behind a reverse proxy

## Relationship to Betbuddy

This repository contains the VinoReveal application itself.

A related repository, `mofosis/Betbuddy`, contains a similar migration path and currently serves as the stronger deployment reference for:

- Docker-based VPS deployment
- reverse proxy integration
- Authelia authentication setup
- PostgreSQL-backed self-hosting patterns

When deployment details are missing here, Betbuddy should be treated as the primary reference implementation.

## Repository status

This project is currently in transition from its original AI Studio / Firebase prototype into a self-hosted open-source application.

That means:
- some legacy Firebase files may still exist
- deployment files may still evolve
- auth integration may depend on shared infrastructure from the Betbuddy deployment setup

## Local development

### Requirements

- Node.js
- npm
- PostgreSQL (for local backend testing, if applicable)

### Install

```bash
npm install
```

### Development

Start the frontend:

```bash
npm run dev
```

If the backend is included in this repo, start it separately as needed:

```bash
npm run server
```

## Deployment target

The intended deployment model is:

- VinoReveal on `vinoreveal.mofosis.de`
- shared Authelia on `auth.mofosis.de`
- Docker-based deployment on a VPS
- authentication enforced by reverse proxy / Authelia integration

## Notes

This repository may still include AI Studio or Firebase-era files that are no longer part of the long-term target architecture. These should be treated as migration artifacts unless still actively used.
