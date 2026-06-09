# MedAI App

Static chat page plus one serverless function. The API key stays server-side.

## Files and where they go

```
medai-app/
  index.html        <- the chat page (open onboarding, calls /api/chat)
  api/
    chat.js         <- serverless function. Holds the key. Calls Anthropic.
  prompt.js         <- the MedAI system prompt
  knowledge.json    <- verified guidance
  package.json
```

Keep chat.js inside a folder named exactly "api". Vercel turns it into the
endpoint /api/chat automatically.

## Deploy (no terminal needed)

1. Anthropic key. Go to console.anthropic.com, create an API key, and set a
   spend limit of about 25 dollars. Copy the key. Do not paste it into any file.
2. GitHub. Create a new repository. Upload all the files above, keeping the api
   folder structure.
3. Vercel. Go to vercel.com, sign in with GitHub, New Project, import the repo.
4. Before deploying, open Environment Variables and add:
   Name: ANTHROPIC_API_KEY
   Value: your key
5. Deploy. Vercel gives you a live URL.
6. Open the URL and test with cases from test_cases.md.

## To change the model

Edit MODEL at the top of api/chat.js. Confirm the current model string in your
Anthropic console. Redeploy by pushing the change to GitHub.

## Notes

- The browser never sees the key. It calls /api/chat on your own domain. The
  function adds the key and calls Anthropic.
- Onboarding is scripted in index.html. Everything after, the active stage, is
  handled by the model through the system prompt.
- No database. Conversation lives in the browser for the session only.
