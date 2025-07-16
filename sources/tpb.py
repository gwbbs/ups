import sys
import json
import requests
from bs4 import BeautifulSoup
import time
import random

class TPBSource:
    @staticmethod
    def search_tpb(query):
        base_url = "https://1.piratebays.to/s/"
        search_url = f"{base_url}?q={query.replace(' ', '+')}"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        
        try:
            # Aggiungi delay casuale per evitare rate limiting
            time.sleep(random.uniform(0.5, 1.5))
            
            response = requests.get(search_url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                return {"error": f"Request failed with status code: {response.status_code}"}
            
            soup = BeautifulSoup(response.text, "html.parser")
            results = []
            
            # Cerca i link magnet con gestione errori robusta
            magnet_tags = soup.find_all("a", href=True, title="Download this torrent using magnet")
            
            if not magnet_tags:
                return {"error": "No magnet links found on page"}
            
            for i, magnet_tag in enumerate(magnet_tags):
                if i >= 20:  # Limita a 20 risultati per evitare spam
                    break
                
                try:
                    # Trova il titolo con fallback
                    title_tag = magnet_tag.find_previous("a", class_="detLink")
                    title = title_tag.text.strip() if title_tag else f"Unknown Title {i+1}"
                    
                    # Trova l'uploader con gestione errori
                    uploader = "Unknown"
                    try:
                        parent_tr = magnet_tag.find_parent("tr")
                        if parent_tr:
                            uploader_cell = parent_tr.find_all("td")[7] if len(parent_tr.find_all("td")) > 7 else None
                            if uploader_cell:
                                uploader_tag = uploader_cell.find("a")
                                if uploader_tag:
                                    uploader = uploader_tag.text.strip()
                    except (IndexError, AttributeError):
                        pass
                    
                    # Trova le statistiche con gestione errori
                    size = "N/A"
                    seeders = "0"
                    leechers = "0"
                    
                    try:
                        parent_tr = magnet_tag.find_parent("tr")
                        if parent_tr:
                            stats_cells = parent_tr.find_all("td")
                            if len(stats_cells) >= 7:
                                size = stats_cells[4].text.strip() if stats_cells[4] else "N/A"
                                seeders = stats_cells[5].text.strip() if stats_cells[5] else "0"
                                leechers = stats_cells[6].text.strip() if stats_cells[6] else "0"
                    except (IndexError, AttributeError):
                        pass
                    
                    # Verifica che il magnet link sia valido
                    magnet_link = magnet_tag.get("href", "")
                    if not magnet_link.startswith("magnet:"):
                        continue
                    
                    results.append({
                        "title": title,
                        "magnet": magnet_link,
                        "uploader": uploader,
                        "seeders": seeders,
                        "leechers": leechers,
                        "size": size
                    })
                
                except Exception as e:
                    # Continua con il prossimo risultato se questo fallisce
                    continue
            
            if not results:
                return {"error": "No valid results found"}
            
            return results
        
        except requests.exceptions.Timeout:
            return {"error": "Request timeout - server too slow"}
        except requests.exceptions.ConnectionError:
            return {"error": "Connection error - check internet connection"}
        except requests.RequestException as e:
            return {"error": f"Request error: {str(e)}"}
        except Exception as e:
            return {"error": f"Unexpected error: {str(e)}"}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
        return
        
    query = sys.argv[1]
    source = sys.argv[2]

    if source == "TPB":
        result = TPBSource.search_tpb(query)
        print(json.dumps(result))
    else:
        print(json.dumps({"error": "Source not supported"}))

if __name__ == "__main__":
    main()
