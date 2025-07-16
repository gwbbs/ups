import sys
import subprocess
import json
import spotdl
from pathlib import Path

def download_spotify_song(spotify_url):
    try:
        download_dir = Path('../downloads/music')
        download_dir.mkdir(exist_ok=True)
        cmd = ["spotdl", "download", spotify_url, "--output", str(download_dir)]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print(json.dumps({"success": True, "message": "Download completato!"}))
        else:
            print(json.dumps({"success": False, "error": result.stderr}))
            
    except FileNotFoundError:
        print(json.dumps({"success": False, "error": "spotdl non installato"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Fornisci un link Spotify"}))
    else:
        spotify_url = sys.argv[1]
        download_spotify_song(spotify_url)
