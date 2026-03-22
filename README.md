# BT Chat — Frontend

A production-ready, real-time chat frontend for Flask + Socket.IO.

---

## Project Structure

```
├── templates/
│   ├── index.html        Main single-page application
│   ├── base.html         Jinja2 base template
│   └── error.html        Error page
├── static/
│   ├── css/
│   │   └── style.css     Complete stylesheet (dark/light theme)
│   └── js/
│       ├── app.js         Main application logic
│       ├── audio.js       Web Audio API sound notifications
│       └── emoji-picker.js Lightweight emoji picker
└── README.md
```

---

## Quick Start

### 1. Copy files into your Flask project

```
your_flask_app/
├── app.py               (your existing backend)
├── templates/           ← copy all templates here
└── static/              ← copy css/ and js/ here
```

### 2. Register the index route in Flask

```python
from flask import render_template

@app.route('/')
def index():
    return render_template('index.html')

@app.errorhandler(404)
def not_found(e):
    return render_template('error.html',
        error_code=404,
        error_title='Page Not Found',
        error_message='The page you requested does not exist.'
    ), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('error.html',
        error_code=500,
        error_title='Server Error',
        error_message='An internal error occurred.'
    ), 500
```

### 3. Configure the backend URL (if needed)

By default `app.js` uses `window.location.origin`, so if the frontend and backend are on the same host/port it will work automatically.

To point to a different backend, edit the top of `static/js/app.js`:

```js
const BACKEND_URL = 'https://your-backend-host.com';
```

### 4. Run your Flask app

```bash
python app.py
# or
flask run
```

Then open `http://localhost:5000` in your browser.

---

## Features

| Feature | Status |
|---|---|
| User registration & login | ✅ |
| Real-time messaging (Socket.IO) | ✅ |
| Friend requests (send / accept / reject) | ✅ |
| Remove / block friends | ✅ |
| Online / offline presence | ✅ |
| Typing indicators | ✅ |
| Message read receipts | ✅ |
| Chat history with pagination | ✅ |
| User search with debounce | ✅ |
| Unread message counters | ✅ |
| In-chat message search | ✅ |
| Emoji picker | ✅ |
| Sound notifications (Web Audio API) | ✅ |
| Dark / light theme toggle | ✅ |
| Mobile responsive | ✅ |
| Voice / video call placeholders | ✅ (UI only) |
| Draft saving (localStorage) | ✅ |
| XSS prevention | ✅ |
| Connection status bar | ✅ |
| Toast notifications | ✅ |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |

---

## Browser Support

Tested in: Chrome 110+, Firefox 110+, Safari 16+, Edge 110+

Requires: ES2020, Web Audio API, CSS custom properties, Flexbox.

---

## Customisation

### Change the accent color

Edit the CSS variable in `static/css/style.css`:

```css
:root {
  --accent-primary: #38bdf8;   /* cyan */
  --accent-violet:  #818cf8;   /* violet */
}
```

### Change the backend URL

Edit the constant in `static/js/app.js`:

```js
const BACKEND_URL = 'http://localhost:5000';
```

### Adjust message pagination size

```js
const MSG_PAGE_SIZE = 40;  // messages per page
```

---

## Security Notes

- All user-generated content is HTML-escaped via `escHtml()` before insertion into the DOM — no `innerHTML` with raw user data.
- Sessions are stored in `localStorage` as the user's BT ID only (no tokens managed client-side beyond what the server provides).
- For production, add HTTPS and set appropriate CORS / CSP headers on the Flask backend.
