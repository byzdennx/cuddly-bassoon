epannstream-api/
├── package.json
├── server.js
├── src/
│   ├── config.js
│   ├── app.js
│   ├── core/
│   │   ├── logger.js
│   │   ├── cache.js
│   │   ├── http.js
│   │   ├── response.js
│   │   └── registry.js        <-- AUTO CONNECTION ENGINE
│   ├── middleware/
│   │   └── rate-limit.js
│   ├── routes/
│   │   ├── api.js
│   │   └── pages.js
│   └── scrapers/              <-- DROP FILE BARU DI SINI
│       ├── _TEMPLATE.js       (diabaikan loader, prefix "_")
│       ├── manhwa.js
│       └── anime.js
├── views/
│   ├── partials/{head,nav,footer}.ejs
│   ├── index.ejs
│   ├── docs.ejs
│   ├── playground.ejs
│   ├── status.ejs
│   ├── about.ejs
│   └── error.ejs
└── public/
    ├── css/style.css
    └── js/{main,docs,playground,status}.js