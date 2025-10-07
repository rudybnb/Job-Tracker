import os, pathlib, hashlib, re
from datetime import date, timedelta
from typing import Dict, List
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
import httpx
from openai import OpenAI

# ---------- ENV ----------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", "")
ELEVEN_VOICE_ID = os.getenv("ELEVEN_VOICE_ID", "B Ellana")
PUBLIC_URL = os.getenv("PUBLIC_URL", "").rstrip("/")
USE_TOOLS = os.getenv("USE_TOOLS", "ask").lower()
FINANCE_API_BASE = os.getenv("FINANCE_API_BASE", "").rstrip("/")

# ---------- APP ----------
app = FastAPI(title="Afrikaans Voice Assistant")
AUDIO_DIR = pathlib.Path("audio"); AUDIO_DIR.mkdir(exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")

oai = OpenAI(api_key=OPENAI_API_KEY)
http = httpx.AsyncClient(timeout=60)

SESSIONS: Dict[str, List[dict]] = {}
PENDING_TOOL: Dict[str, str] = {}

SYSTEM = (
    "Jy is 'n vriendelike en natuurlike stem assistent. "
    "Praat eenvoudig, kort en menslik, met 'n warm Suid-Afrikaanse toon. "
    "Antwoord in Engels of Afrikaans, afhangend van hoe die gebruiker praat."
)

# ---------- HELPERS ----------
def history(sid: str) -> List[dict]:
    if sid not in SESSIONS:
        SESSIONS[sid] = [{"role": "system", "content": SYSTEM}]
    return SESSIONS[sid]

def wants_finance(text: str) -> str | None:
    t = text.lower()
    if re.search(r"\b(transactions?|spend|spent|purchase|bought|deposits?|withdrawals?)\b", t):
        return "finance_txn"
    if re.search(r"\b(balance|bank|barclay|barclays|account)\b", t):
        return "finance_balance"
    if re.search(r"\bdebt|owe|credit card\b", t):
        return "finance_debt"
    if re.search(r"\bsummary|finances|money overview\b", t):
        return "finance_summary"
    return None

def parse_range(text: str):
    t = text.lower()
    today = date.today()
    if "today" in t: return today, today
    if "yesterday" in t:
        y = today - timedelta(days=1); return y, y
    if "last week" in t:
        return today - timedelta(days=7), today
    if "last month" in t:
        return today - timedelta(days=30), today
    return today - timedelta(days=3), today

def infer_type(text: str):
    t = text.lower()
    if "deposit" in t or "paid in" in t or "income" in t: return "deposit"
    if "withdrawal" in t or "spent" in t or "purchase" in t or "bought" in t: return "withdrawal"
    return None

def consent_needed(tool: str) -> bool:
    if USE_TOOLS == "on": return False
    if USE_TOOLS == "off": return True
    return True  # ask mode

# ---------- GPT + TTS ----------
async def ask_gpt(msgs: List[dict]) -> str:
    resp = oai.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=msgs,
        max_tokens=60,
        temperature=0.7,
    )
    return resp.choices[0].message.content.strip()

async def tts_eleven_cached(text: str) -> str:
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
    mp3 = AUDIO_DIR / f"{h}.mp3"
    if mp3.exists():
        return f"{PUBLIC_URL}/audio/{mp3.name}"

    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.15,
            "similarity_boost": 0.98,
            "style": 0.35,
            "use_speaker_boost": True
        }
    }
    r = await http.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE_ID}",
        headers={
            "xi-api-key": ELEVEN_API_KEY,
            "Accept": "audio/mpeg",
            "xi-use-voice-fallback": "false"
        },
        json=payload,
    )
    r.raise_for_status()
    mp3.write_bytes(r.content)
    return f"{PUBLIC_URL}/audio/{mp3.name}"

# ---------- FINANCE ----------
async def fetch_finance(tool: str, ctx_text: str = "") -> str:
    if not FINANCE_API_BASE:
        return "Your finance data endpoint isn't configured."
    try:
        # --- TRANSACTIONS ---
        if tool == "finance_txn":
            from_dt, to_dt = parse_range(ctx_text)
            typ = infer_type(ctx_text)
            params = {"from": str(from_dt), "to": str(to_dt), "limit": "5"}
            if typ: params["type"] = typ
            r = await http.get(f"{FINANCE_API_BASE}/transactions", params=params)
            if r.status_code != 200:
                return f"Your transactions service returned {r.status_code}."
            d = r.json()
            txns = (d or {}).get("transactions", [])[:5]
            if not txns:
                return "I couldn't find any transactions in that period."
            lines = []
            for tx in txns[:3]:
                amt = tx.get("amount", 0.0)
                merch = tx.get("merchant") or tx.get("description") or "unknown"
                day = tx.get("date", "")
                lines.append(f"{day}: {merch}, {'minus' if amt<0 else 'plus'} {abs(amt)} pounds")
            return "Recent activity: " + "; ".join(lines) + "."

        # --- BALANCE ---
        if tool == "finance_balance":
            r = await http.get(f"{FINANCE_API_BASE}/balance"); r.raise_for_status()
            d = r.json()
            total = d.get("totalBalance") or d.get("balance") or 0
            bank = (d.get("primaryAccount") or {}).get("bankName", "")
            return f"Your current balance is {total} pounds{(' at ' + bank) if bank else ''}."

        # --- DEBT ---
        if tool == "finance_debt":
            r = await http.get(f"{FINANCE_API_BASE}/debt"); r.raise_for_status()
            d = r.json()
            total = d.get("totalDebt") or 0
            cc = d.get("creditCardDebt")
            if cc is not None:
                return f"Your total debt is {total} pounds; credit cards are {cc}."
            return f"Your total debt is {total} pounds."

        # --- SUMMARY ---
        if tool == "finance_summary":
            r = await http.get(f"{FINANCE_API_BASE}/summary"); r.raise_for_status()
            d = r.json()
            bal = d.get("totalBalance")
            debt = d.get("totalDebt")
            return f"Quick summary: balance {bal} pounds, debt {debt}."
    except Exception:
        return "I couldn't reach your finance service right now."
    return "Okay."

# ---------- ROUTES ----------
@app.get("/")
async def root():
    return {"service": "voice-assistant", "status": "up"}

@app.get("/health")
async def health():
    return {"ok": True}

# Mirror GET for quick browser test
@app.get("/voice/connect")
async def voice_connect_get():
    xml = """
<Response>
  <Say>Connection test OK. Speak after the beep.</Say>
  <Gather input="speech" language="en-GB" speechTimeout="auto" action="/voice/handle" method="POST"/>
</Response>"""
    return Response(xml.strip(), media_type="application/xml")

# Existing POST stays as-is
@app.post("/voice/connect")
async def voice_connect_post(request: Request):
    body = await request.body()
    print("📞 /voice/connect POST hit. Raw body:", body[:200])
    xml = """
<Response>
  <Gather input="speech" language="en-GB" speechTimeout="auto"
          action="/voice/handle" method="POST"/>
</Response>"""
    return Response(xml.strip(), media_type="application/xml")

# Simple TwiML test (to isolate Twilio issues)
@app.post("/twiml/test")
async def twiml_test():
    xml = "<Response><Say>Twilio test path is working.</Say><Hangup/></Response>"
    return Response(xml, media_type="application/xml")

@app.post("/voice/handle")
async def voice_handle(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid")
    text = (form.get("SpeechResult") or "").strip()
    if not call_sid:
        return Response("<Response><Hangup/></Response>", media_type="application/xml")
    if not text:
        return Response("<Response><Redirect>/voice/connect</Redirect></Response>", media_type="application/xml")

    SESSIONS["last_utterance"] = text
    msgs = history(call_sid)
    msgs.append({"role": "user", "content": text})

    tool = wants_finance(text)
    if tool:
        if consent_needed(tool) and PENDING_TOOL.get(call_sid) != tool:
            PENDING_TOOL[call_sid] = tool
            reply = "I can check your linked finance data. Do you want me to use it?"
        elif PENDING_TOOL.get(call_sid) == tool and text.lower() in {"yes","yeah","yep","ok","okay","sure","ja"}:
            PENDING_TOOL.pop(call_sid, None)
            reply = await fetch_finance(tool, text)
        elif PENDING_TOOL.get(call_sid) == tool and text.lower() in {"no","nope","nah","nee"}:
            PENDING_TOOL.pop(call_sid, None)
            reply = "No problem, I won't use it."
        elif not consent_needed(tool):
            reply = await fetch_finance(tool, text)
        else:
            reply = "Just say yes if you want me to check."
    else:
        reply = await ask_gpt(msgs)

    msgs.append({"role": "assistant", "content": reply})
    audio_url = await tts_eleven_cached(reply)

    xml = f"""
<Response>
  <Pause length="0.3"/>
  <Play>{audio_url}</Play>
  <Gather input="speech" language="en-GB" speechTimeout="auto"
          action="/voice/handle" method="POST"/>
</Response>"""
    return Response(xml.strip(), media_type="application/xml")

# ---------- MAIN ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
