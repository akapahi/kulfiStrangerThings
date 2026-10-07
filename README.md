# The Upside Down

A Stranger Things–style page. Ask the Upside Down a question and it answers in one word (five at most), using GPT-5 on Replicate.

## Setup

```bash
npm install
cp .env.example .env     # then put your Replicate API key in .env
npm start                # http://localhost:3000
```

| Variable         | Default       | Notes                          |
| ---------------- | ------------- | ------------------------------ |
| `REPLICATE_API_KEY` | none       | Required. Only the server reads it. (`REPLICATE_API_TOKEN` also works.) |
| `REPLICATE_MODEL` | `openai/gpt-5` | Any Replicate model that takes `system_prompt` and `prompt` |
| `PORT`           | `3000`        |                                |
| `LIGHTS_URL`     | `http://localhost:3001` | Lights controller server. Must not be the same port as `PORT`. |
| `LIGHTS_LEAD_MS` | `4500`        | Wait after `/api/lead` before flickering |
| `LIGHTS_FLICKER_MS` | `3200`     | Flicker duration, then the answer is spelled |

## Lights

After each answer the server drives the light wall at `LIGHTS_URL`, in the background:

1. `/api/stop`: cancel anything still running
2. `/api/lead`: bulbs run in, then wait `LIGHTS_LEAD_MS`
3. `/api/flicker`: for `LIGHTS_FLICKER_MS`, then wait that long
4. `/api/spell`: spell the answer (letters and spaces only)

A newer answer cancels an older sequence. If the lights server is down, the page still answers and the server logs a warning.

## Where the answer shows up

The answer flickers onto the page one letter at a time, with a red lightning strike. It is also printed in the **server terminal** (`[upside down] A: ...`) and the **browser DevTools console**.

## Questions only

Input is filtered in three layers:
1. **Client:** the text must end in `?` or start with a question word (who, what, is, can, will…). The input shakes and warns if it doesn't.
2. **Server:** runs the same check again, so nobody can skip it by calling the API directly.
3. **Model:** the system prompt tells the model to reply `NOT_A_QUESTION` to statements that slip past the first two checks (e.g. "I am tall?"). The server turns that reply into a rejection.

Answers are cleaned up on the server: punctuation and digits are removed, the answer is cut to 5 words and put in uppercase. The model is also told never to answer with a number (digits or number words).

## Structure

```
server.js          Express API (POST /api/ask) plus static hosting
public/index.html  Page markup and title
public/styles.css  Styling
public/app.js      Video playback, spores, lightning, answer reveal, validation, API call
public/upside_down_seamless_loop_2k.mp4  Looping background video (poster: upside_down_poster.jpg)
public/scene.js    Old procedural background. Not loaded any more; safe to delete.
```
