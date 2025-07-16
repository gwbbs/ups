import sys
import json
import requests
from bs4 import BeautifulSoup

class FitgirlSource:
    @staticmethod
    def search_fitgirl(query):
        base_url = "https://fitgirl-repacks.to/"
        search_url = f"{base_url}/search/{query.replace(' ', '+')}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
        }

        try:
            response = requests.get(search_url, headers=headers)
            
            if response.status_code != 200:
                return {"error": f"Request failed with status code: {response.status_code}"}
            
            soup = BeautifulSoup(response.text, "html.parser")
            results = []

            # trova tutti gli articoli con la query imposta
            articles = soup.find_all("article", class_="post")

            for article in articles:
                title_tag = article.find("h1", class_="entry-title").find("a")
                if title_tag:
                    title = title_tag.text.strip()
                    link = title_tag["href"]

                    detail_response = requests.get(link, headers=headers)
                    if detail_response.status_code != 200:
                        continue

                    detail_soup = BeautifulSoup(detail_response.text, "html.parser")
                    download_section = detail_soup.find("div", class_="entry-content")
                    magnet_link = None
                    if download_section:
                        for a_tag in download_section.find_all("a", href=True):
                            href = a_tag['href']
                            if "magnet:?" in href:
                                magnet_link = href
                                break

                    content = detail_soup.find_all("p")
                    original_size = None
                    repack_size = None
                    for p in content:
                        if "Original Size:" in p.text:
                            strong_tag = p.find("strong")
                            if strong_tag:
                                original_size = strong_tag.text.strip()
                        elif "Repack Size:" in p.text:
                            strong_tag = p.find("strong")
                            if strong_tag:
                                repack_size = strong_tag.text.strip()

                    results.append({
                        "title": title,
                        "link": link,
                        "magnet": magnet_link,
                        "originalsize": original_size,
                        "repacksize": repack_size
                    })

            return results
        
        except requests.RequestException as e:
            return {"error": str(e)}

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Missing arguments"}))
        return
        
    query = sys.argv[1]  # passa la source come argomento
    source = sys.argv[2]  # prende la source

    if source == "FitGirl":
        result = FitgirlSource.search_fitgirl(query)
        print(json.dumps(result))  # json dump viene stampato
    else:
        print(json.dumps({"error": "Source not supported"}))

if __name__ == "__main__":
    main()
