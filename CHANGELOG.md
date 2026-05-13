# Changelog

All notable changes to the MCP SQLite Server will be documented in this file.

## [1.1.0] - 2026-05-12
### Changed
- Replaced the idle-timeout connection model with **per-tool-call connections**: the DB is opened on each MCP tool invocation and the handle is fully closed (awaited) before the tool returns. The database file (and any `-wal`/`-shm` files) is therefore movable/deletable immediately between calls — the lock window is bounded by the duration of an individual call.
- Removed `SQLITE_IDLE_TIMEOUT` environment variable (no longer applicable).

### Fixed
- `db.close()` is now awaited, so the OS file handle is guaranteed released before the tool response is sent. Previously, close was fire-and-forget and a subsequent rename/delete could still race against an in-flight close.

## [1.0.9] - 2026-04-04
### 🛡️ Security
- Fixed SQL injection vulnerability (CWE-89) in all CRUD operations and `get_table_schema`
- Table names are now validated against `sqlite_master` before query construction
- Column names are now validated against the target table's schema
- All SQL identifiers are properly quoted with double-quote escaping

## [1.0.8] - 2026-03-14
### 🐛 Fixed
- Fixed Zod v4 compatibility by using explicit string keys

## [1.0.7] - 2025-06-02
### 📦 Updated
- Added a "description" parameter to each tool definitions for better Agent selection

### 🐛 Fixed
- Resolved a know validation issue with VS Code that requires stricter JSON schema validation

## [1.0.0] - 2025-04-05
### ✨ Added
- Initial release of MCP SQLite Server
- Complete set of CRUD operations:
  - `create_record` - Insert data into tables
  - `read_records` - Query records with filtering, limit and offset
  - `update_records` - Modify existing records with conditions
  - `delete_records` - Remove records matching conditions
- Database exploration tools:
  - `list_tables` - List all tables in the database
  - `get_table_schema` - Get column information for tables
  - `db_info` - Get database file metadata
- Custom SQL query execution with the `query` tool
- Support for relative and absolute database paths
- Detailed error reporting for all operations
- Comprehensive JSON response formatting
- Full documentation in README.md 