from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
AES_SECRET_KEY = os.getenv("AES_SECRET_KEY", "").encode()
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")