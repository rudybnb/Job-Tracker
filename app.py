from fastapi import FastAPI
from fastapi.responses import Response

app = FastAPI()

@app.post("/twiml/test")
async def twiml_test():
    xml = """
<Response>
  <Say>Twilio test path is working.</Say>
  <Hangup/>
</Response>"""
    return Response(xml.strip(), media_type="application/xml")
