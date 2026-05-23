# Crypto Transaction Reconciliation Engine

A Node.js engine that ingests two sources of crypto transaction data (user-exported and exchange-exported), matches them intelligently using configurable tolerances, and produces a structured reconciliation report.

---

## Features

- Parses and ingests both CSV files into separate MongoDB collections
- Flags bad/malformed rows with a reason — nothing is silently dropped
- Detects duplicate transaction IDs during ingestion
- Matches transactions using configurable timestamp and quantity tolerances
- Handles asset aliases (`bitcoin` → `BTC`) and type equivalents (`TRANSFER_IN` ↔ `TRANSFER_OUT`)
- Assigns a confidence score (0–100) to matched and conflicting entries
- Produces a full reconciliation report exportable as CSV
- REST API to trigger runs, fetch reports, summaries, and unmatched entries

---

## Tech Stack

- **Runtime:** Node.js (ES Modules)
- **Framework:** Express v5
- **Database:** MongoDB (local) + Mongoose
- **CSV Parsing:** csv-parser
- **File Uploads:** Multer

---

## Project Structure

```
src/
├── config/
│   ├── multer.config.js
│   └── assetAliases.js
├── models/
│   ├── base/
│   │   └── transactionBase.js
│   ├── userTransaction.model.js
│   ├── exchangeTransaction.model.js
│   ├── ingestionLog.model.js
│   └── reconciliationReport.model.js
├── routes/
│   ├── index.js
│   ├── ingestion.routes.js
│   └── reconciliation.routes.js
├── controllers/
│   ├── ingestion.controller.js
│   └── reconciliation.controller.js
├── services/
│   ├── ingestion.service.js
│   └── matching.service.js
└── app.js
uploads/         ← uploaded CSVs saved here
.env
```

---

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB running locally on port 27017

### Installation

```bash
git clone https://github.com/your-username/transaction-reconcilation-engine.git
cd transaction-reconcilation-engine
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/reconciliation

# Matching tolerances (can be overridden per request)
TIMESTAMP_TOLERANCE_SECONDS=300
QUANTITY_TOLERANCE_PCT=0.01
```

### Run

```bash
# Development
npx nodemon index.js

# Production
node index.js
```

---

## API Reference

### Ingestion

#### `POST /api/ingest`

Upload both CSV files to parse, validate, and store in the database.

**Content-Type:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `user_transactions` | file (.csv) | User-exported transaction CSV |
| `exchange_transactions` | file (.csv) | Exchange-exported transaction CSV |

**Response:**
```json
{
  "success": true,
  "message": "Ingestion complete.",
  "data": {
    "user":     { "source": "user",     "total_rows": 10, "saved": 9, "flagged": 1 },
    "exchange": { "source": "exchange", "total_rows": 10, "saved": 10, "flagged": 0 }
  }
}
```

---

### Reconciliation

#### `POST /api/reconciliation/reconcile`

Trigger a reconciliation run. Optionally override tolerances in the request body.

**Request Body (optional):**
```json
{
  "timestamp_tolerance_seconds": 60,
  "quantity_tolerance_pct": 0.05
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reconciliation completed.",
  "runId": "64f1a2b3c4d5e6f7a8b9c0d1",
  "summary": {
    "total_user": 10,
    "total_exchange": 10,
    "matched": 7,
    "conflicting": 1,
    "unmatched_user": 1,
    "unmatched_exchange": 2
  }
}
```

---

#### `GET /api/reconciliation/report/:runId`

Fetch the full reconciliation report for a run including all entries.

---

#### `GET /api/reconciliation/report/:runId/summary`

Fetch just the counts — matched, conflicting, unmatched.

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_user": 10,
      "total_exchange": 10,
      "matched": 7,
      "conflicting": 1,
      "unmatched_user": 1,
      "unmatched_exchange": 2
    },
    "status": "completed",
    "config": {
      "timestamp_tolerance_seconds": 300,
      "quantity_tolerance_pct": 0.01
    },
    "createdAt": "2024-03-01T09:00:00.000Z"
  }
}
```

---

#### `GET /api/reconciliation/report/:runId/unmatched`

Fetch only unmatched entries with reasons.

---

#### `GET /api/reconciliation/report/:runId/export`

Download the full report as a CSV file.

---

## CSV Format

Both input files must follow this column structure:

| Column | Type | Required | Notes |
|---|---|---|---|
| `transaction_id` | String | ✅ | Unique identifier |
| `timestamp` | ISO 8601 | ✅ | e.g. `2024-03-01T09:00:00Z` |
| `type` | String | ✅ | `BUY`, `SELL`, `TRANSFER_IN`, `TRANSFER_OUT` |
| `asset` | String | ✅ | e.g. `BTC`, `ETH`, `bitcoin` |
| `quantity` | Number | ✅ | Must be > 0 |
| `price_usd` | Number | ❌ | Optional for transfers |
| `fee` | Number | ❌ | Defaults to 0 |
| `note` | String | ❌ | Max 500 chars |

---

## Reconciliation Logic

Each transaction from the user file is matched against the exchange file using:

1. **Asset** — case-insensitive, with alias resolution (`bitcoin` = `BTC`)
2. **Type** — exact match, with `TRANSFER_IN` ↔ `TRANSFER_OUT` equivalence
3. **Timestamp** — within `±TIMESTAMP_TOLERANCE_SECONDS` (default 5 minutes)
4. **Quantity** — within `±QUANTITY_TOLERANCE_PCT` percent (default 0.01%)

### Report Categories

| Category | Description |
|---|---|
| `matched` | Paired successfully, all fields within tolerance |
| `conflicting` | Paired by proximity, but quantity or timestamp exceeds tolerance |
| `unmatched_user` | Present in user file, not found in exchange file |
| `unmatched_exchange` | Present in exchange file, not found in user file |

### Confidence Score

Matched and conflicting entries include a `confidence_score` (0–100) indicating how closely the two sides agreed. Unmatched entries have `null`.

---

## Data Quality

- Rows with missing required fields are saved with `status: "flagged"` and a `flags` array describing the issues
- Duplicate `transaction_id` values are detected and logged to the `IngestionLog` collection
- Asset names are normalized to uppercase ticker symbols on ingestion
- Only `clean` rows participate in reconciliation
