# spotify.py - Aggiornato per gestire la ricerca
import json
import sys
import os
import yt_dlp
import subprocess
import time
from pathlib import Path

class Youtube:
    @staticmethod
    def search_youtube(query, max_results=10):
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': True,
                'default_search': f'ytsearch{max_results}:'
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                search_results = ydl.extract_info(query, download=False)
                
                results = []
                for entry in search_results.get('entries', []):
                    results.append({
                        'title': entry.get('title', 'Titolo non disponibile'),
                        'artist': entry.get('uploader', 'Artista sconosciuto'),
                        'duration': Youtube._format_duration(entry.get('duration', 0)),
                        'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                        'view_count': entry.get('view_count', 0),
                        'source': 'YouTube'
                    })
                
                return results
                
        except Exception as e:
            print(f"DEBUG: Errore nella ricerca: {str(e)}", file=sys.stderr)
            return []

    @staticmethod
    def download_song(query, quality="192K"):
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            download_dir = os.path.abspath(os.path.join(current_dir, '..', 'downloads', 'music'))
            os.makedirs(download_dir, exist_ok=True)
            
            cmd = f'yt-dlp "{query}" --extract-audio --audio-format mp3 --audio-quality {quality} --embed-metadata --output "{download_dir}/%(artist)s - %(title)s.%(ext)s"'
            
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            
            if result.returncode == 0:
                return {"success": True, "message": f"Download MP3 completato!"}
            else:
                if "429" in result.stderr or "rate limit" in result.stderr.lower():
                    time.sleep(30)
                    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
                    if result.returncode == 0:
                        return {"success": True, "message": "Download completato dopo retry"}
                
                return {"success": False, "error": result.stderr or "Errore sconosciuto"}
                
        except Exception as e:
            return {"success": False, "error": str(e)}

    @staticmethod
    def _format_duration(seconds):
        if not seconds:
            return "N/A"
        mins, secs = divmod(int(seconds), 60)
        return f"{mins}:{secs:02d}"

def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            'error': 'Parametri insufficienti'
        }))
        return
    
    query = sys.argv[1]
    action = sys.argv[2]
    
    print(f"DEBUG: Query='{query}', Action='{action}'", file=sys.stderr)
    
    if action == 'search':
        results = Youtube.search_youtube(query)
        print(json.dumps(results))
        
    elif action == 'download':
        result = Youtube.download_song(query)
        print(json.dumps(result))
        
    else:
        print(json.dumps({
            'error': 'Azione non supportata'
        }))

if __name__ == "__main__":
    main()
