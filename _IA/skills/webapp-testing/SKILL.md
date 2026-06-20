---
name: webapp-testing
description: Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs.
---

# Web Application Testing

To test local web applications, write native Python Playwright scripts.

**Helper Scripts Available**:
- `scripts/with_server.py` - Manages server lifecycle (supports multiple servers)

Always run scripts with `--help` first to see usage.

## Decision Tree

```
User task → Is it static HTML?
├─ Yes → Read HTML file directly to identify selectors → Write Playwright script
└─ No (dynamic webapp) → Is the server already running?
    ├─ No → Run: python scripts/with_server.py --help, then use helper
    └─ Yes → Reconnaissance-then-action:
        1. Navigate and wait for networkidle
        2. Take screenshot or inspect DOM
        3. Identify selectors from rendered state
        4. Execute actions with discovered selectors
```

## Example: Using with_server.py

```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

Basic Playwright script:
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:5173')
    page.wait_for_load_state('networkidle')  # CRITICAL: Wait for JS to execute
    # ... automation logic
    browser.close()
```

## Best Practices

- Always wait for `networkidle` before inspecting dynamic apps
- Use descriptive selectors: `text=`, `role=`, CSS selectors, or IDs
- Add appropriate waits: `page.wait_for_selector()` ou `page.wait_for_timeout()`
- Always close the browser when done
