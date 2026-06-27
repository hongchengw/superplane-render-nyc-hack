import express from 'express';
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (_) {}
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.post('/api/render', (req, res) => {
  const { markdown } = req.body;
  if (typeof markdown !== 'string') {
    return res.status(400).json({ error: 'markdown field is required' });
  }
  const html = marked.parse(markdown);
  res.json({ html });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Markdown Render POC running on port ${PORT}`);
});
