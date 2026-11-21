import json
with open('data/signature-authorizations.json', 'r', encoding='utf-8') as f:
    items = json.load(f)
print(f"Total items: {len(items)}")
for i, item in enumerate(items):
    print(f"Item {i}: id={item.get('id')!r} applicant={item.get('applicantName')!r} fileName={item.get('pdfFileName')!r}")
