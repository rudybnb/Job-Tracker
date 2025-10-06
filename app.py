import os, pathlib, hashlib, re
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
    if re.search(r"\b(balance|bank|barclay|barclays|account)\b", t):
        return "finance_balance"
    if re.search(r"\bdebt|owe|credit card\b", t):
        return "finance_debt"
    if re.search(r"\bsummary|finances|money overview\b", t):
        return "finance_summary"
    return None

async def fetch_finance(tool: str) -> str:
    if not FINANCE_API_BASE:
        return "Your finance data endpoint isn't configured."
    try:
        endpoint = tool.split('_')[1]
        r = await http.get(f"{FINANCE_API_BASE}/{endpoint}")
        if r.status_code != 200:
            return f"Finance API returned {r.status_code}"
        
        response = r.json()
        data = response.get("data", response)
        
        if tool == "finance_balance":
            total = data.get("totalBalance") or data.get("balance") or 0
            bank = (data.get("primaryAccount") or {}).get("bankName", "")
            return f"Your current balance is {total} pounds{f' at {bank}' if bank else ''}."
        elif tool == "finance_debt":
            total = data.get("totalDebt") or 0
            cc = data.get("creditCardDebt")
            if cc is not None:
                return f"Your total debt is {total} pounds; credit cards are {cc}."
            return f"Your total debt is {total} pounds."
        elif tool == "finance_summary":
            bal = data.get("totalBalance")
            debt = data.get("totalDebt")
            return f"Quick summary: balance {bal} pounds, debt {debt}."
    except Exception as e:
        return "I couldn't reach your finance data right now."
    return "Okay."

def consent_needed(tool: str) -> bool:
    if USE_TOOLS == "on": return False
    if USE_TOOLS == "off": return True
    return True  # ask mode

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

# ---------- ROUTES ----------
@app.get("/health")
async def health(): return {"ok": True}

@app.post("/voice/connect")
async def voice_connect(request: Request):
    xml = """
<Response>
  <Gather input="speech" language="en-GB" speechTimeout="auto"
          action="/voice/handle" method="POST"/>
</Response>"""
    return Response(xml.strip(), media_type="application/xml")

@app.post("/voice/handle")
async def voice_handle(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid")
    text = (form.get("SpeechResult") or "").strip()
    if not call_sid:
        return Response("<Response><Hangup/></Response>", media_type="application/xml")
    if not text:
        return Response("<Response><Redirect>/voice/connect</Redirect></Response>", media_type="application/xml")

    msgs = history(call_sid)
    msgs.append({"role": "user", "content": text})

    # Intent detection for finance
    tool = wants_finance(text)
    if tool:
        if consent_needed(tool) and PENDING_TOOL.get(call_sid) != tool:
            PENDING_TOOL[call_sid] = tool
            reply = "I can check your linked finance data. Do you want me to use it?"
        elif PENDING_TOOL.get(call_sid) == tool and text.lower() in {"yes","yeah","yep","ok","okay","sure","ja"}:
            PENDING_TOOL.pop(call_sid, None)
            reply = await fetch_finance(tool)
        elif PENDING_TOOL.get(call_sid) == tool and text.lower() in {"no","nope","nah","nee"}:
            PENDING_TOOL.pop(call_sid, None)
            reply = "No problem, I won't use it."
        elif not consent_needed(tool):
            reply = await fetch_finance(tool)
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
