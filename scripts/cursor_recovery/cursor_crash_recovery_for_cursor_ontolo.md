# Crash recovery for cursor ontology work
_Exported on 2/10/2026 at 11:00:31 GMT from Cursor (2.3.35)_

---

**User**

How do I do this?
You find the exact tool names Cursor uses for this MCP (e.g. in Cursor’s MCP/Browser/DevTools settings or docs) and tell me the exact name for one of them (e.g. “the tool to list pages is xyz_list_pages”). Then I can try calling that and, if it works, use the same naming pattern for the rest.

---

**Cursor**

Here are practical ways to find the exact tool names Cursor uses for the Chrome DevTools MCP:

**1. See what Cursor exposes for the MCP**  
- Open **Cursor Settings** (gear or `Ctrl+,`).  
- Go to **Features** → **MCP** (or **Tools** / **Browser**, depending on your version).  
- Find **Chrome DevTools** in the list.  
- Click it or expand it. You already see buttons like `click`, `navigate_page`, `list_pages`.  
- Check if there’s a “Details”, “Tools”, or “View” option that shows **tool identifiers** or **tool names** (sometimes they’re listed with the exact name used for invocation, e.g. `list_pages` or `chrome_devtools_list_pages`).  
- If you can copy or screenshot that list of **tool names/IDs**, that’s what to send me.

**2. Trigger a tool call and see the name**  
- In a **new** chat with the same Cursor window (so the MCP is still connected), ask:  
  **“Use the Chrome DevTools MCP to list open browser pages.”**  
- When the AI tries to call the tool, Cursor may show the **exact tool name** in the UI (e.g. in the “thinking”/tool-call step or in the error if the name is wrong).  
- Copy or tell me that exact name (e.g. `list_pages` or `mcp_Chrome_DevTools_list_pages`).

**3. Check the MCP server’s own docs**  
- The server runs with `npx chrome-devtools-mcp@latest`.  
- In a terminal: `npm info chrome-devtools-mcp` or open the package’s GitHub/npm page and look for **“Tools”** or **“Capabilities”**.  
- The docs usually list the **tool names** the server registers (e.g. `list_pages`, `navigate_page`).  
- Cursor often uses those names as-is, sometimes with a prefix like the server ID. If you paste the tool list from the docs, I can try both the raw name and a prefixed one.

**4. Inspect Cursor’s MCP config (if you’re comfortable)**  
- Cursor stores MCP config in a JSON file (often under your user config, e.g. `%APPDATA%\Cursor\User\globalStorage` or in a dedicated MCP config file).  
- Open that file and search for “chrome” or “devtools”. The config may list the **server id** and sometimes the **tools** array with their `name` field.  
- The invocation name is usually that `name` (or `server_id` + `name`). You can tell me the `name` you see for one tool (e.g. `list_pages`).

**What to send me**  
Once you have it, send something like:  
- “The tool to list pages is **`list_pages`**” or “**`chrome_devtools_list_pages`**”, or  
- A short list: `list_pages`, `navigate_page`, `click`, …  

With one exact name (and ideally the pattern, e.g. “they all look like `something_toolname`”), I can call that tool and reuse the same pattern for the rest.

