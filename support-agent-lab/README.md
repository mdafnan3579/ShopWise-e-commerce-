# Support Agent Lab

A beginner, step-by-step practice project for building a customer support AI agent with Claude.
Each file adds **one new idea**. Read it top to bottom, run it, then try the experiments at the bottom.

| File | New idea |
| --- | --- |
| `step2-hello.js` | Send one message, read the reply |
| `step3-chat.js` | System prompt (the agent's job) + conversation history (its memory) |
| `step4-tools.js` | **Tools + the agent loop**, the core of every agent |
| `step5-support-agent.js` | Several tools, safety rules enforced in code, errors, human handoff |

## Setup (once)

1. Get an API key at <https://console.anthropic.com> → **API Keys** (add a few dollars of credit).
2. In this folder:

   ```powershell
   $env:Path = "$env:USERPROFILE\Desktop\node-v24.22.0-win-x64;" + $env:Path
   cd support-agent-lab
   npm install
   copy .env.example .env      # then paste your key into .env
   ```

3. Run a step: `npm run step2` (or step3, step4, step5).

`.env` is gitignored, so your key is never committed.

## The one picture to remember

```
you ──message + tool list──▶ Claude
 ▲                            │ stop_reason = "tool_use"  ("please run get_order_status")
 │                            ▼
 └──tool_result◀── your code runs the function
        (loop until stop_reason = "end_turn" → final answer)
```

## Next steps (after step 5)

- **Step 6:** move the tools into `shopwise-api`, calling real MongoDB orders. The customer ID comes from the login cookie (`req.user`).
- **Step 7:** add an Express route and connect the website chat widget.
- **Step 8:** write tests with a fake Claude client (`shopwise-api/tests/helpers/fakeAnthropic.js`) and try to break the agent.

## Cost

Steps 2–5 cost well under $1 in total. Set `MODEL=claude-haiku-5-5` in `.env` to make experiments much cheaper.
