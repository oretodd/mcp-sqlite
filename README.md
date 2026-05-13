# oretodd-mcp-sqlite

Fork of [jparkerweb/mcp-sqlite](https://github.com/jparkerweb/mcp-sqlite) v1.0.9 that **does not hold the database file open between tool calls**.

## What's different from upstream

The upstream package opens the SQLite file once at startup and keeps the handle for the entire process lifetime. On Windows that blocks any attempt to delete, move, or rename the database file.

This fork:
- **Opens the DB on each tool call and closes it before returning** — the file handle (plus any `-wal` / `-shm` files) is fully released by the OS the moment the tool call completes, so the DB file is freely movable/deletable between calls.
- **Validates the DB path at startup** — exits immediately with a clear error if the configured path does not exist, instead of running silently broken.

No configuration is required.

## Setup

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "oretodd-mcp-sqlite", "<path-to-your-sqlite-database.db>"]
    }
  }
}
```

## Available Tools

All 8 tools from upstream are unchanged:
`db_info`, `query`, `list_tables`, `get_table_schema`, `create_record`, `read_records`, `update_records`, `delete_records`

See [upstream README](https://github.com/jparkerweb/mcp-sqlite#readme) for full tool documentation.

## License

ISC — same as upstream
