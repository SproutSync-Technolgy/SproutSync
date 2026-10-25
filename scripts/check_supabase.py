import urllib.request
import json

url = "https://egbocohxklbefxcewtlg.supabase.co/rest/v1/users?select=id,email,display_name,role"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYm9jb2h4a2xiZWZ4Y2V3dGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NzAwMzcsImV4cCI6MjEwODE0NjAzN30.iakK-ZyM_ScuyBJ8SXqlU09JCtByXGw1TX-iu6qWQoA",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYm9jb2h4a2xiZWZ4Y2V3dGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NzAwMzcsImV4cCI6MjEwODE0NjAzN30.iakK-ZyM_ScuyBJ8SXqlU09JCtByXGw1TX-iu6qWQoA"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as resp:
        print("Status:", resp.status)
        data = json.loads(resp.read().decode())
        print("Users in DB:", json.dumps(data, indent=2))
except Exception as e:
    print("Error querying Supabase REST API:", e)
