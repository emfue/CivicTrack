# CivicTrack

CivicTrack is a citizen-facing city issue reporting and management system. Citizens will be able to create accounts, report civic problems with photographs and location details, review their complaint history, and track status changes.

The local application implements registration, login, complaint reporting and photos, complaint tracking, dashboard, and profile management. It does not connect to a real municipal system.

## Technology stack

- Frontend: HTML5, CSS3, and vanilla JavaScript.
- Backend: Node.js with Express.js and a modular monolith structure.
- Database: MongoDB with Mongoose.
- Authentication: bcrypt password hashing and JWT-based browser authentication in an HTTP-only cookie.
- Local files: a replaceable storage service for development uploads, with a future S3 adapter planned for deployment.

## Repository layout

```text
client/        Browser pages and static assets
server/        Express application modules and local upload storage
docs/          Architecture, data, API, and delivery planning
```

The full rationale and planned interfaces are in [docs/architecture.md](docs/architecture.md), [docs/database-design.md](docs/database-design.md), [docs/api-design.md](docs/api-design.md), and [docs/development-roadmap.md](docs/development-roadmap.md).

## Local setup on this Windows machine

Node.js v24 and a project-local npm are available. MongoDB Community Server was extracted to the ignored `.local-tools/mongodb` directory. These files are machine-specific and are not part of the repository. The local database uses `.local-tools/mongodb/data` and listens only on `127.0.0.1`.

To start MongoDB in one PowerShell window (skip this if it is already running):

```powershell
cd D:\CivicTrack
& .\.local-tools\mongodb\mongod.exe --dbpath D:\CivicTrack\.local-tools\mongodb\data --bind_ip 127.0.0.1 --port 27017 --replSet civictrack-rs
```

In another PowerShell window, install dependencies and start CivicTrack:

```powershell
cd D:\CivicTrack
node .\.local-tools\npm\node_modules\npm\bin\npm-cli.js install
# Only needed once for a fresh database started with --replSet:
node scripts/init-replica.js
node .\.local-tools\npm\node_modules\npm\bin\npm-cli.js start
```

Open `http://localhost:3000`. If a standard npm installation is on PATH, `npm install` and `npm start` work instead. On another computer, install Node.js with npm and MongoDB Community Server, then use the standard npm commands.

The local `.env` was created only if it did not already exist. For a fresh checkout, copy `.env.example` to `.env` and replace `JWT_SECRET` with a random secret of at least 32 characters. The local URI is `mongodb://127.0.0.1:27017/civictrack?replicaSet=civictrack-rs`. Set `MONGODB_URI`, `HOST`, `PORT`, `CLIENT_ORIGIN`, and `UPLOAD_DIR` for the environment. Never commit `.env` or uploaded photos. Production cookies require HTTPS; review reverse-proxy and origin settings before deploying.

## Development status changes

Status changes are limited to a local command, not a citizen API. With `NODE_ENV=development` and MongoDB running:

```powershell
node server/status.js <complaint-id> under_review
node server/status.js <complaint-id> in_progress
node server/status.js <complaint-id> resolved
```

Allowed transitions are `submitted` → `under_review` or `rejected`, `under_review` → `in_progress` or `rejected`, and `in_progress` → `resolved` or `rejected`. The utility rejects all other transitions. Complaint deletion is available only while status is `submitted`.

The status utility updates the complaint and writes its history in one MongoDB transaction. The server requires a transaction-capable replica set or cluster. File cleanup is separate from database transactions and uses durable cleanup records; see [architecture](docs/architecture.md).

## Tests

With MongoDB running, execute `node --test tests/integration.test.js`. The test creates a uniquely named temporary database, exercises the API and browser, then drops that test database and its temporary upload directory. The browser check expects Microsoft Edge at its default Windows installation path.

## Scope boundaries

The current plan covers only the citizen-facing portal. It does not include a separate administrator or municipal employee frontend, real government integrations, AWS resources, production deployment, or fabricated data.

## Current status

The citizen portal is implemented for local use. AWS deployment, an S3 storage adapter, production infrastructure, and municipal integrations are outside this phase. See the [deployment guide](docs/deployment-guide.md) for remaining work.
