import json, os, smtplib
from email.message import EmailMessage
from pathlib import Path

items=json.loads(Path("monitor-results/review-required.json").read_text())
if not items:
    raise SystemExit(0)
keys=["SMTP_HOST","SMTP_PORT","SMTP_USERNAME","SMTP_PASSWORD","REVIEW_EMAIL_TO","REVIEW_EMAIL_FROM"]
missing=[k for k in keys if not os.environ.get(k)]
if missing:
    print("Email notification not configured; missing: "+", ".join(missing))
    raise SystemExit(0)
body=["HPP regulatory monitoring requires review.",""]
for p in items:
    body += [
        "Source: "+p["title"],
        "Classification: "+p["classification"],
        "Source URL: "+p.get("sourceUrl",""),
        "Affected rules: "+", ".join(p.get("affectedRuleIds",[])),
        "Affected questions: "+", ".join(p.get("affectedQuestionIds",[])),
        ""
    ]
msg=EmailMessage()
msg["Subject"]="HPP needs review: official-source regulatory change"
msg["From"]=os.environ["REVIEW_EMAIL_FROM"]
msg["To"]=os.environ["REVIEW_EMAIL_TO"]
msg.set_content("\n".join(body))
with smtplib.SMTP(os.environ["SMTP_HOST"],int(os.environ["SMTP_PORT"])) as smtp:
    smtp.starttls()
    smtp.login(os.environ["SMTP_USERNAME"],os.environ["SMTP_PASSWORD"])
    smtp.send_message(msg)
