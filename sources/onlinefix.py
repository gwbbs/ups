import sys
import json
import requests
from bs4 import BeautifulSoup
import os
from urllib.parse import urljoin, urlparse
import re
import io

class OnlineFixSimple:
    def __init__(self):
        self.session = requests.Session()
        self.base_url = "https://online-fix.me"
        self.logged_in = False
        self.username = None
        self.password = None
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
            "Accept-Charset": "utf-8",
            "Accept-Encoding": "gzip, deflate"
        })

        if sys.stdout.encoding is None or sys.stdout.encoding.lower() != "utf-8":
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    def _detect_encoding(self, resp):
        encoding = resp.apparent_encoding
        search = re.search(r'<meta.*charset=["\']?([\w-]+)["\']?', resp.text, re.I)
        if search:
            encoding_html = search.group(1)
            try:
                resp.encoding = encoding_html
            except Exception:
                pass
        else:
            resp.encoding = encoding
        return resp

    def login(self, username, password):
        self.username = username
        self.password = password
        try:
            login_data = {
                'login_name': username,
                'login_password': password,
                'login': 'submit'  # <-- corretto dal form HTML
            }
            resp = self.session.post(f"{self.base_url}/index.php", data=login_data)
            resp = self._detect_encoding(resp)
            homepage = self.session.get(self.base_url)
            homepage = self._detect_encoding(homepage)

            if username in homepage.text or any(
                ind in homepage.text.lower() for ind in [
                    'выход', 'logout', 'личный кабинет', 'profile', 'exit']):
                self.logged_in = True
                return True
            return False
        except Exception as e:
            print(f"[DEBUG] Errore login: {e}", file=sys.stderr)
            return False

    def search_games(self, query):
        try:
            search_url = f"{self.base_url}/index.php"
            params = {
                'do': 'search',
                'subaction': 'search',
                'story': query
            }
            resp = self.session.get(search_url, params=params)
            resp = self._detect_encoding(resp)
            soup = BeautifulSoup(resp.text, 'html.parser')
            links = soup.find_all('a', href=True)
            results = []
            for link in links:
                href = link.get('href')
                title = link.get_text(strip=True)
                if href and '.html' in href and title and query.lower() in title.lower():
                    full_url = urljoin(self.base_url, href)
                    results.append({
                        'title': title,
                        'url': full_url,
                        'description': f'Gioco: {title}',
                        'source': 'OnlineFix'
                    })
            filtered = []
            seen = set()
            for r in results:
                if r['url'] not in seen:
                    filtered.append(r)
                    seen.add(r['url'])
            return filtered[:15]
        except Exception as e:
            return {"error": f"Errore durante la ricerca: {str(e)}"}

    def download_torrent(self, game_url):
        if not self.logged_in:
            return {"error": "Login richiesto per il download"}
        try:
            resp = self.session.get(game_url)
            resp = self._detect_encoding(resp)
            soup = BeautifulSoup(resp.text, 'html.parser')
            trovato = None
            for a in soup.find_all('a', href=True):
                testo = a.get_text(strip=True).lower()
                href = a['href']
                if 'скачать' in testo and 'torrent' in testo and 'torrents' in href:
                    trovato = href
                    break
                if 'uploads.online-fix.me' in href and '/torrents/' in href:
                    trovato = href
                    break
            if not trovato:
                match = re.search(r'https://uploads\.online-fix\.me:2053/torrents/[^\s"\'<>]+', resp.text)
                if match:
                    trovato = match.group(0)
            if trovato:
                return self._handle_torrent_page(trovato)
        except Exception as e:
            return {"error": f"Errore: {str(e)}"}

    def _handle_torrent_page(self, link):
        resp = self.session.get(link)
        resp = self._detect_encoding(resp)
        soup = BeautifulSoup(resp.text, 'html.parser')
        for a in soup.find_all('a', href=True):
            if a['href'].endswith('.torrent'):
                torrent_url = urljoin(link, a['href'])
                filename = os.path.basename(urlparse(torrent_url).path)
                filepath = os.path.join(os.getcwd(), filename)
                file_resp = self.session.get(torrent_url)
                with open(filepath, 'wb') as f:
                    f.write(file_resp.content)
                return {
                    'success': True,
                    'message': 'Torrent scaricato con successo',
                    'file_path': filepath
                }
        return {"error": "File .torrent non trovato nella directory"}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Parametri mancanti"}))
        return
    query = sys.argv[1]
    action = sys.argv[2]
    username = sys.argv[3] if len(sys.argv) > 3 else None
    password = sys.argv[4] if len(sys.argv) > 4 else None
    scraper = OnlineFixSimple()
    if username and password:
        if not scraper.login(username, password):
            print(json.dumps({"error": "Login fallito - username non trovato nella pagina"}))
            return
    if action == 'search':
        results = scraper.search_games(query)
        print(json.dumps(results, ensure_ascii=False))
    elif action == 'download':
        if not scraper.logged_in:
            print(json.dumps({"error": "Login richiesto per download"}))
            return
        result = scraper.download_torrent(query)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"error": "Azione non supportata"}))

if __name__ == "__main__":
    main()
