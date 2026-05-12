# oretodd-mcp-sqlite

Fork of [jparkerweb/mcp-sqlite](https://github.com/jparkerweb/mcp-sqlite) v1.0.9 with an **idle-connection timeout** feature.

## What's different from upstream

The upstream package holds its SQLite file handle open for the entire process lifetime. On Windows, this blocks deletion and rename of the database file.

This fork adds:
- **Lazy connection open**: the DB handle is not opened until the first tool call
- **Idle-connection timeout**: after N seconds of inactivity, the handle is closed and the file is released
- **Startup path validation**: if the configured DB path doesn't exist, the server exits immediately with a clear error instead of running silently broken

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `SQLITE_IDLE_TIMEOUT` | `60` | Seconds of inactivity before closing the DB handle. Set to `0` to disable (keep open for process lifetime). |

## Setup

```json
{
  "mcpServers": {
    "sqlite": {
      "command": "npx",
      "args": ["-y", "oretodd-mcp-sqlite", "<path-to-your-sqlite-database.db>"],
      "env": {
        "SQLITE_IDLE_TIMEOUT": "60"
      }
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
