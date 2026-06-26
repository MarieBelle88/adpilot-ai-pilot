from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import json

app = FastAPI()

# Allows your Lovable app to talk to your Daytona backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "sandbox_data/google_ads_db.json"

def read_sandbox():
    with open(DATA_FILE, "r") as f:
        return json.load(f)

def write_sandbox(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.get("/api/snapshot")
def get_campaign_snapshot():
    """Returns the current state of the Google Ads sandbox"""
    return read_sandbox()

@app.post("/api/action/pause-keyword")
def pause_keyword(keyword_id: str):
    """Simulates mutating the Google Ads state"""
    data = read_sandbox()
    for kw in data["keywords"]:
        if kw["id"] == keyword_id:
            kw["status"] = "PAUSED"
            write_sandbox(data)
            return {"status": "success", "message": f"Keyword {kw['text']} paused in sandbox."}
    return {"status": "error", "message": "Keyword not found"}