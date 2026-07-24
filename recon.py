import requests
from bs4 import BeautifulSoup
import json

base_url = "https://urja-ops.flockenergy.tech"

print("--- GET /login ---")
session = requests.Session()
response = session.get(f"{base_url}/login")
print(f"Status Code: {response.status_code}")
print("Cookies:", session.cookies.get_dict())

soup = BeautifulSoup(response.text, 'html.parser')
form = soup.find('form')
if form:
    print("Form found:")
    print("Action:", form.get('action'))
    print("Method:", form.get('method'))
    inputs = form.find_all('input')
    for inp in inputs:
        print(f"  Input: {inp.get('name')} (type: {inp.get('type')}, value: {inp.get('value')})")
else:
    print("No form found.")

print("\n--- Attempting Login ---")
login_data = {
    "username": "operator@urja.local",
    "password": "urja-ops-2026"
}
# Find any hidden fields like CSRF
if form:
    for inp in inputs:
        if inp.get('type') == 'hidden' and inp.get('name'):
            login_data[inp.get('name')] = inp.get('value', '')

response = session.post(f"{base_url}/login", data=login_data, allow_redirects=False)
print(f"Status Code: {response.status_code}")
print("Headers:", dict(response.headers))
print("Cookies:", session.cookies.get_dict())

if response.status_code in [302, 303]:
    redirect_url = response.headers.get('Location')
    if redirect_url:
        print(f"\n--- Follow Redirect to {redirect_url} ---")
        response = session.get(base_url + redirect_url if redirect_url.startswith('/') else redirect_url)
        print(f"Status Code: {response.status_code}")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        print("Title:", soup.title.string if soup.title else 'No title')
        
        # Let's see what links/endpoints exist on the dashboard
        links = soup.find_all('a')
        print("Dashboard Links:")
        for a in links[:10]: # Print first 10
            print(f"  {a.get('href')} : {a.text.strip()}")

