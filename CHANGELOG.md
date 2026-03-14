# Changelog

All notable changes to the MCP SQLite Server will be documented in this file.

## [1.0.8] - 2026-03-14
### 🐛 Fixed
- Fixed Zod v4 compatibility by using explicit string keys in `z.record()` calls (`z.record(z.string(), z.any())`) to resolve `_zod` undefined property error during `tools/list` operations

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