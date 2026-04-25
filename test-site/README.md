# AI Safe Link — local test pages

Static HTML only (no malware, no real phishing). External links use reserved documentation hosts ([RFC 2606](https://www.rfc-editor.org/rfc/rfc2606.html)) such as `example.com`.

## Serve

From this directory:

```bash
cd test-site
python3 -m http.server 8765 --bind 127.0.0.1
```

Open:

- http://127.0.0.1:8765/ — index (links to all scenarios)
- http://127.0.0.1:8765/dense-links.html — many links in a scrollable column
- http://127.0.0.1:8765/deceptive-labels.html — urgent copy; all destinations benign
- http://127.0.0.1:8765/edge-cases.html — mailto, tel, fragments, repeated hrefs

Then load the Chrome extension, run the backend if you want full pipeline analysis, and hover links to trigger lazy analysis.
