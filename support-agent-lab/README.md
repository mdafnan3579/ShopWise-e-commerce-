# Support Agent Lab

A beginner, step-by-step practice project for building a customer support AI agent with Google Gemini.
Each file adds **one new idea**. Read it top to bottom, run it, then try the experiments at the bottom.

| File | New idea |
| --- | --- |
| `step2-hello.js` | Send one message, read the reply |
| `step3-chat.js` | System prompt (the agent's job) + conversation history (its memory) |
| `step4-tools.js` | **Tools + the agent loop**, the core of every agent |
| `step5-support-agent.js` | Several tools, safety rules enforced in code, errors, human handoff |

## Setup (once)

1. Get a free API key at <https://aistudio.google.com/api-keys>.
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
you ──message + function list──▶ Gemini
 ▲                            │ response.functionCalls  ("please run get_order_status")
 │                            ▼
 └──functionResponse◀── your code runs the function
        (loop until there are no functionCalls → response.text is the answer)
```

## Next steps (after step 5)

- **Step 6:** move the tools into `shopwise-api`, calling real MongoDB orders. The customer ID comes from the login cookie (`req.user`).
- **Step 7:** add an Express route and connect the website chat widget.
- **Step 8:** write tests with a fake AI client (like `shopwise-api/tests/helpers/fakeAnthropic.js`) and try to break the agent.

## Cost

`gemini-3.8-flash` has a free tier (rate-limited), which is plenty for this lab. If you hit "429 Too Many Requests", wait a minute and try again.
