#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { existsSync, statSync } = require('node:fs');
const { z } = require('zod');
const path = require('path');

// Opens the SQLite file for the duration of a single MCP tool call and
// guarantees the OS file handle is fully released before the call returns.
// The DB file is therefore movable/deletable between tool invocations.
class SQLiteSession {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, err => {
                if (err) reject(err); else resolve();
            });
        });
    }

    async close() {
        if (!this.db) return;
        const db = this.db;
        this.db = null;
        await new Promise(resolve => {
            db.close(err => {
                if (err) console.error(`[mcp-sqlite] close error: ${err.message}`);
                resolve();
            });
        });
    }

    async executeQuery(sql, values = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, values, (err, rows) => {
                if (err) reject(err); else resolve(rows);
            });
        });
    }

    async executeRun(sql, values = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, values, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    async listTables() {
        return this.executeQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        );
    }

    async validateTableName(tableName) {
        const tables = await this.executeQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
            [tableName]
        );
        if (tables.length === 0) {
            throw new Error(`Table "${tableName}" does not exist`);
        }
    }

    async validateColumnNames(tableName, columnNames) {
        const schema = await this.executeQuery(
            `PRAGMA table_info(${this.quoteIdentifier(tableName)})`
        );
        const validColumns = new Set(schema.map(col => col.name));
        for (const col of columnNames) {
            if (!validColumns.has(col)) {
                throw new Error(`Column "${col}" does not exist in table "${tableName}"`);
            }
        }
    }

    quoteIdentifier(name) {
        return `"${name.replace(/"/g, '""')}"`;
    }

    async getTableSchema(tableName) {
        await this.validateTableName(tableName);
        return this.executeQuery(`PRAGMA table_info(${this.quoteIdentifier(tableName)})`);
    }
}

// Runs `fn` against a freshly-opened SQLiteSession and guarantees the
// connection is closed before returning, even on error.
async function withSession(dbPath, fn) {
    const session = new SQLiteSession(dbPath);
    await session.open();
    try {
        return await fn(session);
    } finally {
        await session.close();
    }
}

async function main() {
    const dbPath = process.argv[2] || 'mydatabase.db';

    // Resolve to absolute path if relative
    const absoluteDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
    if (!existsSync(absoluteDbPath)) {
        console.error(`[mcp-sqlite] Database not found: ${absoluteDbPath}`);
        process.exit(1);
    }
    const server = new McpServer({
        name: "mcp-sqlite-server",
        version: "1.0.0"
    });

    // Add a database info tool for debugging
    server.tool(
        "db_info",
        "Get information about the SQLite database including path, existence, size, and table count",
        {},
        async () => {
            try {
                const dbExists = existsSync(absoluteDbPath);
                let fileSize = 0;
                let fileStats = null;
                
                if (dbExists) {
                    fileStats = statSync(absoluteDbPath);
                    fileSize = fileStats.size;
                }
                
                // Get table count
                const tableCountResult = await withSession(absoluteDbPath, s => s.executeQuery(
                    "SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                ));
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            dbPath: absoluteDbPath,
                            exists: dbExists,
                            size: fileSize,
                            lastModified: dbExists ? fileStats.mtime.toString() : null,
                            tableCount: tableCountResult[0].count
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error getting database info: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Register SQLite query tool
    server.tool(
        "query",
        "Execute a raw SQL query against the database with optional parameter values",
        { 
            sql: z.string(),
            values: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
        },
        async ({ sql, values }) => {
            try {
                const results = await withSession(absoluteDbPath, s => s.executeQuery(sql, values));
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(results, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // List Tables
    server.tool(
        "list_tables",
        "List all user tables in the SQLite database (excludes system tables)",
        {},
        async () => {
            try {
                const tables = await withSession(absoluteDbPath, s => s.listTables());
                
                if (tables.length === 0) {
                    return {
                        content: [{ 
                            type: "text", 
                            text: JSON.stringify({
                                message: "No tables found in database",
                                dbPath: absoluteDbPath,
                                exists: existsSync(absoluteDbPath),
                                size: existsSync(absoluteDbPath) ? statSync(absoluteDbPath).size : 0
                            }, null, 2) 
                        }]
                    };
                }
                
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(tables, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error listing tables: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Get Table Schema
    server.tool(
        "get_table_schema",
        "Get the schema information for a specific table including column details",
        { 
            tableName: z.string() 
        },
        async ({ tableName }) => {
            try {
                const schema = await withSession(absoluteDbPath, s => s.getTableSchema(tableName));
                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(schema, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error getting schema: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Create Record
    server.tool(
        "create_record",
        "Insert a new record into a table with specified data",
        { 
            table: z.string(),
            data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        },
        async ({ table, data }) => {
            try {
                const result = await withSession(absoluteDbPath, async s => {
                    await s.validateTableName(table);
                    const columns = Object.keys(data);
                    await s.validateColumnNames(table, columns);
                    const placeholders = columns.map(() => '?').join(', ');
                    const values = Object.values(data);

                    const sql = `INSERT INTO ${s.quoteIdentifier(table)} (${columns.map(c => s.quoteIdentifier(c)).join(', ')}) VALUES (${placeholders})`;
                    return s.executeRun(sql, values);
                });

                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            message: "Record created successfully",
                            insertedId: result.lastID
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error creating record: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Read Records
    server.tool(
        "read_records",
        "Read records from a table with optional conditions, limit, and offset",
        { 
            table: z.string(),
            conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
            limit: z.number().optional(),
            offset: z.number().optional()
        },
        async ({ table, conditions, limit, offset }) => {
            try {
                const results = await withSession(absoluteDbPath, async s => {
                    await s.validateTableName(table);
                    let sql = `SELECT * FROM ${s.quoteIdentifier(table)}`;
                    const values = [];

                    if (conditions && Object.keys(conditions).length > 0) {
                        const conditionColumns = Object.keys(conditions);
                        await s.validateColumnNames(table, conditionColumns);
                        const whereConditions = Object.entries(conditions).map(([column, value]) => {
                            values.push(value);
                            return `${s.quoteIdentifier(column)} = ?`;
                        }).join(' AND ');

                        sql += ` WHERE ${whereConditions}`;
                    }

                    if (limit !== undefined) {
                        sql += ` LIMIT ${limit}`;
                        if (offset !== undefined) {
                            sql += ` OFFSET ${offset}`;
                        }
                    }

                    return s.executeQuery(sql, values);
                });

                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(results, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error reading records: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Update Records
    server.tool(
        "update_records",
        "Update records in a table based on specified conditions",
        { 
            table: z.string(),
            data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
            conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        },
        async ({ table, data, conditions }) => {
            try {
                const result = await withSession(absoluteDbPath, async s => {
                    await s.validateTableName(table);
                    const allColumns = [...Object.keys(data), ...Object.keys(conditions)];
                    await s.validateColumnNames(table, allColumns);

                    const setClause = Object.keys(data).map(key => `${s.quoteIdentifier(key)} = ?`).join(', ');
                    const setValues = Object.values(data);

                    const whereClause = Object.keys(conditions).map(key => `${s.quoteIdentifier(key)} = ?`).join(' AND ');
                    const whereValues = Object.values(conditions);

                    const sql = `UPDATE ${s.quoteIdentifier(table)} SET ${setClause} WHERE ${whereClause}`;
                    return s.executeRun(sql, [...setValues, ...whereValues]);
                });

                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            message: "Records updated successfully",
                            rowsAffected: result.changes
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error updating records: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    // Delete Records
    server.tool(
        "delete_records",
        "Delete records from a table based on specified conditions",
        { 
            table: z.string(),
            conditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        },
        async ({ table, conditions }) => {
            try {
                const result = await withSession(absoluteDbPath, async s => {
                    await s.validateTableName(table);
                    const conditionColumns = Object.keys(conditions);
                    await s.validateColumnNames(table, conditionColumns);

                    const whereClause = conditionColumns.map(key => `${s.quoteIdentifier(key)} = ?`).join(' AND ');
                    const values = Object.values(conditions);

                    const sql = `DELETE FROM ${s.quoteIdentifier(table)} WHERE ${whereClause}`;
                    return s.executeRun(sql, values);
                });

                return {
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify({
                            message: "Records deleted successfully",
                            rowsAffected: result.changes
                        }, null, 2) 
                    }]
                };
            } catch (error) {
                return {
                    content: [{ 
                        type: "text", 
                        text: `Error deleting records: ${error.message}` 
                    }],
                    isError: true
                };
            }
        }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main();
