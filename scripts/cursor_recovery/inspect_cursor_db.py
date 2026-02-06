#!/usr/bin/env python3
"""Inspect Cursor state.vscdb structure to understand chat format."""
import json
import sqlite3
from pathlib import Path

WORKSPACE_ID = "a54d103bb557b782020ef324e480e799"
CURSOR_STORAGE = Path.home() / "AppData" / "Roaming" / "Cursor" / "User" / "workspaceStorage"
DB_PATH = CURSOR_STORAGE / WORKSPACE_ID / "state.vscdb"

def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print("Tables:", tables)

    # Get all keys
    cur.execute("SELECT key FROM ItemTable")
    keys = [r[0] for r in cur.fetchall()]
    print(f"\nTotal keys: {len(keys)}")
    chat_keys = [k for k in keys if "chat" in k.lower() or "prompt" in k.lower() or "ai" in k.lower()]
    print("Chat-related keys:", chat_keys[:30])

    # Sample a chat value to see structure
    for key in chat_keys[:5]:
        cur.execute("SELECT value FROM ItemTable WHERE key = ?", (key,))
        row = cur.fetchone()
        if row and row[0]:
            val = row[0][:2000] if len(row[0]) > 2000 else row[0]
            print(f"\n--- Key: {key} (len={len(row[0])}) ---")
            try:
                data = json.loads(row[0])
                print(json.dumps(data, indent=2)[:3000])
            except:
                print(val[:500])
    conn.close()

if __name__ == "__main__":
    main()
