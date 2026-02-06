#!/usr/bin/env python3
import sqlite3
import json
from pathlib import Path

p = Path.home() / "AppData/Roaming/Cursor/User/workspaceStorage/a54d103bb557b782020ef324e480e799/state.vscdb"
conn = sqlite3.connect(str(p))
cur = conn.cursor()

# composerChatViewPane
cur.execute("SELECT key, length(value) FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%'")
rows = cur.fetchall()
print("composerChatViewPane entries:", [(r[0].split(".")[-1][:8], r[1]) for r in rows])

# Get full chat data from one composer pane
cur.execute("SELECT key, value FROM ItemTable WHERE key LIKE 'workbench.panel.composerChatViewPane.%'")
for key, val in cur.fetchall():
    if val and len(val) > 500:
        try:
            d = json.loads(val)
            print("\n--- Structure keys:", list(d.keys())[:15] if isinstance(d, dict) else "list")
            s = json.dumps(d, indent=2)
            print(s[:5000])
            break
        except Exception as e:
            print("Parse error:", e)

# cursorDiskKV
cur.execute("SELECT key FROM cursorDiskKV LIMIT 20")
print("\ncursorDiskKV sample keys:", [r[0] for r in cur.fetchall()])

# workbench.panel.aichat.view.aichat.chatdata - full chat?
cur.execute("SELECT key FROM ItemTable WHERE key LIKE '%chatdata%'")
print("\nchatdata keys:", [r[0] for r in cur.fetchall()])

conn.close()
